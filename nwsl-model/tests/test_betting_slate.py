from __future__ import annotations

import pandas as pd

from scripts.generate_betting_slate import filter_near_term_slate


def test_filter_near_term_slate_limits_to_window_and_current_odds() -> None:
    predictions = pd.DataFrame(
        [
            {"match_id": "1", "match_date": "2026-05-29", "has_market_odds": True},
            {"match_id": "2", "match_date": "2026-06-20", "has_market_odds": True},
            {"match_id": "3", "match_date": "2026-05-30", "has_market_odds": False},
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert slate["match_id"].tolist() == ["1"]


def test_filter_near_term_slate_forces_gating_rejection_reason() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "gating_status": "research_only",
                "accepted_bet_count": 1,
                "recommended_bets": "home",
                "mkt_home_odds": 2.2,
            }
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert not bool(slate.loc[0, "accepted_bet"])
    assert slate.loc[0, "bet_reason"] == "model_gating_not_passed"


def test_filter_near_term_slate_can_include_missing_market_diagnostics() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "rejected_bet_reasons": "confidence_below_threshold",
            }
        ]
    )

    slate = filter_near_term_slate(
        predictions,
        as_of="2026-05-26",
        days=14,
        require_current_odds=False,
    )

    assert not bool(slate.loc[0, "has_market_odds"])
    assert not bool(slate.loc[0, "accepted_bet"])
    assert slate.loc[0, "bet_reason"] == "missing_market_price"


def test_filter_near_term_slate_parses_string_market_flag() -> None:
    predictions = pd.DataFrame(
        [
            {"match_id": "1", "match_date": "2026-05-29", "has_market_odds": "False"},
            {"match_id": "2", "match_date": "2026-05-29", "has_market_odds": "True"},
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert slate["match_id"].tolist() == ["2"]


def test_filter_near_term_slate_requires_complete_derived_market_odds() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": None,
                "mkt_away_odds": 3.2,
            },
            {
                "match_id": "2",
                "match_date": "2026-05-29",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            },
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert slate["match_id"].tolist() == ["2"]
