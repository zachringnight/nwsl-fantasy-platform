"""Apify-powered DraftKings NWSL odds import helpers.

DraftKings is the real US sportsbook the model bets against, so edge/EV is
computed against prices the user can actually take. The primary source is the
Zen Studio DraftKings Standby endpoint hosted on Apify. It returns structured
moneyline and total markets and is authenticated with an ``Authorization``
bearer header.

The older browser scraper remains available for explicit diagnostics. The DK
NWSL page is Akamai/geo-blocked, so that path uses an Apify web-scraper run
with a US residential proxy. The rendered page exposes one block per game:

    <home team> / VS / <away team> / <home odds> / <draw odds> / <away odds>
    / <kickoff datetime> / More Bets

Teams are suffixed " [W]" and American odds use the unicode minus sign
(U+2212) for favorites.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Collection
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from src.data.team_names import normalize_team_key

UTC = timezone.utc

APIFY_DRAFTKINGS_STANDBY_BASE_URL = "https://zen-studio--draftkings-odds.apify.actor"
DRAFTKINGS_NWSL_LEAGUE_ID = "37539"
DRAFTKINGS_NWSL_API_URL = (
    f"{APIFY_DRAFTKINGS_STANDBY_BASE_URL}/leagues/{DRAFTKINGS_NWSL_LEAGUE_ID}?market=all"
)
APIFY_WEB_SCRAPER_ACTOR = "apify~web-scraper"
DRAFTKINGS_NWSL_MONEYLINE_URL = (
    "https://sportsbook.draftkings.com/leagues/soccer/usa---nwsl"
    "?category=game-lines&subcategory=moneyline-(regular-time)"
)

ODDS_CONTRACT_COLUMNS = [
    "match_id",
    "timestamp",
    "sportsbook",
    "market_type",
    "line",
    "home_odds",
    "draw_odds",
    "away_odds",
    "over_odds",
    "under_odds",
    "source_type",
]

DRAFTKINGS_API_PARSED_COLUMNS = [
    "provider_event_id",
    "match_date",
    "start_time",
    "event_status",
    "home_team",
    "away_team",
    "timestamp",
    "sportsbook",
    "provider_market_name",
    "market_type",
    "line",
    "home_odds",
    "draw_odds",
    "away_odds",
    "over_odds",
    "under_odds",
    "source_type",
]

DRAFTKINGS_API_REJECTED_COLUMNS = [
    "provider_event_id",
    "start_time",
    "home_team",
    "away_team",
    "market_type",
    "market_name",
    "reason",
]

# DraftKings team labels -> canonical names matching data/raw/upcoming.csv.
# Keys are normalized via normalize_team_key after the " [W]" suffix is stripped.
DRAFTKINGS_TEAM_ALIASES = {
    "angel city": "Angel City FC",
    "angel city fc": "Angel City FC",
    "bay": "Bay FC",
    "bay fc": "Bay FC",
    "boston legacy": "Boston Legacy FC",
    "boston legacy fc": "Boston Legacy FC",
    "chicago red stars": "Chicago Stars FC",
    "chicago stars": "Chicago Stars FC",
    "chicago stars fc": "Chicago Stars FC",
    "denver summit": "Denver Summit FC",
    "denver summit fc": "Denver Summit FC",
    "gotham fc": "Gotham FC",
    "nj ny gotham fc": "Gotham FC",
    "njny gotham fc": "Gotham FC",
    "houston dash": "Houston Dash",
    "kansas city": "Kansas City Current",
    "kansas city current": "Kansas City Current",
    "north carolina courage": "North Carolina Courage",
    "orlando pride": "Orlando Pride",
    "portland thorns": "Portland Thorns FC",
    "portland thorns fc": "Portland Thorns FC",
    "racing louisville": "Racing Louisville FC",
    "racing louisville fc": "Racing Louisville FC",
    "san diego wave": "San Diego Wave FC",
    "san diego wave fc": "San Diego Wave FC",
    "seattle reign": "Seattle Reign FC",
    "seattle reign fc": "Seattle Reign FC",
    "utah royals": "Utah Royals",
    "washington spirit": "Washington Spirit",
}

_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
_AMERICAN_ODDS_RE = re.compile(r"^[+\-−]\d+$")
_KICKOFF_DATE_RE = re.compile(r"([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?", re.IGNORECASE)


def _clean_token(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def american_to_decimal(value: str | int | float) -> float:
    """Convert American odds (incl. unicode-minus favorites) to decimal odds."""
    text = _clean_token(str(value)).replace("−", "-")
    american = int(text)
    if american > 0:
        return 1.0 + american / 100.0
    return 1.0 + 100.0 / abs(american)


def _valid_decimal(value: Any) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if np.isfinite(price) and price > 1.0 else None


def _valid_total_line(value: Any) -> float | None:
    try:
        line = float(value)
    except (TypeError, ValueError):
        return None
    return line if np.isfinite(line) and 0.0 < line <= 20.0 else None


def _selection_decimal_price(selection: dict[str, Any]) -> float | None:
    decimal = _valid_decimal(selection.get("decimalOdds") or selection.get("decimal_odds"))
    if decimal is not None:
        return decimal

    raw = selection.get("odds")
    if raw in (None, ""):
        raw = selection.get("americanOdds")
    if raw in (None, ""):
        return None
    try:
        return american_to_decimal(raw)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _provider_team_name(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("name") or value.get("label")
    return _clean_token(str(value or ""))


def _provider_event_source_type(status: Any) -> str | None:
    normalized = re.sub(r"[^A-Z]+", "_", str(status or "").upper()).strip("_")
    prematch_statuses = {
        "NOT_STARTED",
        "SCHEDULED",
        "PRE_GAME",
        "PREGAME",
        "OPEN",
    }
    live_statuses = {
        "STARTED",
        "LIVE",
        "IN_PROGRESS",
        "IN_PLAY",
        "FIRST_HALF",
        "HALFTIME",
        "SECOND_HALF",
        "OVERTIME",
    }
    if normalized in prematch_statuses:
        return "current"
    if normalized in live_statuses:
        return "live"
    return None


def _total_market_priority(name: Any) -> tuple[int, str]:
    """Prefer the standard soccer totals menu when equivalent lines repeat."""
    normalized = _clean_token(str(name or "")).casefold()
    if normalized == "total goals":
        return (0, normalized)
    if normalized == "total":
        return (1, normalized)
    return (2, normalized)


def validate_draftkings_api_payload(payload: Any) -> dict[str, Any]:
    """Validate the Zen Studio NWSL response without weakening its timestamp."""
    if not isinstance(payload, dict):
        raise ValueError("DraftKings Standby response must be a JSON object")
    if payload.get("success") is not True:
        raise ValueError("DraftKings Standby response did not report success")

    league = payload.get("league")
    league_id = str(league.get("id") or "") if isinstance(league, dict) else ""
    if league_id != DRAFTKINGS_NWSL_LEAGUE_ID:
        raise ValueError("DraftKings Standby response league does not match NWSL")

    scraped_at = str(payload.get("scrapedAt") or "")
    if pd.isna(pd.to_datetime(scraped_at, utc=True, errors="coerce")):
        raise ValueError("DraftKings Standby response has no valid scrapedAt")
    if not isinstance(payload.get("events"), list):
        raise ValueError("DraftKings Standby response events must be a list")
    return payload


def fetch_draftkings_api_payload(
    token: str,
    *,
    url: str = DRAFTKINGS_NWSL_API_URL,
    opener: Callable[..., Any] | None = None,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    """Fetch the structured NWSL feed with bearer auth and no token in the URL."""
    if not token:
        raise RuntimeError("APIFY_TOKEN is not configured.")
    request = Request(
        str(url),
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "nwsl-model/0.1",
        },
    )
    with (opener or urlopen)(request, timeout=int(timeout_seconds)) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return validate_draftkings_api_payload(payload)


def parse_draftkings_api_payload(
    payload: Any,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Flatten valid main moneyline and paired-total markets from Standby JSON."""
    data = validate_draftkings_api_payload(payload)
    scraped_at = str(data["scrapedAt"])
    rows: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for event in data["events"]:
        if not isinstance(event, dict):
            rejected.append({"reason": "invalid_event"})
            continue

        provider_event_id = str(event.get("id") or event.get("eventId") or "")
        start_time = str(event.get("startTime") or "")
        home_team = _provider_team_name(event.get("homeTeam"))
        away_team = _provider_team_name(event.get("awayTeam"))
        event_status = str(event.get("status") or "")
        kickoff = pd.to_datetime(start_time, utc=True, errors="coerce")
        identity = {
            "provider_event_id": provider_event_id,
            "start_time": start_time,
            "home_team": home_team,
            "away_team": away_team,
        }
        if not provider_event_id or not home_team or not away_team or pd.isna(kickoff):
            rejected.append({**identity, "reason": "invalid_event_identity"})
            continue
        source_type = _provider_event_source_type(event_status)
        if source_type is None:
            rejected.append(
                {
                    **identity,
                    "reason": "unsupported_event_status",
                }
            )
            continue

        market_count_before = len(rows)
        markets = event.get("markets")
        if not isinstance(markets, list):
            rejected.append({**identity, "reason": "missing_markets"})
            continue

        for market in markets:
            if not isinstance(market, dict):
                continue
            market_type = str(market.get("type") or "").strip().lower()
            market_name = str(market.get("name") or "")
            if market_type not in {"moneyline", "total", "totals"}:
                continue
            if market.get("isMain") is not True:
                continue
            if market_type == "moneyline" and _clean_token(market_name).casefold() == "tie no bet":
                continue

            selections = market.get("selections")
            if not isinstance(selections, list):
                rejected.append(
                    {
                        **identity,
                        "market_type": market_type,
                        "market_name": market_name,
                        "reason": "missing_market_selections",
                    }
                )
                continue

            common = {
                "provider_event_id": provider_event_id,
                "match_date": kickoff.date().isoformat(),
                "start_time": start_time,
                "event_status": event_status,
                "home_team": home_team,
                "away_team": away_team,
                "timestamp": scraped_at,
                "sportsbook": "DraftKings",
                "provider_market_name": market_name,
                "source_type": source_type,
            }
            market_identity = {
                **identity,
                "market_type": market_type,
                "market_name": market_name,
            }

            if market_type == "moneyline":
                prices: dict[str, float] = {}
                duplicate_outcome = False
                for selection in selections:
                    if not isinstance(selection, dict):
                        continue
                    outcome = str(selection.get("outcome") or "").lower()
                    if outcome not in {"home", "tie", "away"}:
                        continue
                    price = _selection_decimal_price(selection)
                    if price is None or outcome in prices:
                        duplicate_outcome = True
                        continue
                    prices[outcome] = price
                if duplicate_outcome or set(prices) != {"home", "tie", "away"}:
                    rejected.append(
                        {
                            **market_identity,
                            "reason": "invalid_moneyline_outcomes",
                        }
                    )
                    continue
                rows.append(
                    {
                        **common,
                        "market_type": "1x2",
                        "line": np.nan,
                        "home_odds": prices["home"],
                        "draw_odds": prices["tie"],
                        "away_odds": prices["away"],
                        "over_odds": np.nan,
                        "under_odds": np.nan,
                    }
                )
                continue

            market_line = _valid_total_line(market.get("line"))
            total_prices: dict[float, dict[str, float]] = {}
            duplicate_lines: set[float] = set()
            for selection in selections:
                if not isinstance(selection, dict):
                    continue
                outcome = str(selection.get("outcome") or "").lower()
                if outcome not in {"over", "under"}:
                    continue
                price = _selection_decimal_price(selection)
                line = _valid_total_line(selection.get("points"))
                if line is None:
                    line = market_line
                if price is None or line is None:
                    continue
                normalized_line = round(line, 8)
                paired = total_prices.setdefault(normalized_line, {})
                if outcome in paired:
                    duplicate_lines.add(normalized_line)
                    continue
                paired[outcome] = price

            valid_lines = 0
            for line, paired in sorted(total_prices.items()):
                if line in duplicate_lines or set(paired) != {"over", "under"}:
                    continue
                rows.append(
                    {
                        **common,
                        "market_type": "total",
                        "line": line,
                        "home_odds": np.nan,
                        "draw_odds": np.nan,
                        "away_odds": np.nan,
                        "over_odds": paired["over"],
                        "under_odds": paired["under"],
                    }
                )
                valid_lines += 1

            if valid_lines == 0:
                rejected.append(
                    {
                        **market_identity,
                        "reason": "invalid_paired_total",
                    }
                )

        if len(rows) == market_count_before:
            rejected.append({**identity, "reason": "no_valid_supported_markets"})

    parsed = pd.DataFrame(rows, columns=DRAFTKINGS_API_PARSED_COLUMNS)
    if not parsed.empty:
        parsed["_market_priority"] = parsed["provider_market_name"].map(
            lambda value: _total_market_priority(value)[0]
        )
        parsed = (
            parsed.sort_values(
                [
                    "match_date",
                    "provider_event_id",
                    "market_type",
                    "line",
                    "_market_priority",
                    "provider_market_name",
                ],
                na_position="first",
            )
            .drop_duplicates(
                [
                    "provider_event_id",
                    "market_type",
                    "line",
                ],
                keep="first",
            )
            .drop(columns="_market_priority")
            .reset_index(drop=True)
        )
    rejected_frame = pd.DataFrame(
        rejected,
        columns=DRAFTKINGS_API_REJECTED_COLUMNS,
    )
    return parsed, rejected_frame


