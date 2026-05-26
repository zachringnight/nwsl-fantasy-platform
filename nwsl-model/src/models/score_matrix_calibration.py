"""Score-matrix calibration utilities."""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from scipy.stats import poisson

TOTAL_INTENSITY_GRID: tuple[float, ...] = (0.90, 0.95, 1.00, 1.05, 1.10)
DRAW_INFLATION_GRID: tuple[float, ...] = (0.90, 1.00, 1.10, 1.20)
OBJECTIVE_OVER_2_5_WEIGHT = 0.25
_IDENTITY_PARAMS = {"total_intensity_scale": 1.0, "draw_inflation": 1.0}
_EPSILON = 1e-15


def calibrate_score_matrix(
    matrix: NDArray[np.float64],
    *,
    total_intensity_scale: float = 1.0,
    draw_inflation: float = 1.0,
) -> NDArray[np.float64]:
    if not np.isfinite(total_intensity_scale) or total_intensity_scale <= 0.0:
        raise ValueError("total_intensity_scale must be a positive finite value.")
    if not np.isfinite(draw_inflation) or draw_inflation <= 0.0:
        raise ValueError("draw_inflation must be a positive finite value.")

    calibrated = np.asarray(matrix, dtype=float).copy()
    if calibrated.ndim != 2:
        raise ValueError("Score matrix must be two-dimensional.")
    if not np.isfinite(calibrated).all():
        raise ValueError("Score matrix contains non-finite values.")
    if (calibrated < 0).any():
        raise ValueError("Score matrix contains negative probabilities.")

    n_home, n_away = calibrated.shape
    for home in range(n_home):
        for away in range(n_away):
            total = home + away
            if total_intensity_scale != 1.0:
                calibrated[home, away] *= total_intensity_scale ** total
            if home == away:
                calibrated[home, away] *= draw_inflation

    total_mass = float(calibrated.sum())
    if total_mass <= 0.0:
        raise ValueError("Score matrix has no positive probability mass after calibration.")
    return calibrated / total_mass


def build_independent_poisson_score_matrix(
    lambda_home: float,
    lambda_away: float,
    *,
    max_goals: int = 8,
) -> NDArray[np.float64]:
    """Build a normalized independent Poisson score matrix from goal intensities."""
    if max_goals < 0:
        raise ValueError("max_goals must be non-negative.")
    if not np.isfinite(lambda_home) or not np.isfinite(lambda_away):
        raise ValueError("Goal intensities must be finite.")

    goals = np.arange(max_goals + 1, dtype=np.float64)
    home_pmf = poisson.pmf(goals, max(float(lambda_home), 0.05))
    away_pmf = poisson.pmf(goals, max(float(lambda_away), 0.05))
    matrix = np.outer(home_pmf, away_pmf)
    total_mass = float(matrix.sum())
    if total_mass <= 0.0:
        raise ValueError("Independent Poisson score matrix has no positive probability mass.")
    return matrix / total_mass


def _derive_1x2_probs(matrix: NDArray[np.float64]) -> tuple[float, float, float]:
    return (
        float(np.sum(np.tril(matrix, -1))),
        float(np.sum(np.diag(matrix))),
        float(np.sum(np.triu(matrix, 1))),
    )


def _derive_over_probability(matrix: NDArray[np.float64], line: float) -> float:
    home_goals, away_goals = np.indices(matrix.shape)
    return float(matrix[(home_goals + away_goals) > line].sum())


def _fold_mean(values: NDArray[np.float64], folds: NDArray[np.object_] | None) -> float:
    if folds is None:
        return float(np.mean(values))

    frame = pd.DataFrame({"fold": folds, "value": values})
    return float(frame.groupby("fold", dropna=False)["value"].mean().mean())


def _evaluate_score_matrix_predictions(
    matrices: Sequence[NDArray[np.float64]],
    actual_home_goals: NDArray[np.int64],
    actual_away_goals: NDArray[np.int64],
    folds: NDArray[np.object_] | None,
) -> dict[str, float]:
    probabilities = np.asarray([_derive_1x2_probs(matrix) for matrix in matrices], dtype=float)
    outcomes = np.where(
        actual_home_goals > actual_away_goals,
        0,
        np.where(actual_home_goals == actual_away_goals, 1, 2),
    )
    selected = np.clip(probabilities[np.arange(len(outcomes)), outcomes], _EPSILON, 1.0)
    log_losses = -np.log(selected)

    over_probabilities = np.asarray(
        [_derive_over_probability(matrix, 2.5) for matrix in matrices],
        dtype=float,
    )
    over_actual = (actual_home_goals + actual_away_goals > 2.5).astype(int)
    over_brier = (over_probabilities - over_actual) ** 2

    multiclass_log_loss = _fold_mean(log_losses, folds)
    over_2_5_brier = _fold_mean(over_brier, folds)
    return {
        "multiclass_log_loss": multiclass_log_loss,
        "over_2_5_brier": over_2_5_brier,
        "objective": multiclass_log_loss + OBJECTIVE_OVER_2_5_WEIGHT * over_2_5_brier,
    }


