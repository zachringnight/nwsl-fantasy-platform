#!/usr/bin/env python3
"""Fetch, validate, audit, and optionally publish official NWSL 2026 data.

This is the public-data boundary for the website.  It deliberately fails closed:
an incomplete official API refresh is never written or published.  Provider IDs
remain exact, while values used by the application are normalized into a small,
typed contract.  Rich player match statistics are retained as compact JSON
objects; no match statistic is estimated.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import re
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


API_ROOT = "https://api-sdp.nwslsoccer.com/v1/nwsl/football"
SEASON = 2026
SEASON_ID = "nwsl::Football_Season::0b6761e4701749f593690c0f338da74c"
DEFAULT_PUBLISH_URL = "https://nwsl-fantasy-platform.vercel.app/api/nwsl-data/publish"
DEFAULT_SECRET_ENV = "NWSL_DATA_PUBLISH_SECRET"
KEYCHAIN_SERVICE = "nwsl-data-publish"

PLAYER_CATEGORIES = ("general", "passing", "defending", "goalkeeping")
TEAM_CATEGORIES = ("general", "attacking", "passing", "defending")

MODEL_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = MODEL_ROOT.parent
DEFAULT_OUTPUT = MODEL_ROOT / "data/nwsl-official/nwsl_2026_public_data.json"
sys.path.insert(0, str(MODEL_ROOT))

from src.publishing.http import PublicationError, publish_with_readback  # noqa: E402

OFFICIAL_PLAYER_ID = re.compile(r"^nwsl::Football_Player::[0-9a-f]{32}$")
OFFICIAL_TEAM_ID = re.compile(r"^nwsl::Football_Team::[0-9a-f]{32}$")
OFFICIAL_MATCH_ID = re.compile(r"^nwsl::Football_Match::[0-9a-f]{32}$")
OFFICIAL_SEASON_ID = re.compile(r"^nwsl::Football_Season::[0-9a-f]{32}$")
ROUTE_PLAYER_ID = re.compile(r"^[0-9a-f]{32}$")

RAW_STATS_LIMIT = 400
MAX_RESPONSE_BYTES = 25_000_000

# Vercel caps function request bodies at 4.5 MB. Season rows already expose
# their display values as typed fields, so their rawStats remain empty. Match
# rows retain only non-zero canonical scoring details that do not have typed
# columns; this preserves match writeups without republishing the provider's
# hundreds of mostly-zero fields.
PUBLISHED_SEASON_RAW_STATS_KEYS: set[str] = set()
PUBLISHED_RAW_STATS_KEYS: set[str] = {
    "successful_crosses",
    "fouls_won",
    "fouls_committed",
    "blocks",
    "clean_sheet",
    "penalty_saves",
    "penalty_misses",
    "penalty_conceded",
    "own_goals",
    "goalkeeper_win",
    "goalkeeper_draw",
}

# Keep this in lockstep with src/lib/scoring/scoring-rules.ts.  The data
# publication contains the scoring output and an itemized breakdown so a
# scoring change is reviewable rather than hidden in an aggregate.
FANTASY_RULES: dict[str, Any] = {
    "appearance": 1.0,
    "minutes60Plus": 1.0,
    "goal": {"GK": 10.0, "DEF": 10.0, "MID": 8.0, "FWD": 8.0},
    "assist": 5.0,
    "shot": 0.5,
    "shotOnTarget": 2.0,
    "chanceCreated": 1.0,
    "successfulPass": 0.03,
    "successfulCross": 0.5,
    "foulWon": 0.5,
    "foulCommitted": -0.5,
    "tackleWon": 0.75,
    "interception": 0.5,
    "block": 1.0,
    "cleanSheet": {"GK": 6.0, "DEF": 3.0, "MID": 0.0, "FWD": 0.0},
    "save": 1.5,
    "goalsConceded": {"GK": -2.0, "DEF": -0.5, "MID": 0.0, "FWD": 0.0},
    "yellowCard": -2.0,
    "redCard": -5.0,
    "penaltySave": 3.0,
    "penaltyMiss": -4.0,
    "penaltyConceded": -1.0,
    "ownGoal": -4.0,
    "goalkeeperWin": 4.0,
    "goalkeeperDraw": 2.0,
}


class RefreshError(RuntimeError):
    """Base class for a refresh that must not be published."""


class FetchError(RefreshError):
    """An official API request failed after the bounded retry policy."""


class DataValidationError(RefreshError):
    """The fetched snapshot violates the public-data contract."""


@dataclass(frozen=True)
class ValidationLimits:
    exact_teams: int = 16
    min_players: int = 440
    min_matches: int = 240
    min_player_season_stats: int = 430
    max_payload_bytes: int = 4_400_000


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(value: datetime) -> str:
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: Any, *, field: str) -> datetime:
    text = str(value or "").strip()
    if not text:
        raise DataValidationError(f"{field} is missing")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DataValidationError(f"{field} is not an ISO timestamp: {text!r}") from exc
    if parsed.tzinfo is None:
        raise DataValidationError(f"{field} must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def _official_id(value: Any, pattern: re.Pattern[str], *, field: str) -> str:
    result = str(value or "").strip()
    if not pattern.fullmatch(result):
        raise DataValidationError(f"{field} is not a valid official ID: {result!r}")
    return result


def _player_route_id(official_id: str) -> str:
    suffix = official_id.rsplit("::", 1)[-1]
    if not ROUTE_PLAYER_ID.fullmatch(suffix):
        raise DataValidationError(f"player ID has an invalid route suffix: {official_id!r}")
    return suffix


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _date_only(value: Any, *, field: str) -> str | None:
    text = _text(value)
    if text is None:
        return None
    candidate = text[:10]
    try:
        datetime.strptime(candidate, "%Y-%m-%d")
        if len(text) > 10:
            _parse_timestamp(text, field=field)
    except (DataValidationError, ValueError) as exc:
        raise DataValidationError(f"{field} is not a valid date: {text!r}") from exc
    return candidate


def _slugify(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    if not slug:
        raise DataValidationError(f"could not generate a route slug from {value!r}")
    return slug


def _stat_key(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", text)
    text = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_").lower()
    return text[:120]


def _typed_stat_value(value: Any) -> int | float | str | bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise DataValidationError("official stat contains a non-finite number")
        return int(value) if value.is_integer() else value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            parsed = float(stripped)
        except ValueError:
            return stripped[:1000]
        if not math.isfinite(parsed):
            raise DataValidationError("official stat contains a non-finite number")
        return int(parsed) if parsed.is_integer() else parsed
    raise DataValidationError(f"unsupported official stat value type: {type(value).__name__}")


def _stats_object(
    stats: Iterable[Mapping[str, Any]],
    *,
    collision_prefix: str | None = None,
) -> dict[str, int | float | str | bool | None]:
    """Compact an official stats array without losing conflicting values."""

    result: dict[str, int | float | str | bool | None] = {}
    collisions: defaultdict[str, int] = defaultdict(int)
    for stat in stats or []:
        key = _stat_key(stat.get("statsId") or stat.get("statsLabel"))
        if not key:
            continue
        value = _typed_stat_value(stat.get("statsValue"))
        if key not in result:
            result[key] = value
            continue
        if result[key] == value:
            continue
        collisions[key] += 1
        if collision_prefix:
            alternate = f"{collision_prefix}__{key}"
        else:
            alternate = f"{key}__{collisions[key] + 1}"
        while alternate in result and result[alternate] != value:
            collisions[key] += 1
            alternate = f"{alternate}_{collisions[key] + 1}"
        result[alternate] = value
    if len(result) > RAW_STATS_LIMIT:
        raise DataValidationError(
            f"official stats row has {len(result)} fields; maximum is {RAW_STATS_LIMIT}"
        )
    return dict(sorted(result.items()))


def _merge_stats(
    target: dict[str, int | float | str | bool | None],
    incoming: Mapping[str, int | float | str | bool | None],
    *,
    category: str,
) -> None:
    for key, value in incoming.items():
        if key not in target:
            target[key] = value
        elif target[key] != value:
            alternate = f"{category}__{key}"
            suffix = 2
            while alternate in target and target[alternate] != value:
                alternate = f"{category}__{key}_{suffix}"
                suffix += 1
            target[alternate] = value
    if len(target) > RAW_STATS_LIMIT:
        raise DataValidationError(
            f"merged official stats row has {len(target)} fields; maximum is {RAW_STATS_LIMIT}"
        )


def _compact_raw_stats(
    raw: Mapping[str, int | float | str | bool | None],
    allowed: set[str],
) -> dict[str, int | float | str | bool | None]:
    compact: dict[str, int | float | str | bool | None] = {}
    for key in sorted(allowed.intersection(raw)):
        value = raw[key]
        if value is None or value is False:
            continue
        if not isinstance(value, bool) and isinstance(value, (int, float)) and value == 0:
            continue
        compact[key] = value
    return compact


def _number(
    raw: Mapping[str, Any],
    aliases: Sequence[str],
    *,
    default: float | None = 0.0,
) -> float | None:
    for alias in aliases:
        value = raw.get(_stat_key(alias))
        if value is None or isinstance(value, bool):
            continue
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(parsed):
            return parsed
    return default


def _integer(
    raw: Mapping[str, Any],
    aliases: Sequence[str],
    *,
    default: int = 0,
) -> int:
    value = _number(raw, aliases, default=float(default))
    if value is None:
        return default
    rounded = round(value)
    if abs(value - rounded) > 1e-8 or rounded < 0:
        raise DataValidationError(
            f"official count {aliases[0]!r} is not a non-negative integer: {value}"
        )
    return int(rounded)


def _metric(
    raw: Mapping[str, Any],
    aliases: Sequence[str],
    *,
    default: float = 0.0,
) -> float:
    value = _number(raw, aliases, default=default)
    if value is None or value < 0:
        raise DataValidationError(f"official metric {aliases[0]!r} is invalid: {value}")
    return float(value)


def _nullable_metric(raw: Mapping[str, Any], aliases: Sequence[str]) -> float | None:
    value = _number(raw, aliases, default=None)
    if value is None:
        return None
    if value < 0:
        # Expected-goal efficiency can be negative, expected goals cannot.
        return None
    return float(value)


def _percentage(raw: Mapping[str, Any], aliases: Sequence[str]) -> float | None:
    value = _number(raw, aliases, default=None)
    if value is None:
        return None
    if value < 0 or value > 100:
        raise DataValidationError(f"official percentage {aliases[0]!r} is out of range")
    return float(value)


def _sum_exact(raw: Mapping[str, Any], aliases: Sequence[str]) -> float | None:
    values: list[float] = []
    for alias in aliases:
        key = _stat_key(alias)
        if key not in raw or raw[key] is None or isinstance(raw[key], bool):
            return None
        try:
            values.append(float(raw[key]))
        except (TypeError, ValueError):
            return None
    result = sum(values)
    return result if math.isfinite(result) else None


def _status(value: Any) -> str:
    normalized = str(value or "").strip().upper().replace(" ", "_")
    aliases = {
        "SCHEDULED": "UPCOMING",
        "NOT_STARTED": "UPCOMING",
        "PRE_MATCH": "UPCOMING",
        "PLAYING": "LIVE",
        "IN_PLAY": "LIVE",
        "FULL_TIME": "FINISHED",
        "PLAYED": "FINISHED",
        "CANCELLED": "CANCELED",
        "ABANDONED": "CANCELED",
    }
    normalized = aliases.get(normalized, normalized)
    allowed = {"UPCOMING", "LIVE", "FINISHED", "POSTPONED", "CANCELED"}
    if normalized not in allowed:
        raise DataValidationError(f"unsupported official match status: {value!r}")
    return normalized


def _position(role_label: Any, role: Any = None) -> str:
    label = str(role_label or "").strip().lower()
    if "goal" in label or str(role) == "1":
        return "GK"
    if "def" in label or str(role) == "2":
        return "DEF"
    if "mid" in label or str(role) == "3":
        return "MID"
    if "forw" in label or "striker" in label or str(role) == "4":
        return "FWD"
    raise DataValidationError(f"unsupported official player position: {role_label!r}/{role!r}")


def _player_status(value: Any) -> str:
    normalized = str(value or "").strip().lower().replace(" ", "_")
    if normalized == "active":
        return "active"
    if normalized in {"left_team", "left"}:
        return "left_team"
    raise DataValidationError(f"unsupported official player status: {value!r}")


def _jersey_number(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        number = int(str(value).strip())
    except ValueError as exc:
        raise DataValidationError(f"invalid jersey number: {value!r}") from exc
    if number < 0 or number > 999:
        raise DataValidationError(f"jersey number is out of range: {number}")
    return number


def _retry_delay(url: str, attempt: int, *, base_delay: float, max_delay: float) -> float:
    """Deterministic exponential backoff with URL-specific deterministic jitter."""

    digest = hashlib.sha256(f"{url}|{attempt}".encode("utf-8")).digest()
    jitter_fraction = int.from_bytes(digest[:8], "big") / float(2**64 - 1)
    exponential = base_delay * (2**attempt)
    return min(max_delay, exponential + base_delay * 0.25 * jitter_fraction)


class OfficialApiClient:
    """Small official API client with bounded, deterministic retries."""

    def __init__(
        self,
        *,
        timeout: float = 30.0,
        max_attempts: int = 6,
        base_delay: float = 1.0,
        max_delay: float = 16.0,
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        self.timeout = timeout
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self._opener = opener
        self._sleep = sleep

    def get_json(self, url: str) -> dict[str, Any]:
        last_error: BaseException | None = None
        for attempt in range(self.max_attempts):
            request = urllib.request.Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "nwsl-public-data-refresh/1.0",
                },
            )
            try:
                with self._opener(request, timeout=self.timeout) as response:
                    status = int(getattr(response, "status", 200))
                    if status == 429 or 500 <= status <= 599:
                        raise urllib.error.HTTPError(url, status, "retryable", {}, None)
                    if status >= 400:
                        raise FetchError(f"official API returned HTTP {status}")
                    raw = response.read(MAX_RESPONSE_BYTES + 1)
                    if len(raw) > MAX_RESPONSE_BYTES:
                        raise FetchError("official API response exceeded the safety limit")
                decoded = json.loads(raw.decode("utf-8"))
                if not isinstance(decoded, dict):
                    raise FetchError("official API response was not a JSON object")
                return decoded
            except urllib.error.HTTPError as exc:
                if exc.code != 429 and not 500 <= exc.code <= 599:
                    raise FetchError(f"official API returned HTTP {exc.code}") from exc
                last_error = exc
            except (
                TimeoutError,
                socket.timeout,
                ssl.SSLError,
                urllib.error.URLError,
            ) as exc:
                last_error = exc

            if attempt + 1 < self.max_attempts:
                self._sleep(
                    _retry_delay(
                        url,
                        attempt,
                        base_delay=self.base_delay,
                        max_delay=self.max_delay,
                    )
                )

        error_name = type(last_error).__name__ if last_error is not None else "unknown error"
        raise FetchError(
            f"official API request failed after {self.max_attempts} attempts ({error_name})"
        ) from last_error


def _api_url(path: str, query: Mapping[str, Any] | None = None) -> str:
    suffix = path if path.startswith("/") else f"/{path}"
    url = f"{API_ROOT}{suffix}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    return url


def _season_path(suffix: str) -> str:
    season = urllib.parse.quote(SEASON_ID, safe=":")
    return f"/seasons/{season}/{suffix.lstrip('/')}"


def fetch_matches(client: OfficialApiClient) -> list[dict[str, Any]]:
    payload = client.get_json(
        _api_url(_season_path("matches"), {"locale": "en-US", "page": 1, "pageNumElement": 500})
    )
    records = payload.get("matches")
    if not isinstance(records, list):
        raise FetchError("official matches response is missing matches[]")
    return records


def fetch_teams(client: OfficialApiClient) -> list[dict[str, Any]]:
    payload = client.get_json(_api_url(_season_path("teams"), {"locale": "en-US"}))
    records = payload.get("teams")
    if not isinstance(records, list):
        raise FetchError("official teams response is missing teams[]")
    return records


def fetch_roster(
    client: OfficialApiClient,
    team_id: str,
) -> list[dict[str, Any]]:
    encoded_team = urllib.parse.quote(team_id, safe=":")
    payload = client.get_json(
        _api_url(
            f"/teams/{encoded_team}/roster",
            {"locale": "en-US", "seasonId": SEASON_ID},
        )
    )
    records = payload.get("players")
    if not isinstance(records, list):
        raise FetchError(f"official roster response is missing players[] for {team_id}")
    return records


def fetch_stats_category(
    client: OfficialApiClient,
    *,
    entity: str,
    category: str,
    page_size: int = 500,
) -> list[dict[str, Any]]:
    if entity not in {"players", "teams"}:
        raise ValueError(f"unsupported stats entity: {entity}")
    page = 1
    records: list[dict[str, Any]] = []
    while True:
        payload = client.get_json(
            _api_url(
                _season_path(f"stats/{entity}"),
                {
                    "locale": "en-US",
                    "category": category,
                    "page": page,
                    "pageNumElement": page_size,
                },
            )
        )
        batch = payload.get(entity)
        if not isinstance(batch, list):
            raise FetchError(f"official {entity}/{category} response is missing {entity}[]")
        records.extend(batch)
        pagination = payload.get("pagination") or {}
        if not isinstance(pagination, dict) or pagination.get("isLastPage", True):
            break
        page += 1
        if page > 100:
            raise FetchError(f"official {entity}/{category} pagination exceeded 100 pages")
    return records


def fetch_player_match_breakdown(
    client: OfficialApiClient,
    *,
    player_id: str,
    team_id: str,
) -> dict[str, Any]:
    encoded_player = urllib.parse.quote(player_id, safe=":")
    payload = client.get_json(
        _api_url(
            _season_path(f"stats/players/{encoded_player}/matchBreakdown"),
            {"locale": "en-US", "teamId": team_id},
        )
    )
    player = payload.get("player") or {}
    returned_id = player.get("playerId")
    if returned_id != player_id:
        raise FetchError(
            f"matchBreakdown returned the wrong player ({returned_id!r} for {player_id!r})"
        )
    if not isinstance(payload.get("matches"), list):
        raise FetchError(f"matchBreakdown response is missing matches[] for {player_id}")
    return payload


def fetch_match_lineup(client: OfficialApiClient, match_id: str) -> dict[str, Any]:
    encoded_match = urllib.parse.quote(match_id, safe=":")
    return client.get_json(
        _api_url(
            _season_path(f"matches/{encoded_match}/lineups"),
            {"locale": "en-US"},
        )
    )


def _bounded_map(
    items: Sequence[Any],
    worker: Callable[[Any], Any],
    *,
    workers: int,
    label: Callable[[Any], str] = str,
) -> dict[Any, Any]:
    if workers < 1:
        raise ValueError("workers must be positive")
    results: dict[Any, Any] = {}
    failures: list[tuple[str, BaseException]] = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(worker, item): item for item in items}
        for future in as_completed(futures):
            item = futures[future]
            try:
                results[item] = future.result()
            except BaseException as exc:  # aggregate all player failures; never skip one
                failures.append((label(item), exc))
    if failures:
        failures.sort(key=lambda item: item[0])
        preview = ", ".join(
            f"{item} ({type(exc).__name__}: {exc})" for item, exc in failures[:8]
        )
        suffix = "" if len(failures) <= 8 else f", and {len(failures) - 8} more"
        raise FetchError(f"{len(failures)} bounded fetches failed: {preview}{suffix}") from failures[0][1]
    return results


def _normalize_team(record: Mapping[str, Any]) -> dict[str, Any]:
    team_id = _official_id(record.get("teamId"), OFFICIAL_TEAM_ID, field="team.teamId")
    name = _text(record.get("officialName") or record.get("mediaName") or record.get("shortName"))
    if not name:
        raise DataValidationError(f"team {team_id} has no display name")
    provider_id = _text(record.get("providerId"))
    abbreviation = (_text(record.get("acronymName")) or "")[:8].upper()
    if not provider_id or not abbreviation:
        raise DataValidationError(f"team {team_id} is missing providerId or abbreviation")
    editorial = record.get("editorial") or {}
    website = _text(editorial.get("websiteUrl")) if isinstance(editorial, dict) else None
    return {
        "id": team_id,
        "providerId": provider_id,
        "slug": _slugify(name),
        "name": name,
        "abbreviation": abbreviation,
        "mediaName": _text(record.get("mediaName")),
        "websiteUrl": website,
        "isActive": True,
    }


def _match_week(record: Mapping[str, Any]) -> int | None:
    direct = record.get("matchWeek")
    if direct is not None and str(direct).strip():
        try:
            return int(direct)
        except (TypeError, ValueError):
            pass
    match_set = record.get("matchSet") or {}
    if isinstance(match_set, dict):
        index = match_set.get("index")
        if index is not None and str(index).strip():
            try:
                return int(index)
            except (TypeError, ValueError):
                pass
        name = str(match_set.get("name") or "")
        found = re.search(r"(\d+)", name)
        if found:
            return int(found.group(1))
    return None


def _nullable_score(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    number = float(value)
    if not number.is_integer() or number < 0:
        raise DataValidationError(f"invalid official score: {value!r}")
    return int(number)


def _normalize_match(record: Mapping[str, Any]) -> dict[str, Any]:
    match_id = _official_id(record.get("matchId"), OFFICIAL_MATCH_ID, field="match.matchId")
    provider_id = _text(record.get("providerId"))
    if not provider_id:
        raise DataValidationError(f"match {match_id} has no providerId")
    home = record.get("home") or {}
    away = record.get("away") or {}
    kickoff = _parse_timestamp(record.get("matchDateUtc"), field=f"match {match_id} kickoff")
    local_date_raw = _text(record.get("matchDateLocal"))
    local_date = local_date_raw[:10] if local_date_raw else None
    return {
        "id": match_id,
        "providerId": provider_id,
        "status": _status(record.get("status") or record.get("providerStatus")),
        "phase": _text(record.get("phase")),
        "kickoffAt": _iso_utc(kickoff),
        "localDate": local_date,
        "homeTeamId": _official_id(home.get("teamId"), OFFICIAL_TEAM_ID, field="match.home.teamId"),
        "awayTeamId": _official_id(away.get("teamId"), OFFICIAL_TEAM_ID, field="match.away.teamId"),
        "homeScore": _nullable_score(
            record.get("providerHomeScore", record.get("homeScorePush"))
        ),
        "awayScore": _nullable_score(
            record.get("providerAwayScore", record.get("awayScorePush"))
        ),
        "venue": _text(record.get("stadiumName")),
        "city": _text(record.get("cityName")),
        "roundName": _text(record.get("roundName")),
        "matchWeek": _match_week(record),
    }


def _merge_category_records(
    records_by_category: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    entity: str,
) -> dict[str, dict[str, Any]]:
    id_key = "playerId" if entity == "players" else "teamId"
    pattern = OFFICIAL_PLAYER_ID if entity == "players" else OFFICIAL_TEAM_ID
    merged: dict[str, dict[str, Any]] = {}
    for category in records_by_category:
        seen_in_category: set[str] = set()
        for record in records_by_category[category]:
            entity_id = _official_id(
                record.get(id_key),
                pattern,
                field=f"{entity}.{category}.{id_key}",
            )
            if entity_id in seen_in_category:
                raise DataValidationError(
                    f"duplicate {entity} ID {entity_id} in {category} stats"
                )
            seen_in_category.add(entity_id)
            entry = merged.setdefault(
                entity_id,
                {"meta": dict(record), "teamIds": set(), "rawStats": {}},
            )
            if category == "general":
                entry["meta"] = dict(record)
            team = record.get("team") or {}
            if entity == "players" and isinstance(team, dict) and team.get("teamId"):
                entry["teamIds"].add(
                    _official_id(
                        team.get("teamId"),
                        OFFICIAL_TEAM_ID,
                        field=f"player {entity_id} stats team",
                    )
                )
            category_stats = _stats_object(
                record.get("stats") or [],
                collision_prefix=category,
            )
            _merge_stats(entry["rawStats"], category_stats, category=category)
    for entry in merged.values():
        entry["rawStats"] = dict(sorted(entry["rawStats"].items()))
    return merged


def _player_season_row(player_id: str, entry: Mapping[str, Any]) -> dict[str, Any]:
    raw = entry["rawStats"]
    teams = sorted(entry["teamIds"])
    if len(teams) != 1:
        raise DataValidationError(
            f"player season stats {player_id} resolve to {len(teams)} teams"
        )
    route_id = _player_route_id(player_id)
    return {
        "playerId": route_id,
        "teamId": teams[0],
        "gamesPlayed": _integer(raw, ("games_played", "appearances")),
        "starts": _integer(raw, ("starts",)),
        "minutesPlayed": _metric(raw, ("minutes_played", "time_played")),
        "goals": _integer(raw, ("goals",)),
        "assists": _integer(raw, ("assists", "goal_assists")),
        "shots": _integer(raw, ("total_scoring_attempts", "total_shots")),
        "shotsOnTarget": _integer(
            raw,
            ("on_target_scoring_attempts", "shots_on_target_inc_goals"),
        ),
        "xg": _nullable_metric(raw, ("xg", "expected_goals")),
        "xa": _nullable_metric(raw, ("xa", "expected_assists")),
        "passesAttempted": _integer(raw, ("total_pass", "total_passes")),
        "passesCompleted": _integer(
            raw,
            ("accurate_pass", "total_successful_passes_excl_crosses_corners"),
        ),
        "passAccuracyPct": _percentage(
            raw,
            ("accurate_pass_percentage", "passing_accuracy"),
        ),
        "chancesCreated": _integer(
            raw,
            ("key_passes_attempt_assists", "shots_created", "total_attacking_assist"),
        ),
        "tackles": _integer(raw, ("total_tackles", "total_tackle")),
        "tacklesWon": _integer(raw, ("tackles_won", "won_tackle")),
        "interceptions": _integer(raw, ("interceptions", "interception")),
        "clearances": _integer(raw, ("total_clearances", "clearances")),
        "cleanSheets": _integer(raw, ("clean_sheets",)),
        "saves": _integer(raw, ("saves", "total_saves")),
        "goalsConceded": _integer(raw, ("goals_conceded",)),
        "yellowCards": _integer(raw, ("yellow_cards",)),
        "redCards": _integer(raw, ("red_cards", "total_red_cards")),
        "fantasyPoints": 0.0,
        "pointsPer90": 0.0,
        "rawStats": _compact_raw_stats(raw, PUBLISHED_SEASON_RAW_STATS_KEYS),
    }


def _team_season_row(team_id: str, entry: Mapping[str, Any]) -> dict[str, Any]:
    raw = entry["rawStats"]
    goals_for = _integer(raw, ("goals",))
    goals_against = _integer(raw, ("goals_against", "goals_conceded"))
    return {
        "teamId": team_id,
        "gamesPlayed": _integer(raw, ("games_played",)),
        "wins": _integer(raw, ("total_wins", "wins")),
        "draws": _integer(raw, ("total_draws", "draws")),
        "losses": _integer(raw, ("total_losses", "losses")),
        "points": _integer(raw, ("total_points", "points")),
        "goalsFor": goals_for,
        "goalsAgainst": goals_against,
        "goalDifference": goals_for - goals_against,
        "cleanSheets": _integer(raw, ("clean_sheets",)),
        "shots": _integer(raw, ("total_scoring_attempts", "total_shots")),
        "shotsOnTarget": _integer(
            raw,
            ("on_target_scoring_attempts", "shots_on_target_inc_goals"),
        ),
        "xg": _nullable_metric(raw, ("xg", "expected_goals")),
        "xga": _nullable_metric(raw, ("xga", "expected_goals_against")),
        "possessionPct": _percentage(
            raw,
            ("possession_percentage", "average_possession"),
        ),
        "passesAttempted": _integer(raw, ("total_pass", "total_passes")),
        "passesCompleted": _integer(
            raw,
            ("accurate_pass", "total_successful_passes_excl_crosses_corners"),
        ),
        "passAccuracyPct": _percentage(
            raw,
            ("accurate_pass_percentage", "passing_accuracy", "passes_accuracy"),
        ),
        "chancesCreated": _integer(
            raw,
            ("key_passes_attempt_assists", "shots_created", "total_attacking_assist"),
        ),
        "tackles": _integer(raw, ("total_tackles", "total_tackle")),
        "tacklesWon": _integer(raw, ("tackles_won", "tackle")),
        "interceptions": _integer(raw, ("interceptions", "interception")),
        "yellowCards": _integer(raw, ("yellow_cards",)),
        "redCards": _integer(raw, ("red_cards", "total_red_cards")),
        "corners": _integer(raw, ("corners", "corner_taken")),
        "rawStats": _compact_raw_stats(raw, PUBLISHED_SEASON_RAW_STATS_KEYS),
    }


def _choose_player_meta(
    roster_rows: Sequence[dict[str, Any]],
    stats_meta: Mapping[str, Any] | None,
) -> tuple[Mapping[str, Any], dict[str, Any] | None]:
    active = sorted(
        (row for row in roster_rows if row["status"] == "active"),
        key=lambda row: row["teamId"],
    )
    if len(active) > 1:
        player_id = roster_rows[0]["player"].get("playerId") if roster_rows else "unknown"
        raise DataValidationError(f"player {player_id} is active on multiple official teams")
    if active:
        return active[0]["player"], active[0]
    if roster_rows:
        chosen = sorted(roster_rows, key=lambda row: row["teamId"])[0]
        return chosen["player"], chosen
    if stats_meta is not None:
        return stats_meta, None
    raise DataValidationError("player has neither roster nor stats metadata")


def _normalize_players(
    *,
    rosters: Mapping[str, Sequence[Mapping[str, Any]]],
    player_stat_entries: Mapping[str, Mapping[str, Any]],
    team_ids: set[str],
) -> tuple[list[dict[str, Any]], dict[str, set[str]], dict[str, str]]:
    roster_by_player: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for team_id, records in rosters.items():
        if team_id not in team_ids:
            raise DataValidationError(f"roster references unknown team {team_id}")
        for player in records:
            player_id = _official_id(
                player.get("playerId"),
                OFFICIAL_PLAYER_ID,
                field="roster.playerId",
            )
            roster_by_player[player_id].append(
                {
                    "teamId": team_id,
                    "status": _player_status(player.get("playerStatus")),
                    "leaveDate": _text(player.get("leaveDate")),
                    "player": dict(player),
                }
            )

    all_player_ids = sorted(set(roster_by_player) | set(player_stat_entries))
    players: list[dict[str, Any]] = []
    candidates_by_player: dict[str, set[str]] = {}
    positions_by_player: dict[str, str] = {}

    for player_id in all_player_ids:
        stat_entry = player_stat_entries.get(player_id)
        stat_meta = stat_entry["meta"] if stat_entry else None
        roster_rows = roster_by_player.get(player_id, [])
        meta, active_row = _choose_player_meta(roster_rows, stat_meta)
        candidates = {row["teamId"] for row in roster_rows}
        if stat_entry:
            stat_team_ids = set(stat_entry["teamIds"])
            unknown_stat_teams = stat_team_ids - team_ids
            if unknown_stat_teams:
                games_played = _integer(
                    stat_entry["rawStats"],
                    ("games_played", "appearances"),
                )
                if games_played == 0 and not roster_rows:
                    # The provider can emit stat-only placeholder players for
                    # its non-league "TBC" team. With no 2026 appearances or
                    # official roster membership there is no truthful NWSL
                    # team reference to publish, so omit the empty row.
                    continue
                if games_played > 0:
                    raise DataValidationError(
                        f"player {player_id} has a non-league season-stat team "
                        f"with {games_played} games played"
                    )
                # The provider occasionally assigns a zero-appearance player
                # to its exact "TBC" placeholder.  Preserve the official
                # roster association instead of publishing an unresolved ref.
                resolved_team = (
                    active_row["teamId"]
                    if active_row
                    else sorted(row["teamId"] for row in roster_rows)[0]
                )
                stat_entry["teamIds"] = {resolved_team}
                stat_team_ids = {resolved_team}
            candidates.update(stat_team_ids)
        if not candidates or not candidates <= team_ids:
            raise DataValidationError(f"player {player_id} has unresolved team references")

        stats_teams = sorted(stat_entry["teamIds"]) if stat_entry else []
        current_team = active_row["teamId"] if active_row else (stats_teams[0] if stats_teams else sorted(candidates)[0])
        first_name = _text(meta.get("mediaFirstName"))
        last_name = _text(meta.get("mediaLastName"))
        display_name = _text(meta.get("displayName"))
        if not display_name:
            display_name = " ".join(value for value in (first_name, last_name) if value)
        display_name = display_name or _text(meta.get("shortName"))
        if not display_name:
            raise DataValidationError(f"player {player_id} has no display name")
        position = _position(meta.get("roleLabel"), meta.get("role"))
        status = "active" if active_row else "left_team"
        provider_id = _text(meta.get("providerId"))
        if not provider_id:
            raise DataValidationError(f"player {player_id} has no providerId")

        route_id = _player_route_id(player_id)
        players.append(
            {
                "id": route_id,
                "officialId": player_id,
                "providerId": provider_id,
                "slug": _slugify(display_name),
                "displayName": display_name,
                "firstName": first_name,
                "lastName": last_name,
                "currentTeamId": current_team,
                "position": position,
                "playerStatus": status,
                "jerseyNumber": _jersey_number(meta.get("bibNumber")),
                "dateOfBirth": _date_only(
                    meta.get("dateOfBirth"),
                    field=f"player {player_id} dateOfBirth",
                ),
                "nationality": _text(meta.get("nationality")),
                "nationalityCode": _text(meta.get("nationalityIsoCode")),
            }
        )
        candidates_by_player[player_id] = candidates
        positions_by_player[route_id] = position

    return players, candidates_by_player, positions_by_player


def resolve_transfer_match_team(
    match: Mapping[str, Any],
    candidate_team_ids: Iterable[str],
    *,
    lineup_team_ids: Iterable[str] | None = None,
) -> str:
    """Resolve a match team only through exact official ID relationships."""

    home_id = str(match.get("homeTeamId") or (match.get("home") or {}).get("teamId") or "")
    away_id = str(match.get("awayTeamId") or (match.get("away") or {}).get("teamId") or "")
    sides = {team_id for team_id in (home_id, away_id) if team_id}
    intersection = sides.intersection(set(candidate_team_ids))
    if len(intersection) == 1:
        return next(iter(intersection))
    if len(intersection) == 2 and lineup_team_ids is not None:
        lineup_intersection = intersection.intersection(set(lineup_team_ids))
        if len(lineup_intersection) == 1:
            return next(iter(lineup_intersection))
    match_id = match.get("id") or match.get("matchId")
    raise DataValidationError(
        f"could not resolve exact transfer team for match {match_id}: "
        f"{len(intersection)} candidate sides"
    )


def _lineup_appearance_teams_for_player(
    payload: Mapping[str, Any],
    player_id: str,
) -> set[str]:
    result: set[str] = set()
    for side in ("home", "away"):
        team = payload.get(side) or {}
        team_id = team.get("teamId")
        if not team_id:
            continue
        for player in team.get("fielded") or []:
            if player.get("playerId") == player_id:
                result.add(str(team_id))
        for player in team.get("benched") or []:
            if player.get("playerId") != player_id:
                continue
            events = player.get("events") or []
            if any(event.get("type") == "substitution-in" for event in events):
                result.add(str(team_id))
    return result


def _finished_lineup_appearances(
    lineups_by_match_id: Mapping[str, Mapping[str, Any]],
) -> set[tuple[str, str, str]]:
    """Return exact (official player ID, match ID, team ID) appearances."""

    appearances: set[tuple[str, str, str]] = set()
    for match_id in sorted(lineups_by_match_id):
        _official_id(match_id, OFFICIAL_MATCH_ID, field="lineup match ID")
        payload = lineups_by_match_id[match_id]
        for side in ("home", "away"):
            team = payload.get(side) or {}
            team_id = _official_id(
                team.get("teamId"),
                OFFICIAL_TEAM_ID,
                field=f"lineup {match_id} {side} teamId",
            )
            side_players: set[str] = set()
            for player in team.get("fielded") or []:
                official_player_id = _official_id(
                    player.get("playerId"),
                    OFFICIAL_PLAYER_ID,
                    field=f"lineup {match_id} fielded playerId",
                )
                side_players.add(official_player_id)
            for player in team.get("benched") or []:
                events = player.get("events") or []
                if not any(event.get("type") == "substitution-in" for event in events):
                    continue
                official_player_id = _official_id(
                    player.get("playerId"),
                    OFFICIAL_PLAYER_ID,
                    field=f"lineup {match_id} substitute playerId",
                )
                side_players.add(official_player_id)
            appearances.update(
                (official_player_id, match_id, team_id)
                for official_player_id in side_players
            )
    return appearances


def _finished_lineup_appearance_keys(
    official_appearances: Iterable[tuple[str, str, str]],
    official_to_route: Mapping[str, str],
) -> set[tuple[str, str]]:
    appearances: set[tuple[str, str]] = set()
    for official_player_id, match_id, _team_id in official_appearances:
        route_id = official_to_route.get(official_player_id)
        if route_id is None:
            raise DataValidationError(
                f"finished lineup {match_id} references unknown player "
                f"{official_player_id}"
            )
        appearances.add((route_id, match_id))
    return appearances


def _breakdown_fetch_jobs(
    *,
    aggregate_positive_teams: Mapping[str, str],
    lineup_appearances: Iterable[tuple[str, str, str]],
    candidates_by_player: Mapping[str, set[str]],
    current_teams_by_player: Mapping[str, str],
) -> list[tuple[str, str]]:
    """Union aggregate-positive and lineup players using exact team IDs only."""

    lineup_teams: defaultdict[str, set[str]] = defaultdict(set)
    for player_id, _match_id, team_id in lineup_appearances:
        lineup_teams[player_id].add(team_id)
    player_ids = set(aggregate_positive_teams).union(lineup_teams)
    jobs: list[tuple[str, str]] = []
    for player_id in sorted(player_ids):
        candidates = candidates_by_player.get(player_id)
        if not candidates:
            raise DataValidationError(
                f"breakdown player {player_id} has no exact candidate teams"
            )
        aggregate_team = aggregate_positive_teams.get(player_id)
        current_team = current_teams_by_player.get(player_id)
        lineup_candidates = lineup_teams[player_id].intersection(candidates)
        if aggregate_team in candidates:
            query_team = str(aggregate_team)
        elif current_team in candidates:
            query_team = str(current_team)
        elif len(lineup_candidates) == 1:
            query_team = next(iter(lineup_candidates))
        else:
            raise DataValidationError(
                f"breakdown player {player_id} cannot resolve one exact query team"
            )
        jobs.append((player_id, query_team))
    return jobs


def _match_core_stats(raw: Mapping[str, Any]) -> dict[str, Any]:
    goals = _number(raw, ("goals",), default=None)
    if goals is None:
        goals = _sum_exact(raw, ("goals_inside_box", "goals_outside_box"))
    goals = 0.0 if goals is None else goals
    if abs(goals - round(goals)) > 1e-8 or goals < 0:
        raise DataValidationError(f"official match goals are invalid: {goals}")
    passes_completed = _integer(
        raw,
        ("accurate_pass", "accuratepass", "passes_successful"),
    )
    reported_passes_attempted = _integer(
        raw,
        ("total_pass", "pass_attempts"),
    )
    missed_passes_value = _number(raw, ("missed_passes",), default=None)
    if missed_passes_value is not None:
        if (
            missed_passes_value < 0
            or abs(missed_passes_value - round(missed_passes_value)) > 1e-8
        ):
            raise DataValidationError(
                f"official missed passes are invalid: {missed_passes_value}"
            )
        # In the official matchBreakdown feed, total_pass/pass_attempts can
        # exclude crosses even though accurate_pass includes them. The exact
        # completed + missed identity restores an internally complete attempt
        # count without inventing any event.
        completed_plus_missed = passes_completed + int(round(missed_passes_value))
    else:
        completed_plus_missed = passes_completed
    passes_attempted = max(reported_passes_attempted, completed_plus_missed)
    pass_accuracy = (
        round(passes_completed * 100.0 / passes_attempted, 4)
        if passes_attempted > 0
        else 0.0
    )
    return {
        "minutes": _metric(raw, ("minutes", "mins_played")),
        "goals": int(round(goals)),
        "assists": _integer(raw, ("assists",)),
        "shots": _integer(raw, ("shots", "total_scoring_att")),
        "shotsOnTarget": _integer(
            raw,
            ("shots_on_goal", "shots_on_goal_successful", "ontarget_scoring_att"),
        ),
        "xg": _nullable_metric(raw, ("expected_goals", "xg")),
        "passesAttempted": passes_attempted,
        # The high-level passes-successful field is currently zero for many
        # non-zero Opta rows. accuratePass/accurate-pass is the exact event feed.
        "passesCompleted": passes_completed,
        "passAccuracyPct": pass_accuracy,
        "chancesCreated": _integer(
            raw,
            ("chances_created", "total_att_assist", "shot_created"),
        ),
        "tackles": _integer(raw, ("tackles_total", "total_tackle")),
        "tacklesWon": _integer(raw, ("tackles_successful", "won_tackle")),
        "interceptions": _integer(
            raw,
            ("interception", "interception_won"),
        ),
        "clearances": _integer(raw, ("clearences", "total_clearance")),
        "saves": _integer(raw, ("saves",)),
        "goalsConceded": _integer(raw, ("goals_conceded",)),
        "yellowCards": _integer(raw, ("yellow_cards",)),
        "redCards": _integer(raw, ("red_cards",)),
    }


def _is_official_appearance(raw: Mapping[str, Any]) -> bool:
    """Distinguish an appearance from the provider's zero-stat roster rows."""

    minutes = _number(raw, ("minutes", "mins_played"), default=0.0) or 0.0
    started = _number(raw, ("game_started",), default=0.0) or 0.0
    substituted_on = _number(raw, ("total_sub_on",), default=0.0) or 0.0
    return minutes > 0 or started > 0 or substituted_on > 0


