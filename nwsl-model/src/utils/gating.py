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
    "spi_lite_baseline",
}
PURE_PROJECTION_THRESHOLDS = {
    "relative_baseline_improvement": 0.98,
    "classwise_ece": 0.05,
    "totals_ece": 0.06,
    "totals_brier": 0.24,
    "max_slice_regression": 1.10,
}

# Baseline (e.g. spi_lite_baseline) promotion gate. Backtest ROI is measured
# on close-time, uncalibrated odds while live picks run on current, calibrated
# odds and current gating -- the evidence does not directly transfer, so the
# bar is raised well above "beats zero" and a caveat always ships alongside
# the result so a human sees the gap even when the gate passes.
BASELINE_EVIDENCE_CAVEAT = (
    "OOS ROI measured on close-time, uncalibrated backtest odds; live picks run on "
    "current, calibrated odds and current gating — this evidence does not directly transfer"
)
BASELINE_OOS_THRESHOLDS = {
    "min_n_blocks_tuned": 5,
    "min_n_bets": 50,
    "min_roi_units": 0.05,
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


def _best_baseline_by_effective_log_loss(
    backtest_summary: dict[str, Any],
    evaluation_summary: dict[str, Any],
) -> tuple[str | None, float | None]:
    """Strongest baseline by OOF-calibrated log loss when available, else raw.

    Mirrors the pure-model gate's "effective_log_loss" convention (production
    applies post-hoc calibration, so the honest comparison is the
    out-of-fold estimate, not the raw backtest number) so the baseline gate's
    "is this genuinely the strongest baseline" check uses the same standard.
    """
    eval_models = evaluation_summary.get("models", {})
    best_name = None
    best_value = None
    for model_name, metrics in backtest_summary.get("models", {}).items():
        if model_name not in BASELINE_MODELS:
            continue
        raw_log_loss = metrics.get("log_loss_1x2")
        posthoc = eval_models.get(model_name, {}).get("posthoc_calibration", {})
        effective = posthoc.get("multiclass_log_loss_after_oof", raw_log_loss)
        if effective is None:
            continue
        effective = float(effective)
        if best_value is None or effective < best_value:
            best_name = model_name
            best_value = effective
    return best_name, best_value


def evaluate_baseline_go_live_gates(
    backtest_summary: dict[str, Any],
    evaluation_summary: dict[str, Any],
    dataset_manifest: dict[str, Any],
    oos_summary: dict[str, Any] | None,
) -> dict[str, Any]:
    """Evaluate the baseline (e.g. spi_lite_baseline) promotion gate.

    Unlike `evaluate_go_live_gates` (one result per pure model), this
    evaluates a single candidate: the strongest current baseline by
    effective (OOF) log loss, cross-checked against whichever model the
    nested-tuning OOS artifact (`oos_summary`) was actually produced for so
    stale evidence from a no-longer-strongest baseline can't be credited.

    Fails closed (passed=False, evidence_missing=True) when no OOS artifact
    is supplied. Always returns an `evidence_caveat` regardless of outcome
    so the evidence-transfer gap stays visible even when the gate passes.
    """
    season_coverage_ok = _season_coverage_ok(dataset_manifest)
    strongest_name, strongest_effective_log_loss = _best_baseline_by_effective_log_loss(
        backtest_summary, evaluation_summary
    )

    evidence_missing = not bool(oos_summary)
    oos_model = oos_summary.get("model") if oos_summary else None
    moneyline_oos = (oos_summary or {}).get("oos", {}).get("moneyline", {}) or {}

    eval_model = evaluation_summary.get("models", {}).get(strongest_name, {}) if strongest_name else {}
    classwise_ece = eval_model.get("classwise_ece", {})
    max_class_ece = max(classwise_ece.values()) if classwise_ece else 1.0
    posthoc = eval_model.get("posthoc_calibration", {})
    posthoc_available = bool(posthoc.get("available", False))

    is_strongest_baseline = bool(strongest_name) and oos_model == strongest_name

    n_blocks_tuned = moneyline_oos.get("n_blocks_tuned", 0) or 0
    n_bets = moneyline_oos.get("n_bets", 0) or 0
    roi_units = moneyline_oos.get("roi_units", 0.0) or 0.0

    checks = {
        "evidence_present": not evidence_missing,
        "season_coverage_ok": season_coverage_ok,
        "classwise_ece_ok": max_class_ece <= PURE_PROJECTION_THRESHOLDS["classwise_ece"],
        "posthoc_calibration_available": posthoc_available,
        "is_strongest_baseline": is_strongest_baseline,
        "oos_n_blocks_tuned_ok": (
            (not evidence_missing) and float(n_blocks_tuned) >= BASELINE_OOS_THRESHOLDS["min_n_blocks_tuned"]
        ),
        "oos_n_bets_ok": (not evidence_missing) and float(n_bets) >= BASELINE_OOS_THRESHOLDS["min_n_bets"],
        "oos_roi_ok": (not evidence_missing) and float(roi_units) >= BASELINE_OOS_THRESHOLDS["min_roi_units"],
    }
    passed = all(checks.values())

    return {
        "model": strongest_name,
        "passed": passed,
        "gating_status": "passed" if passed else "research_only",
        "evidence_missing": evidence_missing,
        "evidence_caveat": BASELINE_EVIDENCE_CAVEAT,
        "checks": checks,
        "metrics": {
            "effective_log_loss_1x2": strongest_effective_log_loss,
            "max_classwise_ece": max_class_ece,
            "oos_moneyline": {
                "n_blocks_tuned": n_blocks_tuned,
                "n_bets": n_bets,
                "roi_units": roi_units,
            },
        },
    }


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

        # Production applies post-hoc calibration, so the fair comparison against
        # the baseline is the *out-of-fold* calibrated metric (an honest
        # generalization estimate), not the raw model or the in-sample "after"
        # number. Fall back to the raw metric when no OOF estimate is available.
        effective_log_loss = float(posthoc.get("multiclass_log_loss_after_oof", log_loss))
        effective_brier = float(posthoc.get("multiclass_brier_after_oof", brier))

        baseline_log_loss_ok = (
            best_baseline_log_loss is not None
            and effective_log_loss <= best_baseline_log_loss * PURE_PROJECTION_THRESHOLDS["relative_baseline_improvement"]
        )
        baseline_brier_ok = (
            best_baseline_brier is not None
            and effective_brier <= best_baseline_brier * PURE_PROJECTION_THRESHOLDS["relative_baseline_improvement"]
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
                "effective_log_loss_1x2": effective_log_loss,
                "effective_brier_1x2": effective_brier,
                "effective_metric_source": (
                    "oof_calibrated" if "multiclass_log_loss_after_oof" in posthoc else "raw"
                ),
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


def choose_champions(
    gate_results: dict[str, Any],
    baseline_gate_results: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Select the promoted pure champion based on pure-projection gates.

    Pure passers keep absolute priority. Only when none pass, and a
    baseline candidate's own gate (`evaluate_baseline_go_live_gates`)
    genuinely passed, is the baseline aliased to champion_pure -- carrying
    its evidence caveat forward so the evidence-transfer gap is never
    promoted away silently.
    """
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
    elif baseline_gate_results and baseline_gate_results.get("passed") and baseline_gate_results.get("model"):
        champions["aliases"]["champion_pure"] = {
            "model_family": baseline_gate_results["model"],
            "blended": False,
            "gating_status": "passed",
            "mode": "baseline",
            "evidence_caveat": baseline_gate_results.get("evidence_caveat"),
        }
    return champions
