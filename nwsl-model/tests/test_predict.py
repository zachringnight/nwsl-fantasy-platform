from __future__ import annotations

import pandas as pd

from datetime import datetime, timezone

from scripts.predict import (
    _format_decision,
    _match_odds_rows,
    _merge_prediction_market_odds,
    positive_model_edge_records,
)


class _Decision:
    market = "1x2_home"
    market_price = 2.1
    probability_edge = 0.04
    expected_value = 0.12
    stake = 1.0


class _PositiveEdgeDecision:
    market = "total_under_3.5"
    market_price = 2.2
    probability_edge = 0.06
    expected_value = 0.12
    model_probability = 0.51
    model_price = 1.96
    market_no_vig_probability = 0.45
    confidence = 0.01
    confidence_band = "low"
    side = "under"
    line = 3.5
    sportsbook = "DraftKings"
    source_type = "current"
    timestamp = "2026-07-30T15:52:04+00:00"
    model_version = "v1"
    model_family = "spi_lite_baseline"
    gating_status = "current"
    reason = "side_not_allowed"
    pick_tier = "no_bet"
    accepted = False
    actionable = False
    stake_pct = 0.0


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


def test_match_odds_rows_never_falls_back_to_historical_close() -> None:
    odds = pd.DataFrame(
        [
            {"match_id": "m1", "source_type": "close", "home_odds": 2.1},
            {"match_id": "m2", "source_type": "current", "home_odds": 2.2},
        ]
    )

    rows = _match_odds_rows(odds, "m1")

    assert rows.empty


def test_positive_model_edges_include_rejected_sides_as_research() -> None:
    fixture = pd.Series(
        {
            "match_id": "m1",
            "match_date": "2026-08-01",
            "home_team": "Home",
            "away_team": "Away",
        }
    )

    rows = positive_model_edge_records(
        [_PositiveEdgeDecision()],
        fixture=fixture,
        model="spi_lite_baseline",
        generated_at=datetime(2026, 7, 30, 16, 0, tzinfo=timezone.utc),
    )

    assert len(rows) == 1
    assert rows[0]["market"] == "total_under_3.5"
    assert rows[0]["sportsbook"] == "DraftKings"
    assert rows[0]["selection_reason"] == "side_not_allowed"
    assert rows[0]["research_only"] is True


def test_positive_model_edges_require_a_current_nonfuture_quote() -> None:
    fixture = pd.Series(
        {
            "match_id": "m1",
            "match_date": "2026-08-01",
            "home_team": "Home",
            "away_team": "Away",
        }
    )
    close = _PositiveEdgeDecision()
    close.source_type = "close"
    missing_timestamp = _PositiveEdgeDecision()
    missing_timestamp.timestamp = None
    future = _PositiveEdgeDecision()
    future.timestamp = "2026-07-30T16:01:00+00:00"

    rows = positive_model_edge_records(
        [close, missing_timestamp, future],
        fixture=fixture,
        model="spi_lite_baseline",
        generated_at=datetime(2026, 7, 30, 16, 0, tzinfo=timezone.utc),
    )

    assert rows == []
