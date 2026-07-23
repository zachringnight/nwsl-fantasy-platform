from __future__ import annotations

import pandas as pd

from scripts.analyze_betting_thresholds import analyze_thresholds


def test_analyze_thresholds_scores_moneyline_and_totals_candidates() -> None:
    decisions = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "market": "1x2_home",
                "side": "home",
                "line": None,
                "market_price": 2.2,
                "edge": 0.10,
                "confidence": 0.09,
            },
            {
                "match_id": "m2",
                "market": "total_under_2.5",
                "side": "under",
                "line": 2.5,
                "market_price": 1.9,
                "edge": 0.06,
                "confidence": 0.07,
            },
        ]
    )
    predictions = pd.DataFrame(
        [
            {"match_id": "m1", "home_goals_90": 1, "away_goals_90": 0},
            {"match_id": "m2", "home_goals_90": 1, "away_goals_90": 1},
        ]
    )

    summary = analyze_thresholds(
        decisions,
        predictions,
        edge_thresholds=[0.05],
        confidence_thresholds=[0.05],
    )

    rows = summary.set_index("market_group")
    assert rows.loc["moneyline", "n_bets"] == 1
    assert rows.loc["moneyline", "pnl_units"] == 1.2
    assert rows.loc["totals", "n_bets"] == 1
    assert rows.loc["totals", "pnl_units"] == 0.9