def _is_american_odds(value: str) -> bool:
    return bool(_AMERICAN_ODDS_RE.match(_clean_token(value)))


def _strip_w_suffix(value: str) -> str:
    cleaned = _clean_token(value)
    return re.sub(r"\s*\[\s*W\s*\]\s*$", "", cleaned, flags=re.IGNORECASE).strip()


def _parse_kickoff_date(line: str, reference: date) -> str | None:
    match = _KICKOFF_DATE_RE.search(line)
    if not match:
        return None
    month = _MONTHS.get(match.group(1)[:3].lower())
    if month is None:
        return None
    day = int(match.group(2))
    year = reference.year
    parsed = date(year, month, day)
    # DK kickoff lines carry no year; roll forward if the date sits well in the
    # past relative to the capture time (handles a December->January boundary).
    if (reference - parsed).days > 180:
        parsed = date(year + 1, month, day)
    return parsed.isoformat()


def parse_draftkings_odds_text(text: str, reference_date: date | None = None) -> pd.DataFrame:
    """Parse DraftKings NWSL 3-way moneyline blocks from web-scraper text."""
    reference = reference_date or datetime.now(UTC).date()
    tokens = [_clean_token(line) for line in text.splitlines()]
    tokens = [token for token in tokens if token]

    rows: list[dict[str, Any]] = []
    for i, token in enumerate(tokens):
        if token.lower() != "vs":
            continue
        if i < 1 or i + 5 >= len(tokens):
            continue
        home_team = tokens[i - 1]
        away_team = tokens[i + 1]
        home_raw, draw_raw, away_raw = tokens[i + 2], tokens[i + 3], tokens[i + 4]
        if not (
            _is_american_odds(home_raw)
            and _is_american_odds(draw_raw)
            and _is_american_odds(away_raw)
        ):
            continue
        match_date = _parse_kickoff_date(tokens[i + 5], reference)
        if match_date is None:
            continue
        rows.append(
            {
                "match_date": match_date,
                "home_team": home_team,
                "away_team": away_team,
                "home_odds": american_to_decimal(home_raw),
                "draw_odds": american_to_decimal(draw_raw),
                "away_odds": american_to_decimal(away_raw),
                "sportsbook": "DraftKings",
            }
        )

    columns = [
        "match_date",
        "home_team",
        "away_team",
        "home_odds",
        "draw_odds",
        "away_odds",
        "sportsbook",
    ]
    return pd.DataFrame(rows, columns=columns)


