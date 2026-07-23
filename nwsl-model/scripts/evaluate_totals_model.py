#!/usr/bin/env python3
"""Evaluate the calibrated totals market-line model against a backtest predictions file.

Writes `<version_dir>/betting_analysis/totals_model_report.json`. Evaluated as a
candidate only; does not touch config or flip totals picks on. See packet 09 of
plans/2026-07-22-model-lab/packets/09-totals-market-model.md.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.metrics import brier_score
from src.models.calibration import expected_calibration_error
from src.models.totals_market_model import TotalsMarketModel
from src.utils.artifacts import resolve_version_dir
from src.utils.io import load_config, load_csv, save_json

REQUIRED_COLUMNS = {
    "main_total_line",
    "prob_over_main_total",
    "total_goals",
    "lambda_home",
    "lambda_away",
    "match_date",
}

_EMPTY_METRICS_BLOCK = {"model": None, "base_raw": None, "market_novig": None}


def _binary_log_loss(probs: np.ndarray, outcomes: np.ndarray, eps: float = 1e-15) -> float:
    clipped = np.clip(probs, eps, 1.0 - eps)
    actual = outcomes.astype(float)
    return float(-np.mean(actual * np.log(clipped) + (1.0 - actual) * np.log(1.0 - clipped)))


def _bias_direction(mean_predicted: float, actual_rate: float) -> str:
    diff = actual_rate - mean_predicted
    if diff >= 0.05:
        return "underprices_overs"
    if diff <= -0.05:
        return "overprices_overs"
    return "balanced"


def _metric_block(probs: pd.Series, outcomes: pd.Series) -> dict[str, float] | None:
    valid = probs.notna() & outcomes.notna()
    if not valid.any():
        return None
    prob_values = probs.loc[valid].astype(float).to_numpy()
    outcome_values = outcomes.loc[valid].astype(int).to_numpy()
    return {
        "n": int(valid.sum()),
        "log_loss": _binary_log_loss(prob_values, outcome_values),
        "brier": brier_score(prob_values, outcome_values.astype(float)),
        "ece_10bin": expected_calibration_error(prob_values, outcome_values, n_bins=10),
        "mean_prob_over": float(np.mean(prob_values)),
        "actual_over_rate": float(np.mean(outcome_values)),
    }


def build_totals_model_report(
    predictions: pd.DataFrame,
    *,
    version: str,
    model_name: str,
    regularization_c: float = 1.0,
    min_train_matches: int = 60,
) -> dict[str, Any]:
    """Run walk-forward evaluation of the totals market model and summarize results.

    Guards against a missing/all-null `main_total_line` column (e.g. an older
    artifact predicted before the baseline path carried totals columns) by
    reporting n_evaluated=0 / keep_suppressed instead of raising.
    """
    empty_report = {
        "version": version,
        "model": model_name,
        "n_evaluated": 0,
        "metrics": dict(_EMPTY_METRICS_BLOCK),
        "bias": {"model_bias_direction": None, "base_bias_direction": None},
        "recommendation": "keep_suppressed",
    }

    if "main_total_line" not in predictions.columns:
        return empty_report
    if predictions["main_total_line"].notna().sum() == 0:
        return empty_report
    if not REQUIRED_COLUMNS.issubset(predictions.columns):
        return empty_report

    model = TotalsMarketModel(regularization_c=regularization_c, min_train_matches=min_train_matches)
    evaluated = model.walk_forward_evaluate(predictions, block="match_date")
    if evaluated.empty:
        return empty_report

    outcome = evaluated["outcome"]
    model_metrics = _metric_block(evaluated["prob_model"], outcome)
    base_metrics = _metric_block(evaluated["prob_base"], outcome)
    market_metrics = _metric_block(evaluated["prob_market"], outcome)

    bias = {
        "model_bias_direction": (
            _bias_direction(model_metrics["mean_prob_over"], model_metrics["actual_over_rate"])
            if model_metrics
            else None
        ),
        "base_bias_direction": (
            _bias_direction(base_metrics["mean_prob_over"], base_metrics["actual_over_rate"])
            if base_metrics
            else None
        ),
    }

    n_evaluated = int(len(evaluated))
    recommendation = "keep_suppressed"
    if (
        model_metrics is not None
        and base_metrics is not None
        and model_metrics["log_loss"] < base_metrics["log_loss"]
        and model_metrics["ece_10bin"] <= 0.06
        and n_evaluated >= 60
    ):
        recommendation = "candidate_for_recalibrated_leans"

    return {
        "version": version,
        "model": model_name,
        "n_evaluated": n_evaluated,
        "metrics": {
            "model": model_metrics,
            "base_raw": base_metrics,
            "market_novig": market_metrics,
        },
        "bias": bias,
        "recommendation": recommendation,
    }


def _print_table(report: dict[str, Any]) -> None:
    print(f"Totals market model report: version={report['version']} model={report['model']}")
    print(f"n_evaluated={report['n_evaluated']}  recommendation={report['recommendation']}")
    header = f"{'candidate':<14}{'n':>6}{'log_loss':>12}{'brier':>10}{'ece_10bin':>12}{'mean_p_over':>14}{'actual_rate':>14}"
    print(header)
    for key, label in (("model", "model"), ("base_raw", "base_raw"), ("market_novig", "market_novig")):
        block = report["metrics"].get(key)
        if not block:
            print(f"{label:<14}{'n/a':>6}")
            continue
        print(
            f"{label:<14}{block['n']:>6}{block['log_loss']:>12.4f}{block['brier']:>10.4f}"
            f"{block['ece_10bin']:>12.4f}{block['mean_prob_over']:>14.4f}{block['actual_over_rate']:>14.4f}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate the calibrated totals market-line model")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", default=None, help="Artifact version (defaults to latest)")
    parser.add_argument("--model", default="spi_lite_baseline", help="Model name whose predictions to evaluate")
    parser.add_argument("--config", default="configs/default.yaml", help="Base YAML config path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config) or {}
    totals_config = config.get("totals_model", {}) or {}
    regularization_c = float(totals_config.get("regularization_c", 1.0))
    min_train_matches = int(totals_config.get("min_train_matches", 60))

    version_dir = resolve_version_dir(args.version, Path(args.artifact_root))
    predictions_path = version_dir / "backtest" / f"predictions_{args.model}.csv"
    if predictions_path.exists():
        predictions = load_csv(predictions_path)
    else:
        predictions = pd.DataFrame()

    report = build_totals_model_report(
        predictions,
        version=version_dir.name,
        model_name=args.model,
        regularization_c=regularization_c,
        min_train_matches=min_train_matches,
    )

    output_path = version_dir / "betting_analysis" / "totals_model_report.json"
    save_json(report, output_path)
    _print_table(report)
    print(f"Report written to {output_path}")


if __name__ == "__main__":
    main()
