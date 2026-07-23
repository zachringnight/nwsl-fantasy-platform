"""FOX Sports current NWSL totals import helpers."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from src.data.team_names import normalize_team_key
from src.odds.apify_footystats import ODDS_CONTRACT_COLUMNS

UTC = timezone.utc

FOXSPORTS_NWSL_SCORES_URL = "https://www.foxsports.com/soccer/nwsl/scores"

FOX_TEAM_ALIASES = {
    "angel city fc": "Angel City FC",
    "bay fc": "Bay FC",
    "boston legacy fc": "Boston Legacy FC",
    "chicago stars fc": "Chicago Stars FC",
    "denver summit fc": "Denver Summit FC",
    "gotham fc": "Gotham FC",
    "houston dash": "Houston Dash",
    "kansas city current": "Kansas City Current",
    "north carolina courage": "North Carolina Courage",
    "orlando pride": "Orlando Pride",
    "portland thorns fc": "Portland Thorns FC",
    "racing louisville fc": "Racing Louisville FC",
    "san diego wave fc": "San Diego Wave FC",
    "seattle reign fc": "Seattle Reign FC",
    "utah royals": "Utah Royals",
    "utah royals fc": "Utah Royals",
    "washington spirit": "Washington Spirit",
}

EVENT_URL_RE = re.compile(r'href="(/soccer/nwsl-[^"]+?-game-boxscore-\d+)"')
EVENT_SLUG_RE = re.compile(
    r"/soccer/nwsl-(?P<home>.+)-vs-(?P<away>.+)-"
    r"(?P<month>[a-z]+)-(?P<day>\d{1,2})-(?P<year>\d{4})-game-boxscore-(?P<event_id>\d+)"
)
TOTAL_RE = re.compile(
    r"OVER/UNDER\s+(?P<line>\d+(?:\.\d+)?)\s+GOALS"
    r".*?(?P<over>[+-]\d+)\s+OVER\s+(?P=line)"
    r".*?(?P<under>[+-]\d+)\s+UNDER\s+(?P=line)",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class FoxSportsEvent:
    url: str
    event_id: str
    match_date: str
    home_team: str
    away_team: str


def _fetch_text(url: str, timeout_seconds: int = 30) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=timeout_seconds) as response:
        return response.read().decode("utf-8", errors="ignore")


def _slug_to_team(value: str) -> str:
    team = value.replace("-", " ").strip()
    return FOX_TEAM_ALIASES.get(normalize_team_key(team), team.title())


def _month_number(value: str) -> int:
    return datetime.strptime(value.title(), "%B").month


def event_from_url(url: str) -> FoxSportsEvent | None:
    """Parse a FOX Sports NWSL event URL into match identity fields."""
    match = EVENT_SLUG_RE.search(url)
    if not match:
        return None
    match_date = date(
        int(match.group("year")),
        _month_number(match.group("month")),
        int(match.group("day")),
    ).isoformat()
    return FoxSportsEvent(
        url=url,
        event_id=match.group("event_id"),
        match_date=match_date,
        home_team=_slug_to_team(match.group("home")),
        away_team=_slug_to_team(match.group("away")),
    )


def scores_url(day: date) -> str:
    return f"{FOXSPORTS_NWSL_SCORES_URL}?date={day.isoformat()}"


def discover_event_urls(
    *,
    start_date: date,
    days: int,
    fetcher: Any = _fetch_text,
) -> list[str]:
    """Discover NWSL event pages from FOX Sports score pages."""
    urls: list[str] = []
    for offset in range(days):
        html_text = fetcher(scores_url(start_date + timedelta(days=offset)))
        for path in EVENT_URL_RE.findall(html_text):
            if path.startswith("http"):
                url = path
            else:
                url = f"https://www.foxsports.com{path}"
            if event_from_url(url) is not None:
                urls.append(url)
    return sorted(dict.fromkeys(urls))


def _plain_text(html_text: str) -> str:
    text = re.sub(r"<script\b.*?</script>", " ", html_text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<style\b.*?</style>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def american_to_decimal(value: str | int | float) -> float:
    price = int(value)
    if price > 0:
        return 1.0 + price / 100.0
    return 1.0 + 100.0 / abs(price)


def parse_event_total_odds(html_text: str) -> tuple[float, float, float] | None:
    """Return (line, over_decimal, under_decimal) from a FOX event page."""
    text = _plain_text(html_text)
    match = TOTAL_RE.search(text)
    if not match:
        return None
    return (
        float(match.group("line")),
        american_to_decimal(match.group("over")),
        american_to_decimal(match.group("under")),
    )


def fetch_current_total_rows(
    event_urls: list[str],
    *,
    captured_at: datetime | None = None,
    fetcher: Any = _fetch_text,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fetch FOX event pages and return parsed total odds plus unmatched pages."""
    timestamp = (captured_at or datetime.now(UTC)).astimezone(UTC).isoformat()
    rows: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []

    for url in event_urls:
        event = event_from_url(url)
        if event is None:
            unmatched.append({"url": url, "reason": "unparseable_event_url"})
            continue
        html_text = fetcher(url)
        total = parse_event_total_odds(html_text)
        if total is None:
            unmatched.append({"url": url, "reason": "missing_total_market"})
            continue
        line, over_odds, under_odds = total
        rows.append(
            {
                "foxsports_event_id": event.event_id,
                "source_url": event.url,
                "match_date": event.match_date,
                "home_team": event.home_team,
                "away_team": event.away_team,
                "timestamp": timestamp,
                "sportsbook": "FoxSports",
                "market_type": "total",
                "line": line,
                "over_odds": over_odds,
                "under_odds": under_odds,
                "source_type": "current",
            }
        )

    return pd.DataFrame(rows), pd.DataFrame(unmatched)