def fit_score_matrix_calibration(
    matrices: Sequence[NDArray[np.float64]],
    actual_home_goals: Sequence[int],
    actual_away_goals: Sequence[int],
    *,
    total_intensity_grid: Sequence[float] = TOTAL_INTENSITY_GRID,
    draw_inflation_grid: Sequence[float] = DRAW_INFLATION_GRID,
    folds: Sequence[object] | None = None,
) -> dict[str, Any]:
    """Fit a guarded score-matrix calibration candidate by grid search."""
    matrix_list = [calibrate_score_matrix(matrix) for matrix in matrices]
    n_samples = len(matrix_list)
    actual_home = np.asarray(actual_home_goals, dtype=np.int64)
    actual_away = np.asarray(actual_away_goals, dtype=np.int64)
    if n_samples == 0:
        return {
            "available": False,
            "reason": "no_score_matrices",
            "method": "score_matrix_grid_search",
            "selected": dict(_IDENTITY_PARAMS),
        }
    if len(actual_home) != n_samples or len(actual_away) != n_samples:
        raise ValueError("Score matrices and actual score arrays must have the same length.")

    fold_array = np.asarray(folds, dtype=object) if folds is not None else None
    if fold_array is not None and len(fold_array) != n_samples:
        raise ValueError("folds must have the same length as score matrices.")

    metrics_before = _evaluate_score_matrix_predictions(
        matrix_list,
        actual_home,
        actual_away,
        fold_array,
    )
    best_metrics = dict(metrics_before)
    best_params = dict(_IDENTITY_PARAMS)
    candidates_evaluated = 0
    rejected_for_log_loss = 0
    baseline_log_loss = metrics_before["multiclass_log_loss"]

    for total_intensity_scale in total_intensity_grid:
        for draw_inflation in draw_inflation_grid:
            params = {
                "total_intensity_scale": float(total_intensity_scale),
                "draw_inflation": float(draw_inflation),
            }
            candidates_evaluated += 1
            if params == _IDENTITY_PARAMS:
                continue

            calibrated = [
                calibrate_score_matrix(
                    matrix,
                    total_intensity_scale=params["total_intensity_scale"],
                    draw_inflation=params["draw_inflation"],
                )
                for matrix in matrix_list
            ]
            candidate_metrics = _evaluate_score_matrix_predictions(
                calibrated,
                actual_home,
                actual_away,
                fold_array,
            )
            if candidate_metrics["multiclass_log_loss"] > baseline_log_loss + 1e-12:
                rejected_for_log_loss += 1
                continue
            if candidate_metrics["objective"] < best_metrics["objective"] - 1e-12:
                best_metrics = candidate_metrics
                best_params = params

    accepted = best_params != _IDENTITY_PARAMS
    return {
        "available": True,
        "method": "score_matrix_grid_search",
        "objective": "fold_mean_multiclass_log_loss_plus_0.25_over_2_5_brier",
        "selected": best_params,
        "accepted": accepted,
        "n_samples": int(n_samples),
        "grid": {
            "total_intensity_scale": [float(value) for value in total_intensity_grid],
            "draw_inflation": [float(value) for value in draw_inflation_grid],
        },
        "candidates_evaluated": int(candidates_evaluated),
        "candidates_rejected_for_log_loss": int(rejected_for_log_loss),
        "metrics_before": metrics_before,
        "metrics_after": best_metrics,
        "delta": {
            "multiclass_log_loss": (
                best_metrics["multiclass_log_loss"] - metrics_before["multiclass_log_loss"]
            ),
            "over_2_5_brier": best_metrics["over_2_5_brier"] - metrics_before["over_2_5_brier"],
            "objective": best_metrics["objective"] - metrics_before["objective"],
        },
    }


def fit_score_matrix_calibration_from_predictions(
    predictions: pd.DataFrame,
    *,
    max_goals: int = 8,
    total_intensity_grid: Sequence[float] = TOTAL_INTENSITY_GRID,
    draw_inflation_grid: Sequence[float] = DRAW_INFLATION_GRID,
) -> dict[str, Any]:
    """Fit score-matrix calibration from backtest CSV rows using stored lambdas."""
    required = {"lambda_home", "lambda_away", "home_goals_90", "away_goals_90"}
    missing = sorted(required - set(predictions.columns))
    if predictions.empty or missing:
        return {
            "available": False,
            "reason": "missing_required_columns" if missing else "empty_predictions",
            "missing_columns": missing,
            "method": "score_matrix_grid_search",
            "source": "independent_poisson_from_lambdas",
            "selected": dict(_IDENTITY_PARAMS),
        }

    frame = predictions.copy()
    for column in required:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    mask = frame[list(required)].notna().all(axis=1)
    if not mask.any():
        return {
            "available": False,
            "reason": "no_valid_prediction_rows",
            "method": "score_matrix_grid_search",
            "source": "independent_poisson_from_lambdas",
            "selected": dict(_IDENTITY_PARAMS),
            "n_input_rows": int(len(predictions)),
        }

    usable = frame.loc[mask].copy()
    matrices = [
        build_independent_poisson_score_matrix(
            row.lambda_home,
            row.lambda_away,
            max_goals=max_goals,
        )
        for row in usable.itertuples(index=False)
    ]
    fold_column = next(
        (column for column in ("fold", "fold_id", "backtest_fold") if column in usable.columns),
        None,
    )
    folds = usable[fold_column].astype(str).to_numpy() if fold_column else None
    artifact = fit_score_matrix_calibration(
        matrices,
        usable["home_goals_90"].round().astype(int).to_numpy(),
        usable["away_goals_90"].round().astype(int).to_numpy(),
        total_intensity_grid=total_intensity_grid,
        draw_inflation_grid=draw_inflation_grid,
        folds=folds,
    )
    artifact["source"] = "independent_poisson_from_lambdas"
    artifact["max_goals"] = int(max_goals)
    artifact["n_input_rows"] = int(len(predictions))
    artifact["n_valid_rows"] = int(len(usable))
    if fold_column:
        artifact["fold_column"] = fold_column
    return artifact
