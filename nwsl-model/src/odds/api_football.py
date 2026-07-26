"""API-Football NWSL totals feed normalization.

The provider is intentionally a shadow lane. It writes a separate current
contract and snapshot history; it never mutates ``data/raw/odds.csv`` or the
frozen pick policy's eligible quote set.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Callable
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from src.data.team_names import normalize_team_key
from src.odds.apify_footystats import ODDS_CONTRACT_COLUMNS
from src.utils.dates import parse_mixed_utc_datetime

DEFAULT_API_FOOTBALL_FEED_URL = (
    "https://ncaa-zach-soskins-projects-95c2533d.vercel.app/api/nwsl/odds"
)
EXPECTED_CONTRACT_VERSION = "nwsl-api-football-v1"

API_FOOTBALL_TEAM_ALIASES = {
    "angel city": "angel city fc",
    "angel city fc": "angel city fc",
    "bay": "bay fc",
    "bay fc": "bay fc",
    "boston legacy": "boston legacy fc",
    "boston legacy fc": "boston legacy fc",
    "chicago stars": "chicago stars fc",
    "chicago stars fc": "chicago stars fc",
    "denver summit": "denver summit fc",
    "denver summit fc": "denver summit fc",
    "gotham": "gotham fc",
    "gotham fc": "gotham fc",
    "nj ny gotham fc": "gotham fc",
    "njny gotham fc": "gotham fc",
    "houston dash": "houston dash",
    "kansas city": "kansas city current",
    "kansas city current": "kansas city current",
    "north carolina courage": "north carolina courage",
    "orlando pride": "orlando pride",
    "portland thorns": "portland thorns fc",
    "portland thorns fc": "portland thorns fc",
    "racing louisville": "racing louisville fc",
    "racing louisville fc": "racing louisville fc",
    "san diego wave": "san diego wave fc",
    "san diego wave fc": "san diego wave fc",
    "seattle reign": "seattle reign fc",
    "seattle reign fc": "seattle reign fc",
    "utah royals": "utah royals",
    "utah royals fc": "utah royals",
    "washington spirit": "washington spirit",
}


def api_football_team_key(value: Any) -> str:
    key = normalize_team_key(str(value or ""))
    for suffix in (" women", " woman", " w"):
        if key.endswith(suffix):
            key = key[: -len(suffix)].strip()
            break
    return API_FOOTBALL_TEAM_ALIASES.get(key, key)


def _valid_decimal(value: Any) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if np.isfinite(price) and price > 1.0 else None


def _valid_line(value: Any) -> float | None:
    try:
        line = float(value)
    except (TypeError, ValueError):
        return None
    return line if np.isfinite(line) and 0.5 <= line <= 10.0 else None


def validate_feed(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("API-Football feed must be a JSON object")
    if payload.get("contractVersion") != EXPECTED_CONTRACT_VERSION:
        raise ValueError("API-Football feed contract version mismatch")
    if payload.get("source") != "api-football":
        raise ValueError("API-Football feed source mismatch")
    if payload.get("status") not in {"ok", "partial"}:
        raise ValueError("API-Football feed is unavailable")
    fixtures = payload.get("fixtures")
    if not isinstance(fixtures, list):
        raise ValueError("API-Football feed fixtures must be a list")
    return payload


class ApiFootballFeedClient:
    def __init__(
        self,
        url: str = DEFAULT_API_FOOTBALL_FEED_URL,
        *,
        opener: Callable[..., Any] | None = None,
        timeout_seconds: int = 30,
    ) -> None:
        self.url = str(url)
        self._opener = opener or urlopen
        self.timeout_seconds = int(timeout_seconds)

    def fetch(self) -> dict[str, Any]:
        request = Request(
            self.url,
            headers={
                "Accept": "application/json",
                "User-Agent": "nwsl-model/0.1",
            },
        )
        with self._opener(request, timeout=self.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return validate_feed(payload)


def flatten_api_football_totals(
    feed: dict[str, Any],
    *,
    captured_at: datetime | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Flatten provider fixtures into one paired total row per sportsbook."""
    validated = validate_feed(feed)
    fallback_timestamp = (
        captured_at or datetime.now(UTC)
    ).astimezone(UTC).isoformat()
    generated_at = str(validated.get("generatedAt") or fallback_timestamp)
    rows: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for fixture in validated["fixtures"]:
        fixture_id = str(fixture.get("fixtureId") or "")
        kickoff = str(fixture.get("kickoff") or "")
        home_team = str(fixture.get("homeTeam") or "")
        away_team = str(fixture.get("awayTeam") or "")
        timestamp = str(fixture.get("updatedAt") or generated_at)
        books = fixture.get("books")
        identity_valid = bool(
            fixture_id
            and home_team
            and away_team
            and not pd.isna(pd.to_datetime(kickoff, utc=True, errors="coerce"))
            and not pd.isna(pd.to_datetime(timestamp, utc=True, errors="coerce"))
            and isinstance(books, list)
        )
        if not identity_valid:
            rejected.append(
                {
                    "provider_fixture_id": fixture_id,
                    "home_team": home_team,
                    "away_team": away_team,
                    "reason": "invalid_fixture_identity",
                }
            )
            continue

        accepted_books = 0
        for book in books:
            total = book.get("total") if isinstance(book, dict) else None
            sportsbook = str(book.get("book") or "") if isinstance(book, dict) else ""
            line = _valid_line(total.get("line")) if isinstance(total, dict) else None
            over_odds = _valid_decimal(total.get("over")) if isinstance(total, dict) else None
            under_odds = _valid_decimal(total.get("under")) if isinstance(total, dict) else None
            if not sportsbook or line is None or over_odds is None or under_odds is None:
                rejected.append(
                    {
                        "provider_fixture_id": fixture_id,
                        "home_team": home_team,
                        "away_team": away_team,
                        "sportsbook": sportsbook,
                        "reason": "invalid_paired_total",
                    }
                )
                continue
            accepted_books += 1
            rows.append(
                {
                    "provider_fixture_id": fixture_id,
                    "kickoff": kickoff,
                    "home_team": home_team,
                    "away_team": away_team,
                    "timestamp": timestamp,
                    "sportsbook": sportsbook,
                    "line": line,
                    "over_odds": over_odds,
                    "under_odds": under_odds,
                }
            )
        if accepted_books == 0 and isinstance(books, list) and not books:
            rejected.append(
                {
                    "provider_fixture_id": fixture_id,
                    "home_team": home_team,
                    "away_team": away_team,
                    "reason": "missing_total_books",
                }
            )

    flattened = pd.DataFrame(rows)
    if not flattened.empty:
        flattened = flattened.sort_values(
            ["kickoff", "provider_fixture_id", "sportsbook", "line"]
        ).reset_index(drop=True)
    return flattened, pd.DataFrame(rejected)


