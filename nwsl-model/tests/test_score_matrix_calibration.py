import json

import numpy as np
import pandas as pd
import pytest

from scripts.predict import _load_calibration_artifact
from scripts.run_operator_report import _load_calibration_artifact as _load_operator_calibration_artifact
from src.models.score_matrix_calibration import (
    calibrate_score_matrix,
    fit_score_matrix_calibration,
    fit_score_matrix_calibration_from_predictions,
)


def test_calibrate_score_matrix_preserves_normalized_distribution() -> None:
    matrix = np.ones((3, 3), dtype=float) / 9.0

    calibrated = calibrate_score_matrix(matrix, total_intensity_scale=1.10, draw_inflation=1.05)

    assert calibrated.shape == (3, 3)
    assert abs(float(calibrated.sum()) - 1.0) < 1e-12
    assert (calibrated >= 0).all()
    assert calibrated[1, 1] > matrix[1, 1]


def test_calibrate_score_matrix_rejects_invalid_or_zero_mass_input() -> None:
    with pytest.raises(ValueError, match="positive probability mass"):
        calibrate_score_matrix(np.zeros((2, 2), dtype=float))

    with pytest.raises(ValueError, match="negative probabilities"):
        calibrate_score_matrix(np.array([[0.5, -0.1], [0.2, 0.4]], dtype=float))


def test_fit_score_matrix_calibration_rejects_composite_gain_with_worse_log_loss() -> None:
    matrix = np.array(
        [
            [0.01624304, 0.08674663, 0.06316487, 0.03730128],
            [0.05841339, 0.10694570, 0.11230275, 0.04301875],
            [0.06871669, 0.03869929, 0.07145441, 0.04062804],
            [0.04708549, 0.10704026, 0.02731181, 0.07492759],
        ],
        dtype=float,
    )
    matrix = matrix / matrix.sum()

    artifact = fit_score_matrix_calibration(
        [matrix],
        [1],
        [0],
        total_intensity_grid=[1.0, 1.05],
        draw_inflation_grid=[1.0],
    )

    assert artifact["selected"]["total_intensity_scale"] == 1.0
    assert artifact["selected"]["draw_inflation"] == 1.0
    assert artifact["accepted"] is False
    assert artifact["candidates_rejected_for_log_loss"] == 1
    assert artifact["metrics_after"]["objective"] == pytest.approx(
        artifact["metrics_before"]["objective"]
    )


def test_fit_score_matrix_calibration_returns_noop_when_candidates_worsen_log_loss() -> None:
    matrix = np.array(
        [
            [0.35, 0.05, 0.00],
            [0.05, 0.45, 0.05],
            [0.00, 0.05, 0.00],
        ],
        dtype=float,
    )
    matrix = matrix / matrix.sum()

    artifact = fit_score_matrix_calibration(
        [matrix],
        [1],
        [1],
        total_intensity_grid=[1.0],
        draw_inflation_grid=[1.0, 0.9],
    )

    assert artifact["selected"] == {"total_intensity_scale": 1.0, "draw_inflation": 1.0}
    assert artifact["accepted"] is False
    assert artifact["metrics_after"] == artifact["metrics_before"]


def test_fit_score_matrix_calibration_from_predictions_uses_lambdas() -> None:
    frame = pd.DataFrame(
        {
            "lambda_home": [1.2, 0.8],
            "lambda_away": [0.9, 1.4],
            "home_goals_90": [1, 0],
            "away_goals_90": [0, 2],
            "prob_over_2.5": [0.42, 0.36],
        }
    )

    artifact = fit_score_matrix_calibration_from_predictions(
        frame,
        max_goals=4,
        total_intensity_grid=[1.0],
        draw_inflation_grid=[1.0],
    )

    assert artifact["available"] is True
    assert artifact["source"] == "independent_poisson_from_lambdas"
    assert artifact["n_samples"] == 2
    assert artifact["selected"] == {"total_intensity_scale": 1.0, "draw_inflation": 1.0}
    assert artifact["metrics_after"]["multiclass_log_loss"] == pytest.approx(
        artifact["metrics_before"]["multiclass_log_loss"]
    )


def test_fit_score_matrix_calibration_records_candidate_grid_audit_for_accepted_path() -> None:
    matrix = np.array(
        [
            [0.08234323, 0.04669344, 0.09134850, 0.07419483],
            [0.01001978, 0.10379904, 0.08097966, 0.08363146],
            [0.01363035, 0.04791775, 0.03945018, 0.09860097],
            [0.06850251, 0.08753578, 0.04717601, 0.02417653],
        ],
        dtype=float,
    )
    matrix = matrix / matrix.sum()

    artifact = fit_score_matrix_calibration(
        [matrix],
        [3],
        [1],
        total_intensity_grid=[1.0, 1.1],
        draw_inflation_grid=[1.0, 0.9],
    )

    assert artifact["accepted"] is True
    assert artifact["artifact_only"] is True
    assert artifact["applied_to_live_predictions"] is False
    assert artifact["fit_scope"] == "post_hoc_in_sample_backtest"
    assert "not deployable" in artifact["leakage_warning"]
    assert artifact["candidate_count"] == 4
    assert len(artifact["candidate_grid_audit"]) == 4
    selected = [
        candidate
        for candidate in artifact["candidate_grid_audit"]
        if candidate["selection_status"] == "selected"
    ]
    assert len(selected) == 1
    assert selected[0]["accepted"] is True
    assert selected[0]["rejection_reason"] == ""
    assert selected[0]["metrics"]["objective"] == pytest.approx(
        artifact["metrics_after"]["objective"]
    )


def test_fit_score_matrix_calibration_from_predictions_missing_columns_is_explicit() -> None:
    artifact = fit_score_matrix_calibration_from_predictions(
        pd.DataFrame({"lambda_home": [1.0], "home_goals_90": [1]}),
    )

    assert artifact["available"] is False
    assert artifact["reason"] == "missing_required_columns"
    assert artifact["matrix_source"] == "independent_poisson_reconstruction_from_lambdas"
    assert artifact["artifact_only"] is True
    assert artifact["applied_to_live_predictions"] is False
    assert artifact["missing_columns"] == ["away_goals_90", "lambda_away"]


def test_predict_load_calibration_artifact_ignores_score_matrix_only_artifacts(tmp_path) -> None:
    version_dir = tmp_path / "model-version"
    version_dir.mkdir()
    (version_dir / "calibration_artifacts.json").write_text(
        json.dumps(
            {
                "models": {
                    "dixon_coles": {
                        "score_matrix": {
                            "available": True,
                            "artifact_only": True,
                        }
                    }
                }
            }
        )
    )

    assert _load_calibration_artifact(
        {"version_dir": version_dir, "model_family": "dixon_coles"}
    ) is None


def test_operator_report_load_calibration_artifact_ignores_score_matrix_only_artifacts(
    tmp_path,
) -> None:
    version_dir = tmp_path / "model-version"
    version_dir.mkdir()
    (version_dir / "calibration_artifacts.json").write_text(
        json.dumps(
            {
                "models": {
                    "dixon_coles": {
                        "score_matrix": {
                            "available": True,
                            "artifact_only": True,
                        }
                    }
                }
            }
        )
    )

    assert _load_operator_calibration_artifact(
        {"version_dir": version_dir, "model_family": "dixon_coles"}
    ) is None
