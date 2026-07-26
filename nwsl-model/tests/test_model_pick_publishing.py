from __future__ import annotations

import json

import pandas as pd
import pytest

from src.publishing.model_picks import build_publish_payload


def _summary(actionable: int = 0) -> dict:
    return {
        "policy_id": "nwsl-totals-open-over-v1",
        "policy_status": "ready_for_capped_forward_use",
        "model_family": "team_ratings_poisson",
        "artifact_version": "test-artifact",
        "generated_at": "2026-07-26T20:00:00+00:00",
        "window": {
            "start_date": "2026-07-26",
            "end_date": "2026-08-09",
        },
        "matches_in_window": 1,
        "matches_with_current_total_price": 1,
        "actionable_picks": actionable,
        "stake_cap_bankroll_pct": 0.25,
    }


def _row(*, actionable: bool = False) -> dict:
    return {
        "policy_id": "nwsl-totals-open-over-v1",
        "match_id": "match-1",
        "match_date": "2026-07-27",
        "home_team": "Home FC",
        "away_team": "Away FC",
        "market": "total_over",
        "side": "over",
        "sportsbook": "ExampleBook",
        "quote_timestamp": "2026-07-26T19:59:00+00:00",
        "first_seen_timestamp": "2026-07-26T19:00:00+00:00",
        "line": 2.5,
        "over_odds": 2.0,
        "under_odds": 1.9,
        "model_probability": 0.55,
        "market_no_vig_probability": 0.487,
        "probability_edge": 0.063,
        "edge": 0.1,
        "confidence": 0.05,
        "quote_age_minutes": 1.0,
        "quote_is_fresh": True,
        "first_seen_contract_ok": True,
        "pick_tier": "validated_policy_pick" if actionable else "no_bet",
        "actionable": actionable,
        "reason": "accepted" if actionable else "edge_below_threshold",
        "stake_pct": 0.0025 if actionable else 0.0,
        "settlement_status": "pending" if actionable else "",
        "result": "",
        "pnl_units": float("nan"),
        "home_goals_90": float("nan"),
        "away_goals_90": float("nan"),
        "settled_at": "",
        "generated_at": "2026-07-26T20:00:00+00:00",
    }


def _evidence() -> dict:
    return {
        "test": {
            "n_bets": 30,
            "hit_rate": 22 / 30,
            "pnl_units": 10.685,
            "roi_units": 0.3561666667,
            "mean_clv": 0.0461,
            "positive_clv_rate": 0.7,
            "first_match_date": "2026-03-14",
            "last_match_date": "2026-07-18",
        }
    }


def test_build_publish_payload_records_successful_no_bet_run() -> None:
    payload = build_publish_payload(
        summary=_summary(),
        slate=pd.DataFrame([_row()]),
        decisions=pd.DataFrame([_row()]),
        forward_results={"settled": 0, "pending": 0},
        evidence=_evidence(),
        source_health={"authoritative": {"status": "healthy"}},
    )

    assert payload["run"]["status"] == "no_bet"
    assert payload["run"]["evidenceSummary"]["wins"] == 22
    assert payload["run"]["evidenceSummary"]["losses"] == 8
    assert payload["picks"] == []
    json.dumps(payload, allow_nan=False)


def test_build_publish_payload_keeps_one_locked_pick_and_nulls_nan() -> None:
    accepted = _row(actionable=True)
    payload = build_publish_payload(
        summary=_summary(actionable=1),
        slate=pd.DataFrame([accepted]),
        decisions=pd.DataFrame([accepted]),
        forward_results={"settled": 0, "pending": 1},
        evidence=_evidence(),
        source_health={},
    )

    assert payload["run"]["status"] == "success"
    assert len(payload["picks"]) == 1
    assert payload["picks"][0]["settlementStatus"] == "pending"
    assert payload["picks"][0]["pnlUnits"] is None
    json.dumps(payload, allow_nan=False)


def test_build_publish_payload_rejects_bad_actionable_quote_contract() -> None:
    accepted = _row(actionable=True)
    accepted["quote_is_fresh"] = False

    with pytest.raises(ValueError, match="violates the frozen quote contract"):
        build_publish_payload(
            summary=_summary(actionable=1),
            slate=pd.DataFrame([accepted]),
            decisions=pd.DataFrame([accepted]),
            forward_results={},
            evidence=_evidence(),
            source_health={},
        )
