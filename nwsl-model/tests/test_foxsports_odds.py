from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd

from src.odds.foxsports import (
    american_to_decimal,
    build_current_total_contract,
    discover_event_urls,
    event_from_url,
    fetch_current_total_rows,
    parse_event_total_odds,
)


def test_event_from_url_parses_match_identity() -> None:
    event = event_from_url(
        "https://www.foxsports.com/soccer/"
        "nwsl-kansas-city-current-vs-boston-legacy-fc-may-30-2026-game-boxscore-651657"
    )

    assert event is not None
    assert event.event_id == "651657"
    assert event.match_date == "2026-05-30"
    assert event.home_team == "Kansas City Current"
    assert event.away_team == "Boston Legacy FC"


def test_parse_event_total_odds_extracts_line_and_decimal_prices() -> None:
    html = """
    <h3>OVER/UNDER 2.5 GOALS</h3>
    <p>The combined final score of both teams is set at 2.5</p>
    <div>-122</div><div>OVER 2.5</div>
    <div>-112</div><div>UNDER 2.5</div>
    """

    line, over_odds, under_odds = parse_event_total_odds(html)

    assert line == 2.5
    assert round(over_odds, 4) == 1.8197
    assert round(under_odds, 4) == 1.8929


def test_american_to_decimal_handles_positive_and_negative_prices() -> None:
    assert american_to_decimal("+125") == 2.25
    assert round(american_to_decimal("-160"), 4) == 1.625


def test_discover_event_urls_reads_date_scoped_score_pages() -> None:
    pages = {
        "https://www.foxsports.com/soccer/nwsl/scores?date=2026-05-29": """
        <a href="/soccer/nwsl-orlando-pride-vs-bay-fc-may-29-2026-game-boxscore-651655">game</a>
        """,
        "https://www.foxsports.com/soccer/nwsl/scores?date=2026-05-30": """
        <a href="/soccer/nwsl-kansas-city-current-vs-boston-legacy-fc-may-30-2026-game-boxscore-651657">game</a>
        """,
    }

    urls = discover_event_urls(
        start_date=date(2026, 5, 29),
        days=2,
        fetcher=lambda url: pages[url],
    )

    assert urls == [
        "https://www.foxsports.com/soccer/nwsl-kansas-city-current-vs-boston-legacy-fc-may-30-2026-game-boxscore-651657",
        "https://www.foxsports.com/soccer/nwsl-orlando-pride-vs-bay-fc-may-29-2026-game-boxscore-651655",
    ]


def test_fetch_current_total_rows_and_contract_match_upcoming() -> None:
    url = (
        "https://www.foxsports.com/soccer/"
        "nwsl-orlando-pride-vs-bay-fc-may-29-2026-game-boxscore-651655"
    )
    parsed, unmatched = fetch_current_total_rows(
        [url],
        captured_at=datetime(2026, 5, 26, 20, 0, tzinfo=timezone.utc),
        fetcher=lambda _: "OVER/UNDER 2.5 GOALS -122 OVER 2.5 -112 UNDER 2.5",
    )
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "match_date": "2026-05-29",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
            }
        ]
    )

    contract, match_unmatched = build_current_total_contract(parsed, upcoming)

    assert unmatched.empty
    assert match_unmatched.empty
    assert contract.loc[0, "match_id"] == "401853922"
    assert contract.loc[0, "sportsbook"] == "FoxSports"
    assert contract.loc[0, "market_type"] == "total"
    assert contract.loc[0, "line"] == 2.5
    assert round(contract.loc[0, "over_odds"], 4) == 1.8197
    assert round(contract.loc[0, "under_odds"], 4) == 1.8929


def test_current_total_contract_allows_one_day_timezone_boundary() -> None:
    parsed = pd.DataFrame(
        [
            {
                "foxsports_event_id": "651656",
                "source_url": "https://www.foxsports.com/soccer/nwsl-racing-louisville-fc-vs-denver-summit-fc-may-29-2026-game-boxscore-651656",
                "match_date": "2026-05-29",
                "home_team": "Racing Louisville FC",
                "away_team": "Denver Summit FC",
                "timestamp": "2026-05-26T20:00:00+00:00",
                "sportsbook": "FoxSports",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.82,
                "under_odds": 1.86,
                "source_type": "current",
            }
        ]
    )
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "401854059",
                "match_date": "2026-05-30",
                "home_team": "Racing Louisville FC",
                "away_team": "Denver Summit FC",
            }
        ]
    )

    contract, unmatched = build_current_total_contract(parsed, upcoming)

    assert unmatched.empty
    assert contract.loc[0, "match_id"] == "401854059"