def _canonical_match_team(value: str) -> str:
    key = normalize_team_key(_strip_w_suffix(value))
    return DRAFTKINGS_TEAM_ALIASES.get(key, _strip_w_suffix(value))


def _match_team_key(value: str) -> str:
    return normalize_team_key(_canonical_match_team(value))


def build_current_odds_contract(
    parsed_odds: pd.DataFrame,
    upcoming_matches: pd.DataFrame,
    captured_at: datetime | None = None,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match parsed DraftKings odds to ESPN upcoming match IDs."""
    if parsed_odds.empty:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS), parsed_odds.copy()

    timestamp = (captured_at or datetime.now(UTC)).astimezone(UTC).isoformat()
    upcoming = upcoming_matches.copy()
    upcoming["match_date_dt"] = pd.to_datetime(upcoming["match_date"], errors="coerce").dt.date
    upcoming["home_key"] = upcoming["home_team"].map(_match_team_key)
    upcoming["away_key"] = upcoming["away_team"].map(_match_team_key)

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []

    for row in parsed_odds.itertuples(index=False):
        odds_date = pd.to_datetime(row.match_date, errors="coerce").date()
        home_key = _match_team_key(row.home_team)
        away_key = _match_team_key(row.away_team)
        candidates = upcoming[
            (upcoming["home_key"] == home_key) & (upcoming["away_key"] == away_key)
        ].copy()

        if not candidates.empty:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda match_date: (
                    abs((match_date - odds_date).days) if pd.notna(match_date) else 999
                )
            )
            candidates = candidates[
                candidates["date_delta_days"] <= max_date_delta_days
            ].sort_values(["date_delta_days", "match_date_dt", "match_id"])

        if candidates.empty:
            unmatched = row._asdict()
            unmatched["reason"] = "no_upcoming_match_within_date_tolerance"
            unmatched_rows.append(unmatched)
            continue

        match = candidates.iloc[0]
        contract_rows.append(
            {
                "match_id": str(match["match_id"]),
                "timestamp": timestamp,
                "sportsbook": row.sportsbook,
                "market_type": "1x2",
                "line": np.nan,
                "home_odds": float(row.home_odds),
                "draw_odds": float(row.draw_odds),
                "away_odds": float(row.away_odds),
                "over_odds": np.nan,
                "under_odds": np.nan,
                "source_type": "current",
            }
        )

    contract = pd.DataFrame(contract_rows, columns=ODDS_CONTRACT_COLUMNS)
    unmatched = pd.DataFrame(unmatched_rows)
    return contract, unmatched


def build_draftkings_api_contract(
    parsed_odds: pd.DataFrame,
    upcoming_matches: pd.DataFrame,
    *,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match structured DraftKings market rows to ESPN upcoming match IDs."""
    if parsed_odds.empty:
        return (
            pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS),
            pd.DataFrame(columns=[*DRAFTKINGS_API_PARSED_COLUMNS, "reason"]),
        )

    required = {"match_id", "match_date", "home_team", "away_team"}
    missing = required.difference(upcoming_matches.columns)
    if missing:
        raise ValueError("Upcoming match data is missing: " + ", ".join(sorted(missing)))

    upcoming = upcoming_matches.copy()
    upcoming["match_id"] = upcoming["match_id"].astype(str)
    upcoming["match_date_dt"] = pd.to_datetime(
        upcoming["match_date"],
        errors="coerce",
    ).dt.date
    upcoming["home_key"] = upcoming["home_team"].map(_match_team_key)
    upcoming["away_key"] = upcoming["away_team"].map(_match_team_key)

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    for row in parsed_odds.itertuples(index=False):
        odds_date_value = pd.to_datetime(row.match_date, errors="coerce")
        odds_date = odds_date_value.date() if not pd.isna(odds_date_value) else None
        candidates = upcoming[
            upcoming["home_key"].eq(_match_team_key(row.home_team))
            & upcoming["away_key"].eq(_match_team_key(row.away_team))
        ].copy()
        if not candidates.empty and odds_date is not None:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda value: abs((value - odds_date).days) if pd.notna(value) else 999
            )
            candidates = candidates[
                candidates["date_delta_days"] <= int(max_date_delta_days)
            ].sort_values(["date_delta_days", "match_date_dt", "match_id"])
        if candidates.empty:
            unmatched = row._asdict()
            unmatched["reason"] = "no_upcoming_match_within_date_tolerance"
            unmatched_rows.append(unmatched)
            continue

        contract_rows.append(
            {
                "match_id": str(candidates.iloc[0]["match_id"]),
                "timestamp": str(row.timestamp),
                "sportsbook": "DraftKings",
                "market_type": str(row.market_type),
                "line": row.line,
                "home_odds": row.home_odds,
                "draw_odds": row.draw_odds,
                "away_odds": row.away_odds,
                "over_odds": row.over_odds,
                "under_odds": row.under_odds,
                "source_type": str(row.source_type),
            }
        )

    contract = pd.DataFrame(
        contract_rows,
        columns=ODDS_CONTRACT_COLUMNS,
    )
    if not contract.empty:
        contract = (
            contract.drop_duplicates()
            .sort_values(["match_id", "market_type", "line"])
            .reset_index(drop=True)
        )
    return contract, pd.DataFrame(unmatched_rows)


