"""Apify-powered FootyStats odds import helpers."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from src.data.team_names import normalize_team_key

UTC = timezone.utc

APIFY_WEB_SCRAPER_ACTOR = "apify~web-scraper"
FOOTYSTATS_NWSL_ODDS_URL = "https://footystats.org/usa/nwsl/odds"

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

FOOTYSTATS_TEAM_ALIASES = {
    "angel city": "Angel City FC",
    "angel city fc": "Angel City FC",
    "bay": "Bay FC",
    "bay fc": "Bay FC",
    "boston legacy": "Boston Legacy FC",
    "boston legacy fc": "Boston Legacy FC",
    "boston legacy w": "Boston Legacy FC",
    "chicago red stars": "Chicago Stars FC",
    "chicago stars": "Chicago Stars FC",
    "chicago stars fc": "Chicago Stars FC",
    "denver summit": "Denver Summit FC",
    "denver summit fc": "Denver Summit FC",
    "denver summit w": "Denver Summit FC",
    "gotham fc": "Gotham FC",
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

HEADER_TOKENS = {"home", "away", "1", "x", "2", "highest odds at"}
DATE_RE = re.compile(r"^[A-Za-z]+ \d{1,2}, \d{4}$")
DECIMAL_RE = re.compile(r"^\d+(?:\.\d+)?$")


def _clean_token(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def _is_decimal_token(value: str) -> bool:
    return bool(DECIMAL_RE.match(_clean_token(value)))


def _parse_date(value: str) -> str:
    return datetime.strptime(value, "%B %d, %Y").date().isoformat()


def _canonical_match_team(value: str) -> str:
    key = normalize_team_key(value)
    return FOOTYSTATS_TEAM_ALIASES.get(key, _clean_token(value))


def _match_team_key(value: str) -> str:
    return normalize_team_key(_canonical_match_team(value))


def parse_footystats_odds_text(text: str) -> pd.DataFrame:
    """Parse the NWSL 1X2 odds table from Apify Web Scraper text output."""
    tokens = [_clean_token(line) for line in text.splitlines()]
    tokens = [token for token in tokens if token]

    try:
        start_idx = tokens.index("Betting Odds For Next Fixtures - NWSL") + 1
    except ValueError:
        start_idx = 0

    rows: list[dict[str, Any]] = []
    current_date: str | None = None
    i = start_idx
    while i < len(tokens):
        token = tokens[i]
        token_key = token.lower()
        if token == "Odds - USA":
            break
        if DATE_RE.match(token):
            current_date = _parse_date(token)
            i += 1
            continue
        if token_key in HEADER_TOKENS or current_date is None:
            i += 1
            continue

        has_fixture_shape = (
            i + 5 < len(tokens)
            and " vs " in f" {tokens[i + 1].lower()} "
            and _is_decimal_token(tokens[i + 3])
            and _is_decimal_token(tokens[i + 4])
            and _is_decimal_token(tokens[i + 5])
        )
        if not has_fixture_shape:
            i += 1
            continue

        rows.append(
            {
                "match_date": current_date,
                "home_team": token,
                "away_team": tokens[i + 2],
                "home_odds": float(tokens[i + 3]),
                "draw_odds": float(tokens[i + 4]),
                "away_odds": float(tokens[i + 5]),
                "sportsbook": "FootyStats",
            }
        )
        i += 7

    columns = ["match_date", "home_team", "away_team", "home_odds", "draw_odds", "away_odds", "sportsbook"]
    return pd.DataFrame(rows, columns=columns)


def build_current_odds_contract(
    parsed_odds: pd.DataFrame,
    upcoming_matches: pd.DataFrame,
    captured_at: datetime | None = None,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match parsed FootyStats odds to ESPN upcoming match IDs."""
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
    sportsbook: str = "FootyStats",
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


def build_odds_manifest_summary(odds: pd.DataFrame) -> dict[str, Any]:
    """Summarize the current odds contract for dataset metadata."""
    if odds.empty:
        return {
            "rows": 0,
            "source_available": False,
            "markets": [],
            "sportsbooks": [],
            "source_types": [],
        }

    summary: dict[str, Any] = {
        "rows": int(len(odds)),
        "source_available": True,
        "markets": sorted(str(value) for value in odds.get("market_type", pd.Series(dtype=str)).dropna().unique()),
        "sportsbooks": sorted(str(value) for value in odds.get("sportsbook", pd.Series(dtype=str)).dropna().unique()),
        "source_types": sorted(str(value) for value in odds.get("source_type", pd.Series(dtype=str)).dropna().unique()),
    }
    if "timestamp" in odds.columns:
        timestamps = odds["timestamp"].dropna().astype(str)
        if not timestamps.empty:
            summary["latest_timestamp"] = str(timestamps.max())
    return summary


def update_dataset_manifest_odds(manifest_path: Path, odds: pd.DataFrame) -> None:
    """Update odds availability metadata while preserving the rest of the manifest."""
    manifest: dict[str, Any] = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    manifest["odds"] = build_odds_manifest_summary(odds)
    matches_payload = manifest.get("matches", {})
    match_rows = int(matches_payload.get("rows", 0) or 0)
    if match_rows > 0 and not odds.empty and "match_id" in odds.columns:
        source_type = odds["source_type"] if "source_type" in odds.columns else pd.Series(["close"] * len(odds), index=odds.index)
        market_type = odds["market_type"] if "market_type" in odds.columns else pd.Series([""] * len(odds), index=odds.index)
        close_1x2 = odds[
            (source_type.astype(str).str.lower() == "close")
            & (market_type.astype(str).str.lower() == "1x2")
        ]
        covered_matches = int(close_1x2["match_id"].astype(str).nunique())
        missing_pct = max(0.0, 100.0 * (1.0 - covered_matches / match_rows))
        missing = dict(manifest.get("missing_feature_coverage", {}))
        missing["odds_missing_pct"] = round(missing_pct, 2)
        manifest["missing_feature_coverage"] = missing
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def extract_text_from_apify_items(items: list[dict[str, Any]]) -> str:
    """Return the first useful text payload from Apify Web Scraper results."""
    for item in items:
        text = str(item.get("text") or item.get("markdown") or "")
        if "Betting Odds For Next Fixtures - NWSL" in text:
            return text
    return ""


def build_web_scraper_input(url: str = FOOTYSTATS_NWSL_ODDS_URL) -> dict[str, Any]:
    """Build the Apify Web Scraper input used for one-page FootyStats extraction."""
    page_function = """
async function pageFunction(context) {
  await context.waitFor(5000);
  await context.skipLinks();
  const text = document.body ? document.body.innerText : '';
  return { url: context.request.url, title: document.title, text };
}
"""
    return {
        "startUrls": [{"url": url}],
        "linkSelector": "",
        "pageFunction": page_function,
        "proxyConfiguration": {"useApifyProxy": True},
        "maxRequestsPerCrawl": 1,
        "maxRequestRetries": 2,
        "pageLoadTimeoutSecs": 60,
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
