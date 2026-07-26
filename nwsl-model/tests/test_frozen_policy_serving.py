from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from src.betting.frozen_policy_serving import (
    append_forward_decisions,
    annotate_first_seen_quotes,
    build_frozen_policy_slate,
    settle_forward_decisions,
    validate_policy_evidence,
)
from src.models.base import PredictionResult
from src.utils.io import load_json


class _FixedModel:
    def predict_score_matrix(self, home_team: str, away_team: str) -> PredictionResult:
        matrix = np.zeros((4, 4), dtype=float)
        matrix[2, 1] = 0.70
        matrix[1, 1] = 0.30
        return PredictionResult(
            match_id="",
            home_team=home_team,
            away_team=away_team,
            lambda_home=1.8,
            lambda_away=1.1,
            score_matrix=matrix,
            home_win_prob=0.70,
            draw_prob=0.30,
            away_win_prob=0.0,
        )


def _evidence() -> dict:
    return {
        "policy_id": "nwsl-totals-open-over-v1",
        "status": "ready_for_capped_forward_use",
        "model_family": "team_ratings_poisson",
        "market_group": "totals",
        "side": "over",
        "odds_source_types": ["open"],
        "thresholds": {"min_edge": 0.02, "min_confidence": 0.03},
        "readiness_checks": {"all": True},
        "operating_contract": {"forward_stake_cap_bankroll_pct": 0.25},
    }


def test_validate_policy_evidence_fails_closed_on_model_mismatch() -> None:
    evidence = _evidence()
    evidence["model_family"] = "dixon_coles"

    try:
        validate_policy_evidence(evidence)
    except ValueError as exc:
        assert "model_family" in str(exc)
    else:
        raise AssertionError("expected model mismatch to fail closed")


def test_tracked_totals_policy_evidence_is_serveable() -> None:
    path = (
        Path(__file__).resolve().parents[1]
        / "configs"
        / "policies"
        / "nwsl_totals_open_over_v1.json"
    )

    policy = validate_policy_evidence(load_json(path))

    assert policy["policy_id"] == "nwsl-totals-open-over-v1"
    assert policy["min_edge"] == 0.02
    assert policy["min_confidence"] == 0.03


def test_annotate_first_seen_rejects_worse_later_price() -> None:
    current = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-07-26T18:00:00Z",
                "sportsbook": "FoxSports",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.80,
                "under_odds": 1.95,
                "source_type": "current",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-07-26T16:00:00Z",
                "sportsbook": "FoxSports",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.90,
                "under_odds": 1.85,
                "source_type": "current",
            }
        ]
    )

    annotated = annotate_first_seen_quotes(current, snapshots)

    assert annotated.loc[0, "first_seen_over_odds"] == 1.90
    assert bool(annotated.loc[0, "first_seen_contract_ok"]) is False


def test_build_frozen_policy_slate_accepts_fresh_first_seen_edge() -> None:
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-07-26",
                "home_team": "Home",
                "away_team": "Away",
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-07-26T18:00:00Z",
                "sportsbook": "FoxSports",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.80,
                "under_odds": 1.95,
                "source_type": "current",
            }
        ]
    )

    slate, summary = build_frozen_policy_slate(
        upcoming=upcoming,
        odds=odds,
        snapshots=odds,
        model=_FixedModel(),
        evidence=_evidence(),
        artifact_version="v1",
        as_of=datetime(2026, 7, 26, 18, 30, tzinfo=timezone.utc),
        days=1,
    )

    assert summary["actionable_picks"] == 1
    assert bool(slate.loc[0, "actionable"]) is True
    assert slate.loc[0, "pick_tier"] == "validated_policy_pick"
    assert slate.loc[0, "stake_pct"] == 0.0025


def test_append_forward_decisions_locks_only_first_pick_per_match() -> None:
    rows = pd.DataFrame(
        [
            {
                "policy_id": "p1",
                "match_id": "m1",
                "match_date": "2026-07-26",
                "quote_timestamp": "2026-07-26T16:00:00Z",
                "sportsbook": "Book",
                "line": 2.5,
                "over_odds": 1.9,
                "actionable": True,
                "pick_tier": "validated_policy_pick",
                "reason": "accepted",
                "stake_pct": 0.0025,
            },
            {
                "policy_id": "p1",
                "match_id": "m1",
                "match_date": "2026-07-26",
                "quote_timestamp": "2026-07-26T17:00:00Z",
                "sportsbook": "Book",
                "line": 2.5,
                "over_odds": 1.95,
                "actionable": True,
                "pick_tier": "validated_policy_pick",
                "reason": "accepted",
                "stake_pct": 0.0025,
            },
        ]
    )

    combined = append_forward_decisions(pd.DataFrame(), rows)

    assert int(combined["actionable"].sum()) == 1
    assert combined.iloc[1]["reason"] == "already_locked_policy_pick"
    assert combined.iloc[1]["stake_pct"] == 0.0


def test_settle_forward_decisions_grades_total_over() -> None:
    decisions = pd.DataFrame(
        [
            {
                "policy_id": "p1",
                "match_id": "m1",
                "actionable": True,
                "line": 2.5,
                "over_odds": 1.9,
            },
            {
                "policy_id": "p1",
                "match_id": "m2",
                "actionable": False,
                "line": 2.5,
                "over_odds": 1.9,
            },
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_status": "completed",
                "home_goals_90": 2,
                "away_goals_90": 1,
            }
        ]
    )

    settled, summary = settle_forward_decisions(
        decisions,
        matches,
        settled_at=datetime(2026, 7, 27, tzinfo=timezone.utc),
    )

    pick = settled[settled["match_id"] == "m1"].iloc[0]
    assert pick["result"] == "win"
    assert round(float(pick["pnl_units"]), 6) == 0.9
    assert summary["settled"] == 1
    assert summary["wins"] == 1