def _canonical_match_scoring_stats(
    raw: dict[str, Any],
    *,
    core: Mapping[str, Any],
    position: str,
    match: Mapping[str, Any],
    team_id: str,
) -> dict[str, Any]:
    successful_crosses = _integer(
        raw,
        (
            "successful_crosses",
            "crosses_successful",
            "accurate_cross",
            "successful_crosses_open_play",
        ),
    )
    fouls_won = _integer(raw, ("fouls_won", "fouls_suffered", "total_fouls_won"))
    fouls_committed = _integer(
        raw,
        ("fouls_committed", "fouls", "total_fouls_conceded"),
    )
    blocks = _integer(raw, ("blocks", "blocked_shots", "blocked_pass"))
    penalty_saves = _integer(raw, ("penalty_saves", "penalties_saved"))
    penalty_misses = _integer(
        raw,
        ("penalty_misses", "penalties_off_target", "penalties_saved_against"),
    )
    penalty_conceded = _integer(raw, ("penalty_conceded", "penalties_conceded"))
    own_goals = _integer(raw, ("own_goals",))
    clean_sheet = int(core["goalsConceded"]) == 0

    home = team_id == match["homeTeamId"]
    team_score = match["homeScore"] if home else match["awayScore"]
    opponent_score = match["awayScore"] if home else match["homeScore"]
    goalkeeper_win = bool(
        position == "GK"
        and match["status"] == "FINISHED"
        and team_score is not None
        and opponent_score is not None
        and team_score > opponent_score
    )
    goalkeeper_draw = bool(
        position == "GK"
        and match["status"] == "FINISHED"
        and team_score is not None
        and opponent_score is not None
        and team_score == opponent_score
    )

    canonical = {
        "successful_passes": int(core["passesCompleted"]),
        "successful_crosses": successful_crosses,
        "fouls_won": fouls_won,
        "fouls_committed": fouls_committed,
        "blocks": blocks,
        "clean_sheet": clean_sheet,
        "penalty_saves": penalty_saves,
        "penalty_misses": penalty_misses,
        "penalty_conceded": penalty_conceded,
        "own_goals": own_goals,
        "goalkeeper_win": goalkeeper_win,
        "goalkeeper_draw": goalkeeper_draw,
    }
    for key, value in canonical.items():
        raw[key] = value
    return canonical


