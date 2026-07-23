from __future__ import annotations

import pandas as pd

from src.odds.quality import build_odds_quality_report


def test_odds_quality_excludes_backtest_matches_by_1x2_coverage() -> None:
    matches = pd.DataFrame(
        [
            {"match_id": "m1", "season": 2026},
            {"match_id": "m2", "season": 2026},
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "source_type": "close",
                "home_odds": 2.0,
                "draw_odds": 3.0,
                "away_odds": 4.0,
            }
        ]
    )

    report = build_odds_quality_report(matches, odds)

    assert report["close_coverage_pct"]["1x2"] == 50.0
    assert report["close_coverage_pct"]["total"] == 0.0
    assert report["excluded_backtest_matches"] == {
        "count": 1,
        "sample_match_ids": ["m2"],
        "market": "1x2",
    }
    assert report["excluded_backtest_matches_by_market"]["total"]["count"] == 2
