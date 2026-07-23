"""Helpers for refreshing official NWSL API season data."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from collections.abc import Iterable
from typing import Any

import pandas as pd

API_ROOT = "https://api-sdp.nwslsoccer.com/v1/nwsl/football"


def _snake(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", value.strip()).strip("_").lower()
    return normalized


def stat_column_name(stat: dict[str, Any]) -> str:
    raw = str(stat.get("statsId") or stat.get("statsLabel") or "")
    column = _snake(raw)
    aliases = {
        "aerials_won_perc": "aerials_won_perc",
        "xg": "xg",
        "xgefficiency": "xgefficiency",
        "blocked_shots": "blocked_shots",
        "time_played": "time_played",
    }
    return aliases.get(column, column)


def _stat_values(stats: Iterable[dict[str, Any]]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for stat in stats:
        column = stat_column_name(stat)
        if not column:
            continue
        value = stat.get("statsValue")
        if column not in values or pd.isna(values[column]):
            values[column] = value
    return values


def _team_metadata(team: dict[str, Any], prefix: str = "team") -> dict[str, Any]:
    return {
        f"{prefix}_id": team.get("teamId"),
        f"{prefix}_provider_id": team.get("providerId"),
        f"{prefix}_short_name": team.get("shortName"),
        f"{prefix}_official_name": team.get("officialName"),
        f"{prefix}_acronym_name": team.get("acronymName"),
        f"{prefix}_media_name": team.get("mediaName"),
        f"{prefix}_country_code": team.get("countryCode"),
    }


def flatten_player_stats(
    records: Iterable[dict[str, Any]],
    *,
    season: int,
    season_id: str,
    category: str,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for player in records:
        team = player.get("team") or {}
        row = {
            "season": season,
            "season_id": season_id,
            "player_id": player.get("playerId"),
            "provider_id": player.get("providerId"),
            "team_team_id": team.get("teamId"),
            "team_official_name": team.get("officialName"),
            "media_first_name": player.get("mediaFirstName"),
            "media_last_name": player.get("mediaLastName"),
            "short_name": player.get("shortName"),
            "role_label": player.get("roleLabel"),
            "nationality": player.get("nationality"),
            "bib_number": player.get("bibNumber"),
            "role": player.get("role"),
            "display_name": player.get("displayName"),
            "nationality_iso_code": player.get("nationalityIsoCode"),
            "rank_label": player.get("rankLabel"),
            "team_provider_id": team.get("providerId"),
            "team_short_name": team.get("shortName"),
            "team_acronym_name": team.get("acronymName"),
            "team_media_name": team.get("mediaName"),
            "team_country_code": team.get("countryCode"),
            f"source_category_{category}": True,
        }
        row.update(_stat_values(player.get("stats") or []))
        rows.append(row)
    return pd.DataFrame(rows)


def flatten_team_stats(
    records: Iterable[dict[str, Any]],
    *,
    season: int,
    season_id: str,
    category: str,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for team in records:
        row = {
            "season": season,
            "season_id": season_id,
            "team_id": team.get("teamId"),
            "provider_id": team.get("providerId"),
            "official_name": team.get("officialName"),
            "short_name": team.get("shortName"),
            "acronym_name": team.get("acronymName"),
            "media_name": team.get("mediaName"),
            "country_code": team.get("countryCode"),
            "team_type": team.get("teamType"),
            f"source_category_{category}": True,
        }
        row.update(_stat_values(team.get("stats") or []))
        rows.append(row)
    return pd.DataFrame(rows)


def merge_category_frames(frames: Iterable[pd.DataFrame], key: str) -> pd.DataFrame:
    merged: pd.DataFrame | None = None
    for frame in frames:
        if frame.empty:
            continue
        if merged is None:
            merged = frame.copy()
            continue
        new_columns = [column for column in frame.columns if column not in merged.columns or column == key]
        merged = merged.merge(frame[new_columns], on=key, how="outer")
    return merged if merged is not None else pd.DataFrame()


def flatten_matches(records: Iterable[dict[str, Any]], *, season: int, season_id: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for match in records:
        home = match.get("home") or {}
        away = match.get("away") or {}
        editorial = match.get("editorial") or {}
        rows.append(
            {
                "season": season,
                "season_id": season_id,
                "match_id": match.get("matchId"),
                "provider_id": match.get("providerId"),
                "status": match.get("status"),
                "provider_status": match.get("providerStatus"),
                "phase": match.get("phase"),
                "match_date_utc": match.get("matchDateUtc"),
                "match_date_local": match.get("matchDateLocal"),
                "local_time_utc_offset": match.get("localTimeUtcOffset"),
                "home_team_id": home.get("teamId"),
                "home_official_name": home.get("officialName"),
                "away_team_id": away.get("teamId"),
                "away_official_name": away.get("officialName"),
                "home_score": match.get("providerHomeScore", match.get("homeScorePush")),
                "away_score": match.get("providerAwayScore", match.get("awayScorePush")),
                "round_name": match.get("roundName"),
                "match_week": match.get("matchWeek"),
                "stadium_name": match.get("stadiumName"),
                "city_name": match.get("cityName"),
                "win_reason": match.get("winReason"),
                "win_team_id": match.get("winTeamId"),
                "stadium_id": match.get("stadiumId"),
                "round_id": match.get("roundId"),
                "highlights_url": editorial.get("highlightsUrl"),
                "tickets_url": editorial.get("ticketsUrl"),
                "home_provider_id": home.get("providerId"),
                "home_short_name": home.get("shortName"),
                "home_acronym_name": home.get("acronymName"),
                "home_media_name": home.get("mediaName"),
                "home_country_code": home.get("countryCode"),
                "away_provider_id": away.get("providerId"),
                "away_short_name": away.get("shortName"),
                "away_acronym_name": away.get("acronymName"),
                "away_media_name": away.get("mediaName"),
                "away_country_code": away.get("countryCode"),
            }
        )
    return pd.DataFrame(rows)


def flatten_profiles(
    teams: Iterable[dict[str, Any]],
    rosters_by_team_id: dict[str, list[dict[str, Any]]],
    *,
    season: int,
    season_id: str,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for team in teams:
        team_id = str(team.get("teamId") or "")
        for player in rosters_by_team_id.get(team_id, []):
            rows.append(
                {
                    "season": season,
                    "season_id": season_id,
                    "player_id": player.get("playerId"),
                    "provider_id": player.get("providerId"),
                    "team_id": team.get("teamId"),
                    "team_name": team.get("officialName") or team.get("mediaName"),
                    "media_first_name": player.get("mediaFirstName"),
                    "media_last_name": player.get("mediaLastName"),
                    "short_name": player.get("shortName"),
                    "role_label": player.get("roleLabel"),
                    "date_of_birth": player.get("dateOfBirth"),
                    "height_cm": player.get("heightCm"),
                    "weight_kg": player.get("weightKg"),
                    "nationality": player.get("nationality"),
                    "team_acronym_name": team.get("acronymName"),
                    "player_status": player.get("playerStatus"),
                    "bib_number": player.get("bibNumber"),
                    "nationality_iso_code": player.get("nationalityIsoCode"),
                }
            )
    return pd.DataFrame(rows)


def fetch_json(url: str, *, timeout: int = 30) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_paginated_stats(
    *,
    season_id: str,
    category: str,
    entity: str,
    page_size: int = 500,
    sleep_seconds: float = 0.0,
) -> list[dict[str, Any]]:
    encoded_season = urllib.parse.quote(season_id, safe=":")
    page = 1
    rows: list[dict[str, Any]] = []
    while True:
        url = (
            f"{API_ROOT}/seasons/{encoded_season}/stats/{entity}"
            f"?locale=en-US&category={urllib.parse.quote(category)}"
            f"&page={page}&pageNumElement={page_size}"
        )
        data = fetch_json(url)
        rows.extend(data.get(entity) or [])
        pagination = data.get("pagination") or {}
        if pagination.get("isLastPage", True):
            break
        page += 1
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)
    return rows


def fetch_season_matches(*, season_id: str) -> list[dict[str, Any]]:
    encoded_season = urllib.parse.quote(season_id, safe=":")
    data = fetch_json(f"{API_ROOT}/seasons/{encoded_season}/matches?locale=en-US&page=1&pageNumElement=500")
    return data.get("matches") or []


def fetch_season_teams(*, season_id: str) -> list[dict[str, Any]]:
    encoded_season = urllib.parse.quote(season_id, safe=":")
    data = fetch_json(f"{API_ROOT}/seasons/{encoded_season}/teams?locale=en-US")
    return data.get("teams") or []


def fetch_team_roster(*, team_id: str, season_id: str) -> list[dict[str, Any]]:
    encoded_team = urllib.parse.quote(team_id, safe=":")
    encoded_season = urllib.parse.quote(season_id, safe=":")
    url = f"{API_ROOT}/teams/{encoded_team}/roster?locale=en-US&seasonId={encoded_season}"
    data = fetch_json(url)
    return data.get("players") or []


def fetch_match_lineup(*, season_id: str, match_id: str) -> dict[str, Any]:
    encoded_season = urllib.parse.quote(season_id, safe=":")
    encoded_match = urllib.parse.quote(match_id, safe=":")
    url = f"{API_ROOT}/seasons/{encoded_season}/matches/{encoded_match}/lineups?locale=en-US"
    return fetch_json(url)


def _event_minute(events: Iterable[dict[str, Any]], event_type: str) -> float | None:
    for event in events or []:
        if event.get("type") == event_type:
            base = pd.to_numeric(event.get("time"), errors="coerce")
            extra = pd.to_numeric(event.get("additionalTime"), errors="coerce")
            if pd.isna(base):
                continue
            return float(base) + (0.0 if pd.isna(extra) else float(extra))
    return None


def flatten_match_lineup(
    payload: dict[str, Any],
    *,
    match_id: str,
    season: int,
    regulation_minutes: int = 90,
) -> pd.DataFrame:
    """Flatten a match lineup payload into per-player appearance rows.

    Starters come from ``fielded`` (start minute 0); substitutes come from
    ``benched`` and are only included if they have a ``substitution-in`` event.
    Minutes are derived from substitution event times.
    """
    columns = [
        "match_id",
        "season",
        "team_id",
        "team_name",
        "player_id",
        "role_label",
        "gamestarted",
        "totalsubon",
        "minsplayed",
        "minutes",
    ]
    rows: list[dict[str, Any]] = []
    for side in ("home", "away"):
        team = payload.get(side) or {}
        team_id = team.get("teamId")
        team_name = team.get("officialName") or team.get("shortName")
        for player in team.get("fielded") or []:
            events = player.get("events") or []
            out_minute = _event_minute(events, "substitution-out")
            end = regulation_minutes if out_minute is None else out_minute
            rows.append(
                {
                    "match_id": match_id,
                    "season": season,
                    "team_id": team_id,
                    "team_name": team_name,
                    "player_id": str(player.get("playerId")),
                    "role_label": player.get("roleLabel") or "Unknown",
                    "gamestarted": 1,
                    "totalsubon": 0.0,
                    "minsplayed": max(float(end), 0.0),
                    "minutes": max(float(end), 0.0),
                }
            )
        for player in team.get("benched") or []:
            events = player.get("events") or []
            in_minute = _event_minute(events, "substitution-in")
            if in_minute is None:
                continue  # unused substitute, not an appearance
            out_minute = _event_minute(events, "substitution-out")
            end = regulation_minutes if out_minute is None else out_minute
            minutes = max(float(end) - float(in_minute), 0.0)
            rows.append(
                {
                    "match_id": match_id,
                    "season": season,
                    "team_id": team_id,
                    "team_name": team_name,
                    "player_id": str(player.get("playerId")),
                    "role_label": player.get("roleLabel") or "Unknown",
                    "gamestarted": 0,
                    "totalsubon": float(in_minute),
                    "minsplayed": minutes,
                    "minutes": minutes,
                }
            )
    return pd.DataFrame(rows, columns=columns)