def _fantasy_score(
    *,
    position: str,
    core: Mapping[str, Any],
    scoring: Mapping[str, Any],
) -> tuple[float, dict[str, float]]:
    minutes = float(core["minutes"])
    breakdown = {
        "appearance": (1 if minutes > 0 else 0) * FANTASY_RULES["appearance"],
        "minutes60Plus": (1 if minutes >= 60 else 0) * FANTASY_RULES["minutes60Plus"],
        "goals": int(core["goals"]) * FANTASY_RULES["goal"][position],
        "assists": int(core["assists"]) * FANTASY_RULES["assist"],
        "shots": int(core["shots"]) * FANTASY_RULES["shot"],
        "shotsOnTarget": int(core["shotsOnTarget"]) * FANTASY_RULES["shotOnTarget"],
        "chancesCreated": int(core["chancesCreated"]) * FANTASY_RULES["chanceCreated"],
        "successfulPasses": int(core["passesCompleted"]) * FANTASY_RULES["successfulPass"],
        "successfulCrosses": int(scoring["successful_crosses"])
        * FANTASY_RULES["successfulCross"],
        "foulsWon": int(scoring["fouls_won"]) * FANTASY_RULES["foulWon"],
        "foulsCommitted": int(scoring["fouls_committed"])
        * FANTASY_RULES["foulCommitted"],
        "tacklesWon": int(core["tacklesWon"]) * FANTASY_RULES["tackleWon"],
        "interceptions": int(core["interceptions"]) * FANTASY_RULES["interception"],
        "blocks": int(scoring["blocks"]) * FANTASY_RULES["block"],
        "cleanSheets": (
            1 if scoring["clean_sheet"] and minutes >= 60 else 0
        )
        * FANTASY_RULES["cleanSheet"][position],
        "saves": int(core["saves"]) * FANTASY_RULES["save"],
        "goalsConceded": int(core["goalsConceded"])
        * FANTASY_RULES["goalsConceded"][position],
        "yellowCards": int(core["yellowCards"]) * FANTASY_RULES["yellowCard"],
        "redCards": int(core["redCards"]) * FANTASY_RULES["redCard"],
        "penaltySaves": int(scoring["penalty_saves"]) * FANTASY_RULES["penaltySave"],
        "penaltyMisses": int(scoring["penalty_misses"]) * FANTASY_RULES["penaltyMiss"],
        "penaltyConceded": int(scoring["penalty_conceded"])
        * FANTASY_RULES["penaltyConceded"],
        "ownGoals": int(scoring["own_goals"]) * FANTASY_RULES["ownGoal"],
        "goalkeeperWins": (1 if scoring["goalkeeper_win"] else 0)
        * FANTASY_RULES["goalkeeperWin"],
        "goalkeeperDraws": (1 if scoring["goalkeeper_draw"] else 0)
        * FANTASY_RULES["goalkeeperDraw"],
    }
    rounded = {
        key: round(float(value), 4)
        for key, value in breakdown.items()
        if abs(float(value)) > 1e-12
    }
    return round(sum(rounded.values()), 4), rounded