def build_current_total_contract(
    parsed_totals: pd.DataFrame,
    upcoming_matches: pd.DataFrame,
    *,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match parsed FOX totals to ESPN upcoming match IDs."""
    if parsed_totals.empty:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS), parsed_totals.copy()

    upcoming = upcoming_matches.copy()
    upcoming["match_date_dt"] = pd.to_datetime(upcoming["match_date"], errors="coerce").dt.date
    upcoming["home_key"] = upcoming["home_team"].map(normalize_team_key)
    upcoming["away_key"] = upcoming["away_team"].map(normalize_team_key)

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    for row in parsed_totals.itertuples(index=False):
        home_key = normalize_team_key(row.home_team)
        away_key = normalize_team_key(row.away_team)
        odds_date = pd.to_datetime(row.match_date, errors="coerce").date()
        matches = upcoming[
            (upcoming["home_key"] == home_key)
            & (upcoming["away_key"] == away_key)
        ].copy()
        if not matches.empty:
            matches["date_delta_days"] = matches["match_date_dt"].map(
                lambda match_date: abs((match_date - odds_date).days) if pd.notna(match_date) else 999
            )
            matches = matches[matches["date_delta_days"] <= max_date_delta_days].sort_values(
                ["date_delta_days", "match_date_dt", "match_id"]
            )
        if matches.empty:
            payload = row._asdict()
            payload["reason"] = "no_upcoming_match"
            unmatched_rows.append(payload)
            continue
        match_id = str(matches.iloc[0]["match_id"])
        contract_rows.append(
            {
                "match_id": match_id,
                "timestamp": row.timestamp,
                "sportsbook": row.sportsbook,
                "market_type": "total",
                "line": float(row.line),
                "home_odds": np.nan,
                "draw_odds": np.nan,
                "away_odds": np.nan,
                "over_odds": float(row.over_odds),
                "under_odds": float(row.under_odds),
                "source_type": row.source_type,
            }
        )

    contract = pd.DataFrame(contract_rows, columns=ODDS_CONTRACT_COLUMNS)
    unmatched = pd.DataFrame(unmatched_rows)
    return contract, unmatched
