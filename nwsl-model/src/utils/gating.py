"""Evaluation summaries and pure-projection promotion gates."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from pathlib import Path

from src.models.calibration import expected_calibration_error

PURE_MODELS = {"dixon_coles", "bivariate_poisson"}
BASELINE_MODELS = {
    "uniform_baseline",
    "home_field_baseline",
    "team_ratings_poisson",
    "rolling_npxg_poisson",
}
PURE_PROJECTION_THRESHOLDS = {
    "relative_baseline_improvement": 0.98,
    "classwise_ece": 0.05,
    "totals_ece": 0.06,
    "totals_brier": 0.24,
    "max_slice_regression": 1.10,
}


def _binary_ece(probabilities: pd.Series, actual: pd.Series) -> float:
    if probabilities.empty:
        return 0.0
    return float(expected_calibration_error(probabilities.to_numpy(), actual.astype(int).to_numpy()))


def summarize_prediction_file(predictions: pd.DataFrame) -> dict[str, Any]:
    """Compute classwise calibration and totals calibration for a prediction file."""
    if predictions.empty:
        return {
            "classwise_ece": {"home": 0.0, "draw": 0.0, "away": 0.0},
            "totals": {},
        }

    home_actual = (predictions["home_goals_90"] > predictions["away_goals_90"]).astype(int)
    draw_actual = (predictions["home_goals_90"] == predictions["away_goals_90"]).astype(int)
    away_actual = (predictions["home_goals_90"] < predictions["away_goals_90"]).astype(int)

    summary = {
        "classwise_ece": {
            "home": _binary_ece(predictions["prob_home"], home_actual),
            "draw": _binary_ece(predictions["prob_draw"], draw_actual),
            "away": _binary_ece(predictions["prob_away"], away_actual),
        },
        "totals": {},
    }

    total_goals = predictions["home_goals_90"] + predictions["away_goals_90"]
    for line in (1.5, 2.5, 3.5, 4.5):
        column = f"prob_over_{line}"
        if column not in predictions.columns:
            continue
        mask = predictions[column].notna()
        if not mask.any():
            continue
        probabilities = predictions.loc[mask, column]
        actual = (total_goals.loc[mask] > line).astype(int)
        summary["totals"][str(line)] = {
            "ece": _binary_ece(probabilities, actual),
            "brier": float(np.mean((probabilities.to_numpy() - actual.to_numpy()) ** 2)),
            "n": int(mask.sum()),
        }

    return summary


def build_evaluation_summary(backtest_dir: Path) -> dict[str, Any]:
    """Read prediction exports in a backtest directory and summarize calibration."""
    payload: dict[str, Any] = {"models": {}}
    for prediction_path in sorted(backtest_dir.glob("predictions_*.csv")):
        model_name = prediction_path.stem.replace("predictions_", "")
        predictions = pd.read_csv(prediction_path)
        payload["models"][model_name] = summarize_prediction_file(predictions)
    return payload


def _season_coverage_ok(dataset_manifest: dict[str, Any]) -> bool:
    history_start = dataset_manifest.get("history_start_season")
    seasons = dataset_manifest.get("matches", {}).get("season_coverage", [])
    if not seasons:
        return False
    if history_start is None:
        return len(seasons) >= 2
    return history_start in seasons and (history_start + 1) in seasons


def _best_baseline_metric(backtest_summary: dict[str, Any], metric_name: str) -> tuple[str | None, float | None]:
    best_name = None
    best_value = None
    for model_name, metrics in backtest_summary.get("models", {}).items():
        if model_name not in BASELINE_MODELS:
            continue
        metric_value = metrics.get(metric_name)
        if metric_value is None:
            continue
        metric_value = float(metric_value)
        if best_value is None or metric_value < best_value:
            best_name = model_name
            best_value = metric_value
    return best_name, best_value


def _slice_regression_ok(
    model_slice_metrics: dict[str, Any],
    baseline_slice_metrics: dict[str, Any],
) -> tuple[bool, dict[str, Any]]:
    if not model_slice_metrics or not baseline_slice_metrics:
        return False, {"reason": "missing_slice_metrics"}

    comparisons: dict[str, Any] = {}
    passed = True
    for slice_name, baseline_payload in baseline_slice_metrics.items():
        candidate_payload = model_slice_metrics.get(slice_name, {})
        baseline_log_loss = baseline_payload.get("log_loss_1x2")
        candidate_log_loss = candidate_payload.get("log_loss_1x2")
        if baseline_log_loss is None or candidate_log_loss is None:
            comparisons[slice_name] = {"available": False}
            passed = False
            continue
        ratio = float(candidate_log_loss) / max(float(baseline_log_loss), 1e-9)
        okay = ratio <= PURE_PROJECTION_THRESHOLDS["max_slice_regression"]
        passed = passed and okay
        comparisons[slice_name] = {
            "available": True,
            "baseline_log_loss": float(baseline_log_loss),
            "candidate_log_loss": float(candidate_log_loss),
            "ratio": ratio,
            "passed": okay,
        }
    return passed, comparisons


def evaluate_go_live_gates(
    training_summary: dict[str, Any],
    backtest_summary: dict[str, Any],
    evaluation_summary: dict[str, Any],
    dataset_manifest: dict[str, Any],
) -> dict[str, Any]:
    """Evaluate pure projection promotion gates for each candidate."""
    season_coverage_ok = _season_coverage_ok(dataset_manifest)
    best_baseline_log_loss_name, best_baseline_log_loss = _best_baseline_metric(backtest_summary, "log_loss_1x2")
    best_baseline_brier_name, best_baseline_brier = _best_baseline_metric(backtest_summary, "brier_score_1x2")
    best_baseline_total_mae_name, best_baseline_total_mae = _best_baseline_metric(backtest_summary, "expected_total_goals_mae")

    slice_metrics = evaluation_summary.get("slice_metrics", {})
    gate_results: dict[str, Any] = {}

    for model_name, metrics in backtest_summary.get("models", {}).items():
        if model_name not in PURE_MODELS:
            continue

        training_model = training_summary.get("models", {}).get(model_name, {})
        eval_model = evaluation_summary.get("models", {}).get(model_name, {})
        benchmark_comparison = eval_model.get("benchmark_comparison", {})
        classwise_ece = eval_model.get("classwise_ece", {})
        totals = eval_model.get("totals", {})
        posthoc = eval_model.get("posthoc_calibration", {})
        max_class_ece = max(classwise_ece.values()) if classwise_ece else 1.0
        totals_ece = max(
            totals.get("2.5", {}).get("ece", 1.0),
            totals.get("3.5", {}).get("ece", 1.0),
        )
        totals_brier_ok = (
            totals.get("2.5", {}).get("brier", 1.0) <= PURE_PROJECTION_THRESHOLDS["totals_brier"]
            and totals.get("3.5", {}).get("brier", 1.0) <= PURE_PROJECTION_THRESHOLDS["totals_brier"]
        )

        log_loss = float(metrics.get("log_loss_1x2", 999.0))
        brier = float(metrics.get("brier_score_1x2", 999.0))
        total_goals_mae = float(metrics.get("expected_total_goals_mae", 999.0))

        baseline_log_loss_ok = (
            best_baseline_log_loss is not None
            and log_loss <= best_baseline_log_loss * PURE_PROJECTION_THRESHOLDS["relative_baseline_improvement"]
        )
        baseline_brier_ok = (
            best_baseline_brier is not None
            and brier <= best_baseline_brier * PURE_PROJECTION_THRESHOLDS["relative_baseline_improvement"]
        )
        total_goals_mae_ok = (
            best_baseline_total_mae is not None
            and total_goals_mae <= best_baseline_total_mae
        )

        best_slice_baseline_name = benchmark_comparison.get("strongest_baseline")
        baseline_slice_metrics = slice_metrics.get(best_slice_baseline_name, {}) if best_slice_baseline_name else {}
        candidate_slice_metrics = slice_metrics.get(model_name, {})
        slice_ok, slice_comparisons = _slice_regression_ok(candidate_slice_metrics, baseline_slice_metrics)

        passed = all(
            [
                bool(training_model.get("converged", False)),
                season_coverage_ok,
                baseline_log_loss_ok,
                baseline_brier_ok,
                total_goals_mae_ok,
                max_class_ece <= PURE_PROJECTION_THRESHOLDS["classwise_ece"],
                totals_ece <= PURE_PROJECTION_THRESHOLDS["totals_ece"],
                totals_brier_ok,
                bool(posthoc.get("available", False)),
                slice_ok,
            ]
        )
        gate_results[model_name] = {
            "passed": passed,
            "gating_status": "passed" if passed else "research_only",
            "checks": {
                "converged": bool(training_model.get("converged", False)),
                "season_coverage_ok": season_coverage_ok,
                "beats_best_baseline_log_loss": baseline_log_loss_ok,
                "beats_best_baseline_brier": baseline_brier_ok,
                "total_goals_mae_ok": total_goals_mae_ok,
                "classwise_ece_ok": max_class_ece <= PURE_PROJECTION_THRESHOLDS["classwise_ece"],
                "totals_ece_ok": totals_ece <= PURE_PROJECTION_THRESHOLDS["totals_ece"],
                "totals_brier_ok": totals_brier_ok,
                "posthoc_calibration_available": bool(posthoc.get("available", False)),
                "slice_stability_ok": slice_ok,
            },
            "metrics": {
                "log_loss_1x2": log_loss,
                "brier_score_1x2": brier,
                "expected_total_goals_mae": total_goals_mae,
                "max_classwise_ece": max_class_ece,
                "totals_ece": totals_ece,
                "totals_brier_2.5": totals.get("2.5", {}).get("brier"),
                "totals_brier_3.5": totals.get("3.5", {}).get("brier"),
                "best_baseline_log_loss_model": best_baseline_log_loss_name,
                "best_baseline_log_loss": best_baseline_log_loss,
                "best_baseline_brier_model": best_baseline_brier_name,
                "best_baseline_brier": best_baseline_brier,
                "best_baseline_total_goals_mae_model": best_baseline_total_mae_name,
                "best_baseline_total_goals_mae": best_baseline_total_mae,
            },
            "slice_comparisons": slice_comparisons,
        }
    return gate_results


def choose_champions(gate_results: dict[str, Any]) -> dict[str, Any]:
    """Select the promoted pure champion based on pure-projection gates."""
    pure_candidates = {
        model_name: result
        for model_name, result in gate_results.items()
        if model_name in PURE_MODELS and result.get("passed")
    }

    champions: dict[str, Any] = {"aliases": {}, "experimental": {}}
    if pure_candidates:
        best_pure = min(
            pure_candidates.items(),
            key=lambda item: item[1]["metrics"]["log_loss_1x2"],
        )
        champions["aliases"]["champion_pure"] = {
            "model_family": best_pure[0],
            "blended": False,
            "gating_status": "passed",
            "mode": "pure_projection",
        }
    return champions
