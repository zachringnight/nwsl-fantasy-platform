from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pandas as pd

from src.odds.quality import build_odds_quality_report


def test_build_odds_quality_report_tracks_coverage_and_staleness() -> None:
    matches = pd.DataFrame(
        [
            {"match_id": "m1", "season": 2024},
            {"match_id": "m2", "season": 2025},
            {"match_id": "m3", "season": 2026},
        ]
    )
    odds = pd.DataFrame(
        [
            {"match_id": "m1", "timestamp": "2026-04-07T18:30:00Z", "sportsbook": "Book A", "market_type": "1x2", "home_odds": 2.0, "draw_odds": 3.3, "away_odds": 3.8, "source_type": "close"},
            {"match_id": "m2", "timestamp": "2026-04-07T18:30:00Z", "sportsbook": "Book A", "market_type": "1x2", "home_odds": 2.0, "draw_odds": 3.3, "away_odds": 3.8, "source_type": "close"},
            {"match_id": "m3", "timestamp": "2026-04-07T18:30:00Z", "sportsbook": "Book A", "market_type": "1x2", "home_odds": 2.0, "draw_odds": 3.3, "away_odds": 3.8, "source_type": "close"},
            {"match_id": "m1", "timestamp": "2026-04-07T18:30:00Z", "sportsbook": "Book A", "market_type": "total", "line": 2.5, "over_odds": 1.95, "under_odds": 1.87, "source_type": "close"},
            {"match_id": "m2", "timestamp": "2026-04-07T18:30:00Z", "sportsbook": "Book A", "market_type": "total", "line": 2.5, "over_odds": 1.95, "under_odds": 1.87, "source_type": "close"},
            {"match_id": "m1", "timestamp": "2026-04-07T19:30:00Z", "sportsbook": "Book A", "market_type": "1x2", "home_odds": 1.95, "draw_odds": 3.4, "away_odds": 3.9, "source_type": "current"},
            {"match_id": "m2", "timestamp": "2026-04-07T16:00:00Z", "sportsbook": "Book A", "market_type": "total", "line": 2.5, "over_odds": 2.0, "under_odds": 1.8, "source_type": "current"},
        ]
    )

    report = build_odds_quality_report(
        matches=matches,
        odds=odds,
        stale_line_minutes=60,
        now=datetime(2026, 4, 7, 20, 0, tzinfo=UTC),
    )

    assert report["source_available"] is True
    assert report["close_coverage_pct"]["1x2"] == pytest.approx(100.0)
    assert report["close_coverage_pct"]["total"] == pytest.approx(66.67)
    assert report["current_price_health"]["rows"] == 2
    assert report["current_price_health"]["fresh_rows"] == 1
    assert report["current_price_health"]["stale_rows"] == 1
    assert report["excluded_backtest_matches"]["count"] == 1
    assert report["coverage_by_season"]["2026"]["close_total_matches"] == 0
