from __future__ import annotations

import json

import pandas as pd

from scripts.export_web import export_backtest_summary, export_team_ratings, resolve_artifact_dir


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

    export_backtest_summary(artifact, output)

    summary = json.loads((output / "backtest-summary.json").read_text(encoding="utf-8"))
    assert summary["dixon_coles"]["logLoss"] == 1.0814
    assert summary["dixon_coles"]["brierScore"] == 0.6548
    assert summary["dixon_coles"]["brierOver25"] == 0.2533
    assert summary["dixon_coles"]["totalGoalsMae"] == 1.2633


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
