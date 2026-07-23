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
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            }
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert not bool(slate.loc[0, "accepted_bet"])
    assert slate.loc[0, "bet_reason"] == "model_gating_not_passed"
    assert slate.loc[0, "pick_tier"] == "no_bet"
    assert not bool(slate.loc[0, "actionable_pick"])


def test_filter_near_term_slate_exposes_leans_as_actionable_nonofficial_picks() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "gating_status": "baseline_fallback",
                "accepted_bet_count": 0,
                "lean_bet_count": 2,
                "recommended_bets": "none",
                "recommended_leans": "1x2_home@2.10(edge=0.040,stake=1.0); total_over_2.5@2.05(edge=0.025,stake=1.0)",
                "rejected_bet_reasons": "lean_model_gating_not_passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
                "main_total_line": 2.5,
                "mkt_over_odds": 2.05,
                "mkt_under_odds": 1.78,
            }
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert not bool(slate.loc[0, "accepted_bet"])
    assert bool(slate.loc[0, "actionable_pick"])
    assert slate.loc[0, "pick_tier"] == "lean"
    assert slate.loc[0, "bet_reason"] == "lean_model_gating_not_passed"
    assert slate.loc[0, "lean_bet_count"] == 2


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


def test_filter_near_term_slate_accepts_total_market_odds_without_moneyline() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "main_total_line": 2.5,
                "mkt_over_odds": 1.95,
                "mkt_under_odds": 1.85,
            }
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert slate["match_id"].tolist() == ["1"]
    assert bool(slate.loc[0, "has_market_odds"])
    assert slate.loc[0, "main_total_line"] == 2.5
    assert slate.loc[0, "mkt_over_odds"] == 1.95


def test_filter_near_term_slate_rejects_partial_market_columns() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "has_market_odds": True,
                "mkt_home_odds": 2.1,
            }
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert slate.empty


def test_filter_near_term_slate_does_not_accept_nan_bet_flag() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "accepted_bet": float("nan"),
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            }
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert not bool(slate.loc[0, "accepted_bet"])
    assert slate.loc[0, "bet_reason"] == "no_bet"


def test_filter_near_term_slate_requires_fresh_market_metadata() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            },
            {
                "match_id": "2",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            },
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-26T03:00:00Z",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "home_odds": 2.1,
                "draw_odds": 3.0,
                "away_odds": 3.2,
                "source_type": "current",
            },
            {
                "match_id": "2",
                "timestamp": "2026-05-26T00:00:00Z",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "home_odds": 2.1,
                "draw_odds": 3.0,
                "away_odds": 3.2,
                "source_type": "current",
            },
        ]
    )

    slate = filter_near_term_slate(
        predictions,
        as_of="2026-05-26",
        days=14,
        odds=odds,
        odds_as_of="2026-05-26T04:00:00Z",
        max_odds_age_minutes=180,
    )

    assert slate["match_id"].tolist() == ["1"]
    assert bool(slate.loc[0, "market_is_fresh"])
    assert slate.loc[0, "market_sportsbook"] == "FootyStats"


def test_filter_near_term_slate_parses_mixed_precision_market_timestamps() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            },
            {
                "match_id": "2",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            },
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-27T18:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "home_odds": 2.1,
                "draw_odds": 3.0,
                "away_odds": 3.2,
                "source_type": "current",
            },
            {
                "match_id": "2",
                "timestamp": "2026-05-27T18:58:26.088562+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "home_odds": 2.1,
                "draw_odds": 3.0,
                "away_odds": 3.2,
                "source_type": "current",
            },
        ]
    )

    slate = filter_near_term_slate(
        predictions,
        as_of="2026-05-27",
        days=14,
        odds=odds,
        odds_as_of="2026-05-27T19:00:00Z",
        max_odds_age_minutes=180,
    )

    assert slate["match_id"].tolist() == ["1", "2"]
    assert slate.loc[0, "market_type"] == "1x2"
    assert slate.loc[0, "market_age_minutes"] == 60.0


def test_filter_near_term_slate_requires_fresh_total_market_metadata() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "main_total_line": 2.5,
                "mkt_over_odds": 1.95,
                "mkt_under_odds": 1.85,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-26T03:00:00Z",
                "sportsbook": "DraftKings",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.95,
                "under_odds": 1.85,
                "source_type": "current",
            }
        ]
    )

    slate = filter_near_term_slate(
        predictions,
        as_of="2026-05-26",
        days=14,
        odds=odds,
        odds_as_of="2026-05-26T04:00:00Z",
        max_odds_age_minutes=180,
    )

    assert slate["match_id"].tolist() == ["1"]
    assert bool(slate.loc[0, "market_is_fresh"])
    assert slate.loc[0, "market_type"] == "total"
    assert slate.loc[0, "market_sportsbook"] == "DraftKings"


def test_filter_near_term_slate_reports_all_fresh_market_types() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
                "main_total_line": 2.5,
                "mkt_over_odds": 1.95,
                "mkt_under_odds": 1.85,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-26T03:00:00Z",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "home_odds": 2.1,
                "draw_odds": 3.0,
                "away_odds": 3.2,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-05-26T03:05:00Z",
                "sportsbook": "FoxSports",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.95,
                "under_odds": 1.85,
                "source_type": "current",
            },
        ]
    )

    slate = filter_near_term_slate(
        predictions,
        as_of="2026-05-26",
        days=14,
        odds=odds,
        odds_as_of="2026-05-26T04:00:00Z",
        max_odds_age_minutes=180,
    )

    assert slate.loc[0, "market_type"] == "total"
    assert slate.loc[0, "market_types"] == "1x2,total"


def test_filter_near_term_slate_reports_stale_market_in_diagnostics() -> None:
    predictions = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-29",
                "gating_status": "passed",
                "mkt_home_odds": 2.1,
                "mkt_draw_odds": 3.0,
                "mkt_away_odds": 3.2,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-26T00:00:00Z",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "home_odds": 2.1,
                "draw_odds": 3.0,
                "away_odds": 3.2,
                "source_type": "current",
            }
        ]
    )

    slate = filter_near_term_slate(
        predictions,
        as_of="2026-05-26",
        days=14,
        odds=odds,
        odds_as_of="2026-05-26T04:00:00Z",
        max_odds_age_minutes=180,
        require_current_odds=False,
    )

    assert not bool(slate.loc[0, "has_market_odds"])
    assert not bool(slate.loc[0, "market_is_fresh"])
    assert slate.loc[0, "bet_reason"] == "stale_market_price"
