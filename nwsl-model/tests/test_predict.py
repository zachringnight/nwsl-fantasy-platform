from __future__ import annotations

import pandas as pd

from scripts.predict import _format_decision, _merge_prediction_market_odds


class _Decision:
    market = "1x2_home"
    market_price = 2.1
    probability_edge = 0.04
    expected_value = 0.12
    stake = 1.0


def test_format_decision_labels_probability_edge_and_ev_separately() -> None:
    assert _format_decision(_Decision()) == "1x2_home@2.10(prob_edge=0.040,ev=0.120,stake=1.0)"


def test_prediction_market_merge_carries_moneyline_and_totals() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-05-29",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "sportsbook": "DraftKings",
                "timestamp": "2026-05-26T17:00:00Z",
                "source_type": "current",
                "market_type": "1x2",
                "home_odds": 2.10,
                "draw_odds": 3.20,
                "away_odds": 3.40,
            },
            {
                "match_id": "m1",
                "sportsbook": "DraftKings",
                "timestamp": "2026-05-26T17:00:00Z",
                "source_type": "current",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.95,
                "under_odds": 1.85,
            },
        ]
    )

    merged = _merge_prediction_market_odds(matches, odds, source_type="current")

    assert merged.loc[0, "home_odds"] == 2.10
    assert merged.loc[0, "draw_odds"] == 3.20
    assert merged.loc[0, "away_odds"] == 3.40
    assert merged.loc[0, "total_line"] == 2.5
    assert merged.loc[0, "over_odds"] == 1.95
    assert merged.loc[0, "under_odds"] == 1.85
