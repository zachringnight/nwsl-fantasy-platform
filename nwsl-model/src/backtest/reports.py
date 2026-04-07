"""Backtest reporting: summary tables, calibration plots, CLV reports."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from src.betting.clv import clv_summary, compute_clv_report
from src.models.calibration import expected_calibration_error, plot_calibration
from src.utils.io import save_csv, save_json

logger = logging.getLogger("nwsl_model.backtest.reports")


def generate_backtest_report(
    model_results: dict[str, Any],
    output_dir: str = "data/processed/backtest",
    closing_odds: Optional[pd.DataFrame] = None,
) -> dict[str, Any]:
    """Generate comprehensive backtest report.

    Args:
        model_results: Output from BacktestRunner.run().
        output_dir: Directory to save reports.
        closing_odds: Closing odds for CLV computation.

    Returns:
        Summary dictionary.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    summary = {}

    # 1) Metrics comparison table
    metrics_rows = []
    for model_name, result in model_results.items():
        row = {"model": model_name}
        row.update(result["metrics"])
        # Remove non-scalar items
        row.pop("staking_summary", None)
        metrics_rows.append(row)

    metrics_df = pd.DataFrame(metrics_rows)
    save_csv(metrics_df, out / "metrics_comparison.csv")
    summary["metrics_comparison"] = metrics_df.to_dict("records")

    # 2) Predictions file per model
    for model_name, result in model_results.items():
        preds = result["predictions"]
        # Drop score_matrix column for CSV (not serializable)
        preds_out = preds.drop(columns=["score_matrix"], errors="ignore")
        save_csv(preds_out, out / f"predictions_{model_name}.csv")

    # 3) Bet log per model
    for model_name, result in model_results.items():
        bet_log = result.get("bet_log")
        if bet_log is not None and len(bet_log) > 0:
            save_csv(bet_log, out / f"bet_log_{model_name}.csv")

    # 4) Calibration plots
    for model_name, result in model_results.items():
        preds = result["predictions"]
        if "prob_home" in preds.columns:
            # 1X2 calibration: use home win
            predicted = preds["prob_home"].values
            actual = (preds["home_goals_90"] > preds["away_goals_90"]).astype(int).values

            ece = expected_calibration_error(predicted, actual)
            summary[f"{model_name}_ece_home_win"] = ece

            try:
                plot_calibration(
                    predicted, actual,
                    title=f"Calibration: {model_name} (Home Win)",
                    save_path=str(out / f"calibration_{model_name}_home.png"),
                )
            except Exception as e:
                logger.warning(f"Failed to generate calibration plot for {model_name}: {e}")

    # 5) CLV report
    for model_name, result in model_results.items():
        bet_log = result.get("bet_log")
        if bet_log is not None and len(bet_log) > 0:
            clv_report = compute_clv_report(
                pd.DataFrame(bet_log), closing_odds
            )
            save_csv(clv_report, out / f"clv_{model_name}.csv")
            clv_stats = clv_summary(clv_report)
            summary[f"{model_name}_clv"] = clv_stats

    # 6) Save summary JSON
    save_json(summary, out / "backtest_summary.json")

    logger.info(f"Backtest report saved to {out}")
    return summary


def print_summary(model_results: dict[str, Any]) -> None:
    """Print a formatted summary to stdout."""
    print("\n" + "=" * 80)
    print("BACKTEST RESULTS SUMMARY")
    print("=" * 80)

    for model_name, result in model_results.items():
        metrics = result["metrics"]
        print(f"\n--- {model_name} ---")
        for key, val in sorted(metrics.items()):
            if key in ("model", "staking_summary"):
                continue
            if isinstance(val, float):
                print(f"  {key:30s}: {val:.4f}")
            else:
                print(f"  {key:30s}: {val}")

        staking = metrics.get("staking_summary", {})
        if staking:
            print(f"  {'--- Staking ---':30s}")
            for k, v in staking.items():
                if isinstance(v, float):
                    print(f"    {k:28s}: {v:.4f}")
                else:
                    print(f"    {k:28s}: {v}")

    print("\n" + "=" * 80)