def merge_current_odds_contract(
    existing_odds: pd.DataFrame | None,
    current_contract: pd.DataFrame,
    *,
    sportsbook: str = "DraftKings",
    replace_source_types: Collection[str] = ("current",),
    replace_when_empty: bool = False,
) -> pd.DataFrame:
    """Replace one sportsbook's current odds while preserving historical closes."""
    if existing_odds is None or existing_odds.empty:
        return current_contract.copy()

    existing = existing_odds.copy()
    current = current_contract.copy()
    if current_contract.empty and not replace_when_empty:
        return existing

    for column in ODDS_CONTRACT_COLUMNS:
        if column not in existing.columns:
            existing[column] = np.nan
        if column not in current.columns:
            current[column] = np.nan

    source_type = (
        existing.get("source_type", pd.Series("", index=existing.index)).astype(str).str.lower()
    )
    replace_types = {str(value).lower() for value in replace_source_types}
    books = (
        existing.get("sportsbook", pd.Series("", index=existing.index)).astype(str).str.casefold()
    )
    replace_mask = source_type.isin(replace_types) & books.eq(str(sportsbook).casefold())
    preserved = existing.loc[~replace_mask, ODDS_CONTRACT_COLUMNS].copy()
    if current.empty:
        return preserved.drop_duplicates().reset_index(drop=True)
    merged = pd.concat(
        [preserved, current[ODDS_CONTRACT_COLUMNS].copy()],
        ignore_index=True,
    )
    return merged.drop_duplicates().reset_index(drop=True)