def _normalize_player_match_stats(
    *,
    breakdowns: Mapping[str, Mapping[str, Any]],
    candidates_by_player: Mapping[str, set[str]],
    positions_by_player: Mapping[str, str],
    matches_by_id: Mapping[str, Mapping[str, Any]],
    lineups_by_match_id: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for official_player_id in sorted(breakdowns):
        route_id = _player_route_id(official_player_id)
        position = positions_by_player[route_id]
        for record in breakdowns[official_player_id].get("matches") or []:
            embedded_match = record.get("match") or {}
            match_id = _official_id(
                embedded_match.get("matchId"),
                OFFICIAL_MATCH_ID,
                field=f"breakdown {official_player_id} matchId",
            )
            match = matches_by_id.get(match_id)
            if match is None:
                raise DataValidationError(
                    f"player breakdown references unknown official match {match_id}"
                )
            if match["status"] != "FINISHED":
                continue
            raw = _stats_object(record.get("playerStats") or [])
            lineup = lineups_by_match_id.get(match_id)
            lineup_ids = (
                _lineup_appearance_teams_for_player(lineup, official_player_id)
                if lineup is not None
                else set()
            )
            if not _is_official_appearance(raw):
                continue
            embedded_intersection = {
                str((embedded_match.get("home") or {}).get("teamId") or ""),
                str((embedded_match.get("away") or {}).get("teamId") or ""),
            }.intersection(candidates_by_player[official_player_id])
            if len(embedded_intersection) == 2:
                if lineup is None:
                    raise DataValidationError(
                        f"ambiguous transfer match {match_id} has no official lineup"
                    )
            team_id = resolve_transfer_match_team(
                match,
                candidates_by_player[official_player_id],
                lineup_team_ids=lineup_ids,
            )
            is_home = team_id == match["homeTeamId"]
            opponent_id = match["awayTeamId"] if is_home else match["homeTeamId"]
            core = _match_core_stats(raw)
            scoring = _canonical_match_scoring_stats(
                raw,
                core=core,
                position=position,
                match=match,
                team_id=team_id,
            )
            fantasy_points, fantasy_breakdown = _fantasy_score(
                position=position,
                core=core,
                scoring=scoring,
            )
            rows.append(
                {
                    "playerId": route_id,
                    "matchId": match_id,
                    "teamId": team_id,
                    "opponentTeamId": opponent_id,
                    "isHome": is_home,
                    **core,
                    "fantasyPoints": fantasy_points,
                    "fantasyBreakdown": fantasy_breakdown,
                    "rawStats": _compact_raw_stats(raw, PUBLISHED_RAW_STATS_KEYS),
                }
            )
    rows.sort(key=lambda row: (row["playerId"], row["matchId"]))
    return rows


def _count_live_player_rows_excluded(
    *,
    breakdowns: Mapping[str, Mapping[str, Any]],
    matches_by_id: Mapping[str, Mapping[str, Any]],
) -> int:
    """Count official live appearances intentionally excluded from the snapshot."""

    excluded = 0
    for official_player_id in sorted(breakdowns):
        for record in breakdowns[official_player_id].get("matches") or []:
            embedded_match = record.get("match") or {}
            match_id = _official_id(
                embedded_match.get("matchId"),
                OFFICIAL_MATCH_ID,
                field=f"breakdown {official_player_id} matchId",
            )
            match = matches_by_id.get(match_id)
            if match is None:
                raise DataValidationError(
                    f"player breakdown references unknown official match {match_id}"
                )
            if match["status"] != "LIVE":
                continue
            raw = _stats_object(record.get("playerStats") or [])
            if _is_official_appearance(raw):
                excluded += 1
    return excluded


def _apply_season_fantasy_totals(
    player_season_stats: list[dict[str, Any]],
    player_match_stats: Sequence[Mapping[str, Any]],
    lineup_appearance_keys: set[tuple[str, str]],
) -> dict[str, int]:
    totals: defaultdict[str, float] = defaultdict(float)
    exact_rows: defaultdict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in player_match_stats:
        totals[row["playerId"]] += float(row["fantasyPoints"])
        exact_rows[row["playerId"]].append(row)
    lineup_counts: defaultdict[str, int] = defaultdict(int)
    for player_id, _match_id in lineup_appearance_keys:
        lineup_counts[player_id] += 1

    additive_fields = (
        ("minutesPlayed", "minutes"),
        ("goals", "goals"),
        ("assists", "assists"),
        ("shots", "shots"),
        ("shotsOnTarget", "shotsOnTarget"),
        ("passesAttempted", "passesAttempted"),
        ("passesCompleted", "passesCompleted"),
        ("chancesCreated", "chancesCreated"),
        ("tackles", "tackles"),
        ("tacklesWon", "tacklesWon"),
        ("interceptions", "interceptions"),
        ("clearances", "clearances"),
        ("saves", "saves"),
        ("goalsConceded", "goalsConceded"),
        ("yellowCards", "yellowCards"),
        ("redCards", "redCards"),
    )
    aggregate_mismatches = 0
    additive_mismatches = 0
    complete_players = 0
    incomplete_players = 0
    for row in player_season_stats:
        finished_rows = exact_rows[row["playerId"]]
        lineup_appearances = lineup_counts[row["playerId"]]
        stat_appearances = len(finished_rows)
        match_stats_complete = lineup_appearances == stat_appearances
        if int(row["gamesPlayed"]) != lineup_appearances:
            aggregate_mismatches += 1
        row["gamesPlayed"] = lineup_appearances
        row["matchStatsAppearances"] = stat_appearances
        row["matchStatsComplete"] = match_stats_complete

        player_additive_mismatch = False
        if match_stats_complete:
            complete_players += 1
            for season_field, match_field in additive_fields:
                exact_total = sum(
                    float(match_row[match_field]) for match_row in finished_rows
                )
                if season_field != "minutesPlayed":
                    exact_total = int(round(exact_total))
                if abs(float(row[season_field]) - float(exact_total)) > 1e-6:
                    player_additive_mismatch = True
                row[season_field] = exact_total

            if finished_rows and all(
                match_row.get("xg") is not None for match_row in finished_rows
            ):
                exact_xg = round(
                    sum(float(match_row["xg"]) for match_row in finished_rows),
                    4,
                )
                if row["xg"] is None or abs(float(row["xg"]) - exact_xg) > 1e-6:
                    player_additive_mismatch = True
                row["xg"] = exact_xg

            attempts = int(row["passesAttempted"])
            completed = int(row["passesCompleted"])
            exact_accuracy = (
                round(completed * 100.0 / attempts, 4) if attempts > 0 else 0.0
            )
            existing_accuracy = row["passAccuracyPct"]
            if (
                existing_accuracy is None
                or abs(float(existing_accuracy) - exact_accuracy) > 1e-6
            ):
                player_additive_mismatch = True
            row["passAccuracyPct"] = exact_accuracy
        else:
            incomplete_players += 1

        if player_additive_mismatch:
            additive_mismatches += 1
        total = round(totals[row["playerId"]], 4)
        tracked_minutes = sum(float(match_row["minutes"]) for match_row in finished_rows)
        row["fantasyPoints"] = total
        row["pointsPer90"] = (
            round(total * 90.0 / tracked_minutes, 4)
            if tracked_minutes > 0
            else 0.0
        )
    return {
        "aggregateGamesPlayedMismatches": aggregate_mismatches,
        "aggregatePlayerAdditiveMismatches": additive_mismatches,
        "matchStatsCompletePlayers": complete_players,
        "matchStatsIncompletePlayers": incomplete_players,
    }


def _finished_team_standings(
    matches: Sequence[Mapping[str, Any]],
    team_ids: Iterable[str],
) -> dict[str, dict[str, int]]:
    standings = {
        team_id: {
            "gamesPlayed": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "points": 0,
            "goalsFor": 0,
            "goalsAgainst": 0,
            "goalDifference": 0,
        }
        for team_id in sorted(team_ids)
    }
    for match in matches:
        if match.get("status") != "FINISHED":
            continue
        home_id = str(match.get("homeTeamId") or "")
        away_id = str(match.get("awayTeamId") or "")
        if home_id not in standings or away_id not in standings:
            raise DataValidationError(
                f"finished match {match.get('id')} has an unknown standings team"
            )
        home_score = match.get("homeScore")
        away_score = match.get("awayScore")
        if home_score is None or away_score is None:
            raise DataValidationError(
                f"finished match {match.get('id')} has no final score"
            )
        home_goals = int(home_score)
        away_goals = int(away_score)
        home = standings[home_id]
        away = standings[away_id]
        home["gamesPlayed"] += 1
        away["gamesPlayed"] += 1
        home["goalsFor"] += home_goals
        home["goalsAgainst"] += away_goals
        away["goalsFor"] += away_goals
        away["goalsAgainst"] += home_goals
        if home_goals > away_goals:
            home["wins"] += 1
            away["losses"] += 1
            home["points"] += 3
        elif home_goals < away_goals:
            away["wins"] += 1
            home["losses"] += 1
            away["points"] += 3
        else:
            home["draws"] += 1
            away["draws"] += 1
            home["points"] += 1
            away["points"] += 1

    for row in standings.values():
        row["goalDifference"] = row["goalsFor"] - row["goalsAgainst"]
    return standings


def _apply_finished_team_standings(
    team_season_stats: list[dict[str, Any]],
    matches: Sequence[Mapping[str, Any]],
) -> dict[str, int]:
    exact = _finished_team_standings(
        matches,
        (str(row["teamId"]) for row in team_season_stats),
    )
    aggregate_mismatches = 0
    exact_fields = (
        "gamesPlayed",
        "wins",
        "draws",
        "losses",
        "points",
        "goalsFor",
        "goalsAgainst",
        "goalDifference",
    )
    for row in team_season_stats:
        official = exact[str(row["teamId"])]
        if any(int(row[field]) != official[field] for field in exact_fields):
            aggregate_mismatches += 1
        for field in exact_fields:
            row[field] = official[field]
    return {"aggregateTeamStandingsMismatches": aggregate_mismatches}


def _canonical_checksum_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    canonical = copy.deepcopy(dict(payload))
    run = canonical.get("run")
    if isinstance(run, dict):
        run.pop("runKey", None)
        run.pop("generatedAt", None)
        run.pop("fetchedAt", None)
        metadata = run.get("metadata")
        if isinstance(metadata, dict):
            metadata.pop("payloadChecksum", None)
    sort_keys: dict[str, Callable[[Mapping[str, Any]], tuple[Any, ...]]] = {
        "teams": lambda row: (row["id"],),
        "players": lambda row: (row["id"],),
        "matches": lambda row: (row["id"],),
        "playerSeasonStats": lambda row: (row["playerId"],),
        "teamSeasonStats": lambda row: (row["teamId"],),
        "playerMatchStats": lambda row: (row["playerId"], row["matchId"]),
    }
    for key, key_func in sort_keys.items():
        values = canonical.get(key)
        if isinstance(values, list):
            canonical[key] = sorted(values, key=key_func)
    return canonical


def compute_payload_checksum(payload: Mapping[str, Any]) -> str:
    canonical = _canonical_checksum_payload(payload)
    encoded = json.dumps(
        canonical,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _run_timestamp_key(value: Any) -> str:
    parsed = _parse_timestamp(value, field="run.fetchedAt")
    return parsed.strftime("%Y%m%dT%H%M%SZ")


def finalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    checksum = compute_payload_checksum(payload)
    timestamp_key = _run_timestamp_key(payload["run"].get("fetchedAt"))
    payload["run"]["runKey"] = (
        f"nwsl-data:{SEASON}:{timestamp_key}:{checksum[:16]}"
    )
    payload["run"]["metadata"]["payloadChecksum"] = checksum
    return payload


def _duplicates(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    duplicate: set[str] = set()
    for value in values:
        if value in seen:
            duplicate.add(value)
        seen.add(value)
    return sorted(duplicate)


def validate_payload(
    payload: Mapping[str, Any],
    *,
    limits: ValidationLimits = ValidationLimits(),
    now: datetime | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    if payload.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if payload.get("season") != SEASON:
        errors.append(f"season must be {SEASON}")
    run = payload.get("run") or {}
    if run.get("seasonId") != SEASON_ID or not OFFICIAL_SEASON_ID.fullmatch(
        str(run.get("seasonId") or "")
    ):
        errors.append("run.seasonId is not the official 2026 season ID")

    teams = list(payload.get("teams") or [])
    players = list(payload.get("players") or [])
    matches = list(payload.get("matches") or [])
    player_season = list(payload.get("playerSeasonStats") or [])
    team_season = list(payload.get("teamSeasonStats") or [])
    player_matches = list(payload.get("playerMatchStats") or [])

    if len(teams) != limits.exact_teams:
        errors.append(f"expected exactly {limits.exact_teams} teams, got {len(teams)}")
    if len(team_season) != limits.exact_teams:
        errors.append(
            f"expected exactly {limits.exact_teams} team season rows, got {len(team_season)}"
        )
    if len(players) < limits.min_players:
        errors.append(f"expected at least {limits.min_players} players, got {len(players)}")
    if len(matches) < limits.min_matches:
        errors.append(f"expected at least {limits.min_matches} matches, got {len(matches)}")
    if len(player_season) < limits.min_player_season_stats:
        errors.append(
            f"expected at least {limits.min_player_season_stats} player season rows, "
            f"got {len(player_season)}"
        )

    team_ids = [str(row.get("id") or "") for row in teams]
    player_ids = [str(row.get("id") or "") for row in players]
    official_player_ids = [str(row.get("officialId") or "") for row in players]
    match_ids = [str(row.get("id") or "") for row in matches]
    team_stats_keys = [str(row.get("teamId") or "") for row in team_season]
    player_stats_keys = [str(row.get("playerId") or "") for row in player_season]
    player_match_keys = [
        f"{row.get('playerId')}::{row.get('matchId')}" for row in player_matches
    ]
    for label, values in (
        ("team IDs", team_ids),
        ("player IDs", player_ids),
        ("official player IDs", official_player_ids),
        ("match IDs", match_ids),
        ("team season keys", team_stats_keys),
        ("player season keys", player_stats_keys),
        ("player-match keys", player_match_keys),
    ):
        duplicate = _duplicates(values)
        if duplicate:
            errors.append(f"duplicate {label}: {', '.join(duplicate[:4])}")

    team_set = set(team_ids)
    player_set = set(player_ids)
    match_set = set(match_ids)
    if any(not OFFICIAL_TEAM_ID.fullmatch(value) for value in team_ids):
        errors.append("one or more team IDs are not official NWSL IDs")
    if any(not ROUTE_PLAYER_ID.fullmatch(value) for value in player_ids):
        errors.append("one or more player route IDs are invalid")
    if any(not OFFICIAL_PLAYER_ID.fullmatch(value) for value in official_player_ids):
        errors.append("one or more official player IDs are invalid")
    if any(not OFFICIAL_MATCH_ID.fullmatch(value) for value in match_ids):
        errors.append("one or more match IDs are not official NWSL IDs")

    for player in players:
        if player.get("currentTeamId") not in team_set:
            errors.append(f"player {player.get('id')} references an unknown current team")
    for row in player_season:
        if row.get("playerId") not in player_set:
            errors.append(f"player season row references unknown player {row.get('playerId')}")
        if row.get("teamId") not in team_set:
            errors.append(f"player season row references unknown team {row.get('teamId')}")
        if len(row.get("rawStats") or {}) > RAW_STATS_LIMIT:
            errors.append(f"player {row.get('playerId')} rawStats exceeds the field limit")
        if int(row.get("passesCompleted") or 0) > int(
            row.get("passesAttempted") or 0
        ):
            errors.append(
                f"player {row.get('playerId')} has more completed than attempted passes"
            )
    for row in team_season:
        if row.get("teamId") not in team_set:
            errors.append(f"team season row references unknown team {row.get('teamId')}")
        if len(row.get("rawStats") or {}) > RAW_STATS_LIMIT:
            errors.append(f"team {row.get('teamId')} rawStats exceeds the field limit")
        if int(row.get("passesCompleted") or 0) > int(
            row.get("passesAttempted") or 0
        ):
            errors.append(
                f"team {row.get('teamId')} has more completed than attempted passes"
            )

    match_lookup = {row.get("id"): row for row in matches}
    for match in matches:
        if match.get("homeTeamId") not in team_set or match.get("awayTeamId") not in team_set:
            errors.append(f"match {match.get('id')} has unresolved team references")
        if match.get("homeTeamId") == match.get("awayTeamId"):
            errors.append(f"match {match.get('id')} has the same home and away team")

    generated_at = now or _parse_timestamp(run.get("fetchedAt"), field="run.fetchedAt")
    generated_at = generated_at.astimezone(timezone.utc)
    coverage_by_match: set[str] = set()
    counts_by_player: defaultdict[str, int] = defaultdict(int)
    fantasy_by_player: defaultdict[str, float] = defaultdict(float)
    for row in player_matches:
        player_id = row.get("playerId")
        match_id = row.get("matchId")
        match = match_lookup.get(match_id)
        if player_id not in player_set:
            errors.append(f"player-match row references unknown player {player_id}")
        if match_id not in match_set or match is None:
            errors.append(f"player-match row references unknown match {match_id}")
            continue
        team_id = row.get("teamId")
        opponent_id = row.get("opponentTeamId")
        expected_sides = {match.get("homeTeamId"), match.get("awayTeamId")}
        if {team_id, opponent_id} != expected_sides or team_id == opponent_id:
            errors.append(f"player-match {player_id}/{match_id} has unresolved teams")
        if bool(row.get("isHome")) != (team_id == match.get("homeTeamId")):
            errors.append(f"player-match {player_id}/{match_id} has an invalid home flag")
        kickoff = _parse_timestamp(match.get("kickoffAt"), field=f"match {match_id} kickoff")
        if kickoff > generated_at:
            errors.append(f"future match log exists for {player_id}/{match_id}")
        if match.get("status") != "FINISHED":
            errors.append(f"non-finished match log exists for {player_id}/{match_id}")
        raw = row.get("rawStats") or {}
        if len(raw) > RAW_STATS_LIMIT:
            errors.append(f"player-match {player_id}/{match_id} rawStats exceeds the limit")
        if int(row.get("passesCompleted") or 0) > int(
            row.get("passesAttempted") or 0
        ):
            errors.append(
                f"player-match {player_id}/{match_id} has more completed "
                "than attempted passes"
            )
        breakdown = row.get("fantasyBreakdown") or {}
        if abs(sum(float(value) for value in breakdown.values()) - float(row.get("fantasyPoints", 0))) > 1e-3:
            errors.append(f"player-match {player_id}/{match_id} fantasy breakdown does not sum")
        coverage_by_match.add(str(match_id))
        counts_by_player[str(player_id)] += 1
        fantasy_by_player[str(player_id)] += float(row.get("fantasyPoints", 0))

    finished_ids = {
        str(match.get("id")) for match in matches if match.get("status") == "FINISHED"
    }
    missing_finished = sorted(finished_ids - coverage_by_match)
    if missing_finished:
        errors.append(
            f"{len(missing_finished)} FINISHED matches lack official player match stats: "
            f"{', '.join(missing_finished[:4])}"
        )

    if not _duplicates(team_stats_keys) and set(team_stats_keys) == team_set:
        expected_standings = _finished_team_standings(matches, team_set)
        standings_fields = (
            "gamesPlayed",
            "wins",
            "draws",
            "losses",
            "points",
            "goalsFor",
            "goalsAgainst",
            "goalDifference",
        )
        for row in team_season:
            team_id = str(row.get("teamId"))
            expected = expected_standings[team_id]
            if any(
                int(row.get(field) or 0) != expected[field]
                for field in standings_fields
            ):
                errors.append(
                    f"team {team_id} standings do not reconcile to finished matches"
                )

    total_appearance_gap = 0
    complete_player_count = 0
    incomplete_player_count = 0
    for row in player_season:
        player_id = str(row.get("playerId"))
        games_played = int(row.get("gamesPlayed") or 0)
        played_count = counts_by_player[player_id]
        match_stats_appearances = row.get("matchStatsAppearances")
        if not isinstance(match_stats_appearances, int) or isinstance(
            match_stats_appearances,
            bool,
        ):
            errors.append(
                f"player {player_id} matchStatsAppearances is not an integer"
            )
            match_stats_appearances = -1
        if played_count != match_stats_appearances:
            errors.append(
                f"player {player_id} breakdown count {played_count} "
                f"does not reconcile to matchStatsAppearances "
                f"{match_stats_appearances}"
            )
        if played_count > games_played:
            errors.append(
                f"player {player_id} has more stat-bearing rows than lineup appearances"
            )
        expected_complete = played_count == games_played
        if not isinstance(row.get("matchStatsComplete"), bool):
            errors.append(f"player {player_id} matchStatsComplete is not a boolean")
        elif row.get("matchStatsComplete") != expected_complete:
            errors.append(
                f"player {player_id} matchStatsComplete does not match its coverage"
            )
        if expected_complete:
            complete_player_count += 1
        else:
            incomplete_player_count += 1
        total_appearance_gap += max(0, games_played - played_count)
        if abs(fantasy_by_player[player_id] - float(row.get("fantasyPoints", 0))) > 1e-3:
            errors.append(f"player {player_id} season fantasy points do not reconcile")

    metadata = run.get("metadata") or {}
    coverage_metadata = {
        "aggregatePlayerSeasonRows": len(player_season),
        "finishedLineupAppearances": sum(
            int(row.get("gamesPlayed") or 0) for row in player_season
        ),
        "statBearingMatchAppearances": len(player_matches),
        "lineupOnlyAppearancesExcluded": total_appearance_gap,
        "matchStatsCompletePlayers": complete_player_count,
        "matchStatsIncompletePlayers": incomplete_player_count,
    }
    for key, expected in coverage_metadata.items():
        if metadata.get(key) != expected:
            errors.append(
                f"run.metadata.{key} is {metadata.get(key)!r}; expected {expected}"
            )

    expected_checksum = compute_payload_checksum(payload)
    actual_checksum = str(metadata.get("payloadChecksum") or "")
    if actual_checksum != expected_checksum:
        errors.append("payload checksum does not match its deterministic content")
    expected_run_key = (
        f"nwsl-data:{SEASON}:{_run_timestamp_key(run.get('fetchedAt'))}:"
        f"{expected_checksum[:16]}"
    )
    if run.get("runKey") != expected_run_key:
        errors.append("runKey does not match the deterministic payload checksum")

    compact_size = len(
        json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )
    if compact_size > limits.max_payload_bytes:
        errors.append(
            f"payload is {compact_size} bytes; maximum is {limits.max_payload_bytes}"
        )

    if errors:
        raise DataValidationError("official 2026 snapshot rejected:\n- " + "\n- ".join(errors))

    return {
        "teams": len(teams),
        "players": len(players),
        "matches": len(matches),
        "playerSeasonStats": len(player_season),
        "teamSeasonStats": len(team_season),
        "playerMatchStats": len(player_matches),
        "finishedMatches": len(finished_ids),
        "payloadBytes": compact_size,
        "checksum": expected_checksum,
    }


def _find_ambiguous_match_ids(
    breakdowns: Mapping[str, Mapping[str, Any]],
    candidates_by_player: Mapping[str, set[str]],
    matches_by_id: Mapping[str, Mapping[str, Any]],
) -> set[str]:
    ambiguous: set[str] = set()
    for player_id, payload in breakdowns.items():
        for row in payload.get("matches") or []:
            match = row.get("match") or {}
            match_id = _official_id(
                match.get("matchId"),
                OFFICIAL_MATCH_ID,
                field="breakdown.matchId",
            )
            normalized_match = matches_by_id.get(match_id)
            if normalized_match is None:
                raise DataValidationError(
                    f"player breakdown references unknown official match {match_id}"
                )
            if normalized_match["status"] != "FINISHED":
                continue
            raw = _stats_object(row.get("playerStats") or [])
            if not _is_official_appearance(raw):
                continue
            home_id = str((match.get("home") or {}).get("teamId") or "")
            away_id = str((match.get("away") or {}).get("teamId") or "")
            intersection = {home_id, away_id}.intersection(candidates_by_player[player_id])
            if not intersection:
                raise DataValidationError(
                    f"player {player_id} has no exact candidate team in match {match_id}"
                )
            if len(intersection) == 2:
                ambiguous.add(match_id)
    return ambiguous


def build_payload(
    *,
    client: OfficialApiClient,
    workers: int = 4,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    if workers < 1:
        raise ValueError("workers must be positive")
    fetched_at = generated_at or _utc_now()
    fetched_at_iso = _iso_utc(fetched_at)

    raw_teams = fetch_teams(client)
    raw_matches = fetch_matches(client)
    teams = sorted((_normalize_team(record) for record in raw_teams), key=lambda row: row["id"])
    matches = sorted(
        (_normalize_match(record) for record in raw_matches),
        key=lambda row: row["id"],
    )
    team_ids = {team["id"] for team in teams}
    matches_by_id = {match["id"]: match for match in matches}

    roster_results = _bounded_map(
        sorted(team_ids),
        lambda team_id: fetch_roster(client, team_id),
        workers=workers,
    )
    category_jobs = [
        ("players", category) for category in PLAYER_CATEGORIES
    ] + [("teams", category) for category in TEAM_CATEGORIES]
    category_results = _bounded_map(
        category_jobs,
        lambda job: fetch_stats_category(client, entity=job[0], category=job[1]),
        workers=workers,
        label=lambda job: f"{job[0]}/{job[1]}",
    )
    player_categories = {
        category: category_results[("players", category)] for category in PLAYER_CATEGORIES
    }
    team_categories = {
        category: category_results[("teams", category)] for category in TEAM_CATEGORIES
    }
    player_entries = _merge_category_records(player_categories, entity="players")
    team_entries = _merge_category_records(team_categories, entity="teams")

    players, candidates_by_player, positions_by_player = _normalize_players(
        rosters=roster_results,
        player_stat_entries=player_entries,
        team_ids=team_ids,
    )
    published_official_player_ids = {
        str(player["officialId"]) for player in players
    }
    player_season_stats = sorted(
        (
            _player_season_row(player_id, entry)
            for player_id, entry in player_entries.items()
            if player_id in published_official_player_ids
        ),
        key=lambda row: row["playerId"],
    )
    team_season_stats = sorted(
        (_team_season_row(team_id, entry) for team_id, entry in team_entries.items()),
        key=lambda row: row["teamId"],
    )

    official_to_route = {
        str(player["officialId"]): str(player["id"]) for player in players
    }
    route_to_official = {
        route_id: official_id for official_id, route_id in official_to_route.items()
    }
    current_teams_by_player = {
        str(player["officialId"]): str(player["currentTeamId"])
        for player in players
    }
    aggregate_positive_teams: dict[str, str] = {}
    for row in player_season_stats:
        if row["gamesPlayed"] <= 0:
            continue
        official_id = route_to_official.get(str(row["playerId"]))
        if official_id is None:
            raise DataValidationError(
                f"player season row {row['playerId']} has no official player"
            )
        aggregate_positive_teams[official_id] = str(row["teamId"])

    finished_match_ids = sorted(
        match["id"] for match in matches if match["status"] == "FINISHED"
    )
    lineups_by_match_id = _bounded_map(
        finished_match_ids,
        lambda match_id: fetch_match_lineup(client, match_id),
        workers=workers,
    )
    official_lineup_appearances = _finished_lineup_appearances(
        lineups_by_match_id
    )
    lineup_appearance_keys = _finished_lineup_appearance_keys(
        official_lineup_appearances,
        official_to_route,
    )
    breakdown_jobs = _breakdown_fetch_jobs(
        aggregate_positive_teams=aggregate_positive_teams,
        lineup_appearances=official_lineup_appearances,
        candidates_by_player=candidates_by_player,
        current_teams_by_player=current_teams_by_player,
    )
    breakdowns_by_job = _bounded_map(
        breakdown_jobs,
        lambda job: fetch_player_match_breakdown(
            client,
            player_id=job[0],
            team_id=job[1],
        ),
        workers=workers,
        label=lambda job: _player_route_id(job[0]),
    )
    breakdowns = {
        player_id: breakdowns_by_job[(player_id, team_id)]
        for player_id, team_id in breakdown_jobs
    }
    if len(breakdowns) != len(breakdown_jobs):
        raise FetchError("one or more required players lack matchBreakdown data")

    ambiguous_match_ids = sorted(
        _find_ambiguous_match_ids(
            breakdowns,
            candidates_by_player,
            matches_by_id,
        )
    )
    player_match_stats = _normalize_player_match_stats(
        breakdowns=breakdowns,
        candidates_by_player=candidates_by_player,
        positions_by_player=positions_by_player,
        matches_by_id=matches_by_id,
        lineups_by_match_id=lineups_by_match_id,
    )
    stat_bearing_keys = {
        (str(row["playerId"]), str(row["matchId"])) for row in player_match_stats
    }
    stats_without_lineup = sorted(stat_bearing_keys - lineup_appearance_keys)
    if stats_without_lineup:
        preview = ", ".join(
            f"{player_id}/{match_id}"
            for player_id, match_id in stats_without_lineup[:8]
        )
        raise DataValidationError(
            f"{len(stats_without_lineup)} stat-bearing finished appearances "
            f"lack exact lineup coverage: {preview}"
        )
    player_season_ids = {str(row["playerId"]) for row in player_season_stats}
    lineup_players_without_season = sorted(
        {
            player_id
            for player_id, _match_id in lineup_appearance_keys
            if player_id not in player_season_ids
        }
    )
    if lineup_players_without_season:
        raise DataValidationError(
            f"{len(lineup_players_without_season)} finished-lineup players lack "
            "official season stats"
        )
    lineup_only_appearances_excluded = len(
        lineup_appearance_keys - stat_bearing_keys
    )
    live_player_rows_excluded = _count_live_player_rows_excluded(
        breakdowns=breakdowns,
        matches_by_id=matches_by_id,
    )
    reconciliation = _apply_season_fantasy_totals(
        player_season_stats,
        player_match_stats,
        lineup_appearance_keys,
    )
    standings_reconciliation = _apply_finished_team_standings(
        team_season_stats,
        matches,
    )

    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "season": SEASON,
        "run": {
            "runKey": "",
            "seasonId": SEASON_ID,
            "sourceProvider": "nwsl_official",
            "sourceUrl": API_ROOT,
            "generatedAt": fetched_at_iso,
            "fetchedAt": fetched_at_iso,
            "metadata": {
                "playerCategories": ",".join(PLAYER_CATEGORIES),
                "teamCategories": ",".join(TEAM_CATEGORIES),
                "scoringContract": "launchScoringRules-v1",
                "aggregatePlayerSeasonRows": len(player_season_stats),
                "positiveGamesPlayers": len(aggregate_positive_teams),
                "matchBreakdownPlayers": len(breakdown_jobs),
                "lineupAddedBreakdownPlayers": (
                    len(breakdown_jobs) - len(aggregate_positive_teams)
                ),
                "ambiguousTransferMatchesResolvedByLineup": len(ambiguous_match_ids),
                "finishedLineupsFetched": len(finished_match_ids),
                "playerStatsScope": "finished_matches_only",
                "livePlayerRowsExcluded": live_player_rows_excluded,
                "finishedLineupAppearances": len(lineup_appearance_keys),
                "statBearingMatchAppearances": len(stat_bearing_keys),
                "lineupOnlyAppearancesExcluded": lineup_only_appearances_excluded,
                "playerSeasonAggregateFields": "starts,xa,cleanSheets",
                "teamSeasonAggregateFields": (
                    "cleanSheets,shots,shotsOnTarget,xg,xga,possessionPct,"
                    "passesAttempted,passesCompleted,passAccuracyPct,"
                    "chancesCreated,tackles,tacklesWon,interceptions,"
                    "yellowCards,redCards,corners"
                ),
                **reconciliation,
                **standings_reconciliation,
            },
        },
        "teams": teams,
        "players": players,
        "matches": matches,
        "playerSeasonStats": player_season_stats,
        "teamSeasonStats": team_season_stats,
        "playerMatchStats": player_match_stats,
    }
    return finalize_payload(payload)


def _is_git_ignored(path: Path) -> bool:
    try:
        completed = subprocess.run(
            ["git", "-C", str(REPOSITORY_ROOT), "check-ignore", "-q", "--", str(path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return completed.returncode == 0


def _dotenv_value(path: Path, variable: str) -> str | None:
    if not path.is_file() or not _is_git_ignored(path):
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, raw = stripped.split("=", 1)
        if key.strip().removeprefix("export ").strip() != variable:
            continue
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        return value or None
    return None


def resolve_publish_secret(variable: str = DEFAULT_SECRET_ENV) -> str | None:
    if not re.fullmatch(r"[A-Z_][A-Z0-9_]*", variable):
        raise RefreshError(f"invalid secret environment variable name: {variable!r}")
    process_value = os.environ.get(variable)
    if process_value:
        return process_value

    candidates = [
        MODEL_ROOT / ".env.local",
        REPOSITORY_ROOT / ".env.local",
        Path.cwd() / ".env.local",
    ]
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        value = _dotenv_value(resolved, variable)
        if value:
            return value

    if sys.platform == "darwin":
        try:
            completed = subprocess.run(
                ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        if completed.returncode == 0 and completed.stdout.strip():
            return completed.stdout.strip()
    return None


def _scrub_publish_response(value: Any, secret: str) -> Any:
    if isinstance(value, dict):
        scrubbed: dict[str, Any] = {}
        for key, child in value.items():
            lower = str(key).lower()
            if any(marker in lower for marker in ("secret", "token", "authorization", "password")):
                scrubbed[str(key)] = "[redacted]"
            else:
                scrubbed[str(key)] = _scrub_publish_response(child, secret)
        return scrubbed
    if isinstance(value, list):
        return [_scrub_publish_response(child, secret) for child in value[:100]]
    if isinstance(value, str) and secret and secret in value:
        return value.replace(secret, "[redacted]")
    return value


def publish_payload(
    payload: Mapping[str, Any],
    *,
    publish_url: str = DEFAULT_PUBLISH_URL,
    secret: str,
    timeout: float = 45.0,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> dict[str, Any]:
    try:
        result = publish_with_readback(
            payload=payload,
            publish_url=publish_url,
            secret=secret,
            expected={"runKey": payload["run"]["runKey"]},
            timeout=timeout,
            opener=opener,
        )
    except PublicationError as exc:
        raise RefreshError(str(exc)) from exc
    return _scrub_publish_response(result, secret)


def write_payload(payload: Mapping[str, Any], output: Path) -> Path:
    path = output if output.is_absolute() else (MODEL_ROOT / output)
    path = path.resolve(strict=False)
    if path.exists() and (path.is_dir() or path.is_symlink()):
        raise RefreshError(f"refusing to replace non-regular output path: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(
                payload,
                handle,
                ensure_ascii=False,
                allow_nan=False,
                indent=2,
                sort_keys=True,
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return path


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Refresh and publish fail-closed official NWSL 2026 public data"
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--no-publish", action="store_true")
    parser.add_argument("--publish-url", default=DEFAULT_PUBLISH_URL)
    parser.add_argument("--secret-env", default=DEFAULT_SECRET_ENV)
    parser.add_argument("--workers", type=_positive_int, default=4)
    parser.add_argument("--timeout", type=float, default=30.0)
    args = parser.parse_args(argv)

    client = OfficialApiClient(timeout=args.timeout)
    try:
        payload = build_payload(client=client, workers=args.workers)
        report = validate_payload(payload)
        output = write_payload(payload, args.output)
        result: dict[str, Any] = {
            "status": "validated",
            "output": str(output),
            "outputBytes": output.stat().st_size,
            "runKey": payload["run"]["runKey"],
            "counts": report,
        }
        if not args.no_publish:
            secret = resolve_publish_secret(args.secret_env)
            if not secret:
                raise RefreshError(
                    f"cannot publish: {args.secret_env} was not found in the process, "
                    "an ignored .env.local, or macOS Keychain"
                )
            result["publication"] = publish_payload(
                payload,
                publish_url=args.publish_url,
                secret=secret,
            )
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        if "publication" in result:
            print(
                "PUBLICATION "
                f"publisher=public_data "
                f"status={result['publication']['status']} "
                f"run={payload['run']['runKey']}"
            )
        return 0
    except RefreshError as exc:
        print(f"refresh blocked: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
