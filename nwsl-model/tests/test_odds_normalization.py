from __future__ import annotations

import pandas as pd

from src.odds.normalization import NORMALIZED_ODDS_COLUMNS, normalize_odds_frame


def test_normalize_odds_frame_emits_one_row_per_selection() -> None:
    odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-05-26T20:00:00Z",
                "sportsbook": "DraftKings",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.10,
                "draw_odds": 3.25,
                "away_odds": 3.60,
                "source_type": "current",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-05-26T20:00:00Z",
                "sportsbook": "DraftKings",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.91,
                "under_odds": 1.91,
                "source_type": "current",
            },
        ]
    )

    normalized = normalize_odds_frame(odds)

    assert normalized.columns.tolist() == NORMALIZED_ODDS_COLUMNS
    assert normalized["selection"].tolist() == ["home", "draw", "away", "over", "under"]
    assert normalized["quality_status"].unique().tolist() == ["valid"]
    assert normalized.loc[0, "american_odds"] == 110
    assert normalized.loc[3, "line"] == 2.5


def test_normalize_odds_frame_can_include_rejected_prices() -> None:
    odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-05-26T20:00:00Z",
                "sportsbook": "DraftKings",
                "market_type": "total",
                "line": None,
                "over_odds": 0.0,
                "under_odds": 1.91,
                "source_type": "current",
            }
        ]
    )

    valid_only = normalize_odds_frame(odds)
    with_rejected = normalize_odds_frame(odds, include_rejected=True)

    assert valid_only.empty
    assert with_rejected["quality_status"].tolist() == [
        "rejected_invalid_price",
        "rejected_missing_line",
    ]
