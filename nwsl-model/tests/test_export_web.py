from __future__ import annotations

import json

import pandas as pd

from scripts.export_web import (
    export_backtest_summary,
    export_predictions,
    export_team_ratings,
    resolve_artifact_dir,
)


def test_resolve_artifact_dir_uses_prediction_model_version(tmp_path) -> None:
    processed = tmp_path / "data" / "processed"
    artifact = processed / "models" / "20260526T030638Z"
    artifact.mkdir(parents=True)
    (artifact / "training_summary.json").write_text("{}", encoding="utf-8")
    pd.DataFrame([{"match_id": "1", "model_version": "20260526T030638Z"}]).to_csv(
        processed / "predictions.csv",
        index=False,
    )

    assert resolve_artifact_dir(processed) == artifact


def test_export_backtest_summary_reads_versioned_metrics_comparison(tmp_path) -> None:
    artifact = tmp_path / "models" / "20260526T030638Z"
    output = tmp_path / "web"
    (artifact / "backtest").mkdir(parents=True)
    output.mkdir()
    pd.DataFrame(
        [
            {
                "model": "dixon_coles",
                "log_loss_1x2": 1.0814,
                "brier_score_1x2": 0.6548,
                "brier_over_2_5": 0.2533,
                "expected_total_goals_mae": 1.2633,
            }
        ]
    ).to_csv(artifact / "backtest" / "metrics_comparison.csv", index=False)
    pd.DataFrame(
        [
            {"match_id": "match-1", "prob_home": 0.5},
            {"match_id": "match-2", "prob_home": 0.4},
        ]
    ).to_csv(
        artifact / "backtest" / "predictions_dixon_coles.csv",
        index=False,
    )

    export_backtest_summary(artifact, output)

    summary = json.loads((output / "backtest-summary.json").read_text(encoding="utf-8"))
    assert summary["dixon_coles"]["logLoss"] == 1.0814
    assert summary["dixon_coles"]["brierScore"] == 0.6548
    assert summary["dixon_coles"]["brierOver25"] == 0.2533
    assert summary["dixon_coles"]["totalGoalsMae"] == 1.2633
    assert summary["dixon_coles"]["totalPredictions"] == 2


def test_export_team_ratings_falls_back_to_artifact_csv(tmp_path) -> None:
    artifact = tmp_path / "models" / "20260526T030638Z"
    output = tmp_path / "web"
    artifact.mkdir(parents=True)
    output.mkdir()
    pd.DataFrame(
        [
            {
                "team": "Orlando Pride",
                "attack_rating": 0.2,
                "defense_rating": -0.1,
                "n_matches": 30,
            }
        ]
    ).to_csv(artifact / "team_ratings.csv", index=False)

    export_team_ratings(artifact, output)

    ratings = json.loads((output / "team-ratings.json").read_text(encoding="utf-8"))
    assert ratings == [
        {
            "team": "Orlando Pride",
            "attackRating": 0.2,
            "defenseRating": -0.1,
            "overallRating": 0.05,
            "nMatches": 30,
            "currentRank": 1,
        }
    ]


def test_export_predictions_preserves_market_prices_for_web_contract(tmp_path) -> None:
    processed = tmp_path / "processed"
    output = processed / "web"
    processed.mkdir()
    output.mkdir()
    pd.DataFrame(
        [
            {
                "match_id": "401853952",
                "match_date": "2026-07-27",
                "home_team": "Angel City FC",
                "away_team": "Racing Louisville FC",
                "prob_home": 0.42,
                "prob_draw": 0.25,
                "prob_away": 0.33,
                "lambda_home": 1.4,
                "lambda_away": 1.1,
                "btts_yes_prob": 0.54,
                "model": "champion_pure",
                "model_version": "20260526T030638Z",
                "model_family": "home_field_baseline",
                "gating_status": "baseline_fallback",
                "top_pick_tier": "no_bet",
                "official_pick_count": 0,
                "lean_bet_count": 0,
                "actionable_pick_count": 0,
                "recommended_bets": "none",
                "recommended_leans": "none",
                "actionable_picks": "none",
                "rejected_bet_reasons": "edge_below_threshold",
                "main_total_line": 2.5,
                "mkt_over_odds": 1.6896551724,
                "mkt_under_odds": 2.03,
                "timestamp": "2026-07-26T21:03:00+00:00",
            }
        ]
    ).to_csv(processed / "predictions.csv", index=False)

    export_predictions(processed, output, {})

    predictions = json.loads((output / "predictions.json").read_text(encoding="utf-8"))
    assert predictions[0]["mainTotalLine"] == 2.5
    assert predictions[0]["mktOverOdds"] == 1.689655
    assert predictions[0]["mktUnderOdds"] == 2.03
    assert predictions[0]["recommendedBets"] == "none"