def build_api_football_shadow_contract(
    flattened: pd.DataFrame,
    upcoming_matches: pd.DataFrame,
    *,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match API-Football total quotes to ESPN fixture IDs."""
    if flattened.empty:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS), flattened.copy()

    upcoming = upcoming_matches.copy()
    upcoming["match_id"] = upcoming["match_id"].astype(str)
    upcoming["match_date_dt"] = pd.to_datetime(
        upcoming["match_date"], errors="coerce"
    ).dt.date
    upcoming["home_key"] = upcoming["home_team"].map(api_football_team_key)
    upcoming["away_key"] = upcoming["away_team"].map(api_football_team_key)

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    for row in flattened.itertuples(index=False):
        kickoff = parse_mixed_utc_datetime(pd.Series([row.kickoff])).iloc[0]
        match_date = kickoff.date() if pd.notna(kickoff) else None
        home_key = api_football_team_key(row.home_team)
        away_key = api_football_team_key(row.away_team)
        candidates = upcoming[
            upcoming["home_key"].eq(home_key)
            & upcoming["away_key"].eq(away_key)
        ].copy()
        if not candidates.empty and match_date is not None:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda value: abs((value - match_date).days)
                if pd.notna(value)
                else 999
            )
            candidates = candidates[
                candidates["date_delta_days"] <= int(max_date_delta_days)
            ].sort_values(["date_delta_days", "match_date_dt", "match_id"])
        if candidates.empty:
            payload = row._asdict()
            payload["reason"] = "no_upcoming_match"
            unmatched_rows.append(payload)
            continue
        contract_rows.append(
            {
                "match_id": str(candidates.iloc[0]["match_id"]),
                "timestamp": row.timestamp,
                "sportsbook": row.sportsbook,
                "market_type": "total",
                "line": float(row.line),
                "home_odds": np.nan,
                "draw_odds": np.nan,
                "away_odds": np.nan,
                "over_odds": float(row.over_odds),
                "under_odds": float(row.under_odds),
                "source_type": "shadow",
            }
        )

    contract = pd.DataFrame(contract_rows, columns=ODDS_CONTRACT_COLUMNS)
    if not contract.empty:
        contract = contract.drop_duplicates().sort_values(
            ["match_id", "sportsbook", "line"]
        ).reset_index(drop=True)
    return contract, pd.DataFrame(unmatched_rows)