def extract_text_from_apify_items(items: list[dict[str, Any]]) -> str:
    """Return the first useful text payload from Apify Web Scraper results."""
    best = ""
    for item in items:
        text = str(item.get("text") or item.get("markdown") or "")
        if " VS " in f" {text} " or "\nVS\n" in text or "More Bets" in text:
            return text
        if len(text) > len(best):
            best = text
    return best


def build_web_scraper_input(url: str = DRAFTKINGS_NWSL_MONEYLINE_URL) -> dict[str, Any]:
    """Build the Apify Web Scraper input for the DraftKings NWSL moneyline page."""
    page_function = """
async function pageFunction(context) {
  await context.waitFor(8000);
  await context.skipLinks();
  const text = document.body ? document.body.innerText : '';
  return { url: context.request.url, title: document.title, text };
}
"""
    return {
        "startUrls": [{"url": url}],
        "linkSelector": "",
        "pageFunction": page_function,
        "proxyConfiguration": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"],
            "apifyProxyCountry": "US",
        },
        "maxRequestsPerCrawl": 1,
        "maxRequestRetries": 3,
        "pageLoadTimeoutSecs": 90,
        "runMode": "PRODUCTION",
    }


def run_apify_web_scraper(
    token: str, run_input: dict[str, Any], timeout_seconds: int = 300
) -> list[dict[str, Any]]:
    """Run Apify Web Scraper synchronously and return dataset items."""
    if not token:
        raise RuntimeError("APIFY_TOKEN is not configured.")
    url = (
        f"https://api.apify.com/v2/acts/{APIFY_WEB_SCRAPER_ACTOR}/"
        f"run-sync-get-dataset-items?token={quote(token)}&timeout={timeout_seconds}&memory=4096"
    )
    request = Request(
        url,
        data=json.dumps(run_input).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout_seconds + 60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("Apify Web Scraper returned a non-list payload.")
    return payload


def load_env_token(env_key: str = "APIFY_TOKEN", env_files: list[Path] | None = None) -> str:
    """Load an Apify token from the environment or local ignored env files."""
    if os.environ.get(env_key):
        return str(os.environ[env_key])

    for path in env_files or []:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            if key == env_key:
                return value.strip().strip('"').strip("'")
    return ""
