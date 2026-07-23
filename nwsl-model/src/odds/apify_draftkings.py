"""Apify-powered DraftKings NWSL moneyline (3-way) odds import helpers.

DraftKings is the real US sportsbook the model bets against, so edge/EV is
computed against prices the user can actually take. The DK NWSL page is
Akamai/geo-blocked, so it is reached via an Apify web-scraper run using a US
residential proxy. The rendered page exposes one block per game:

    <home team> / VS / <away team> / <home odds> / <draw odds> / <away odds>
    / <kickoff datetime> / More Bets

Teams are suffixed " [W]" and American odds use the unicode minus sign
(U+2212) for favorites.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from src.data.team_names import normalize_team_key

UTC = timezone.utc

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
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
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
        if not (_is_american_odds(home_raw) and _is_american_odds(draw_raw) and _is_american_odds(away_raw)):
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

    columns = ["match_date", "home_team", "away_team", "home_odds", "draw_odds", "away_odds", "sportsbook"]
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
        candidates = upcoming[(upcoming["home_key"] == home_key) & (upcoming["away_key"] == away_key)].copy()

        if not candidates.empty:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda match_date: abs((match_date - odds_date).days) if pd.notna(match_date) else 999
            )
            candidates = candidates[candidates["date_delta_days"] <= max_date_delta_days].sort_values(
                ["date_delta_days", "match_date_dt", "match_id"]
            )

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


def merge_current_odds_contract(
    existing_odds: pd.DataFrame | None,
    current_contract: pd.DataFrame,
    *,
    sportsbook: str = "DraftKings",
) -> pd.DataFrame:
    """Replace one sportsbook's current odds while preserving historical closes."""
    if existing_odds is None or existing_odds.empty:
        return current_contract.copy()

    existing = existing_odds.copy()
    current = current_contract.copy()
    if current_contract.empty:
        return existing

    for column in ODDS_CONTRACT_COLUMNS:
        if column not in existing.columns:
            existing[column] = np.nan
        if column not in current.columns:
            current[column] = np.nan

    source_type = existing.get("source_type", pd.Series("", index=existing.index)).astype(str).str.lower()
    books = existing.get("sportsbook", pd.Series("", index=existing.index)).astype(str)
    replace_mask = source_type.eq("current") & books.eq(sportsbook)
    preserved = existing.loc[~replace_mask, ODDS_CONTRACT_COLUMNS].copy()
    merged = pd.concat([preserved, current[ODDS_CONTRACT_COLUMNS].copy()], ignore_index=True)
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


def run_apify_web_scraper(token: str, run_input: dict[str, Any], timeout_seconds: int = 300) -> list[dict[str, Any]]:
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
