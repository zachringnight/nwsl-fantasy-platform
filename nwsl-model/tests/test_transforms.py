from __future__ import annotations

import pandas as pd

from src.data.transforms import merge_odds_to_matches


def test_merge_odds_to_matches_normalizes_match_id_types() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": 401853922,
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "source_type": "current",
                "home_odds": 1.9,
                "draw_odds": 3.4,
                "away_odds": 3.74,
            }
        ]
    )

    merged = merge_odds_to_matches(matches, odds, source_type="current")

    assert merged.loc[0, "home_odds"] == 1.9
    assert merged.loc[0, "draw_odds"] == 3.4
    assert merged.loc[0, "away_odds"] == 3.74


def test_merge_odds_to_matches_keeps_totals_separate_from_1x2() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
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
                "market_type": "1x2",
                "source_type": "close",
                "home_odds": 1.9,
                "draw_odds": 3.4,
                "away_odds": 3.74,
                "line": None,
                "over_odds": None,
                "under_odds": None,
            },
            {
                "match_id": "m1",
                "sportsbook": "DraftKings",
                "market_type": "total",
                "source_type": "close",
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "line": 2.5,
                "over_odds": 1.85,
                "under_odds": 1.95,
            },
        ]
    )

    merged = merge_odds_to_matches(matches, odds)
    merged = merge_odds_to_matches(merged, odds, market_type="total")

    assert merged.loc[0, "home_odds"] == 1.9
    assert merged.loc[0, "draw_odds"] == 3.4
    assert merged.loc[0, "away_odds"] == 3.74
    assert merged.loc[0, "total_line"] == 2.5
    assert merged.loc[0, "over_odds"] == 1.85
    assert merged.loc[0, "under_odds"] == 1.95
