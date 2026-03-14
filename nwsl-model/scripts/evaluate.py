#!/usr/bin/env python3
"""Evaluate model performance: calibration, ROI, CLV, benchmark comparisons.

Usage:
    python scripts/evaluate.py --backtest-dir data/processed/backtest
    python scripts/evaluate.py --backtest-dir data/processed/backtest --plots
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.betting.clv import clv_summary
from src.models.calibration import expected_calibration_error, plot_calibration
from src.utils.io import load_json, save_json
from src.utils.logging import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate NWSL model performance")
    parser.add_argument("--backtest-dir", type=str, default="data/processed/backtest")
    parser.add_argument("--plots", action="store_true", help="Generate plots")
    parser.add_argument("--output-dir", type=str, default="data/processed/evaluation")
    args = parser.parse_args()

    setup_logging("INFO")
    logger = logging.getLogger("nwsl_model.evaluate")

    bt_dir = Path(args.backtest_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Load metrics comparison
    metrics_path = bt_dir / "metrics_comparison.csv"
    if not metrics_path.exists():
        logger.error(f"Metrics file not found: {metrics_path}. Run backtest first.")
        sys.exit(1)

    metrics_df = pd.read_csv(metrics_path)
    print("\n=== MODEL COMPARISON ===")
    print(metrics_df.to_string(index=False))

    # Load prediction files for each model
    eval_results = {}

    for pred_file in bt_dir.glob("predictions_*.csv"):
        model_name = pred_file.stem.replace("predictions_", "")
        preds = pd.read_csv(pred_file)

        if "prob_home" not in preds.columns:
            continue

        # Calibration analysis
        predicted = preds["prob_home"].values
        if "home_goals_90" in preds.columns and "away_goals_90" in preds.columns:
            actual = (preds["home_goals_90"] > preds["away_goals_90"]).astype(int).values
        elif "home_win" in preds.columns:
            actual = preds["home_win"].values.astype(int)
        else:
            continue

        ece = expected_calibration_error(predicted, actual)
        eval_results[model_name] = {"ece_home_win": ece}

        print(f"\n--- {model_name} ---")
        print(f"  ECE (Home Win): {ece:.4f}")

        if args.plots:
            try:
                plot_calibration(
                    predicted, actual,
                    title=f"Calibration: {model_name} (Home Win)",
                    save_path=str(out_dir / f"calibration_{model_name}_home.png"),
                )
                logger.info(f"Calibration plot saved for {model_name}")
            except Exception as e:
                logger.warning(f"Failed to plot for {model_name}: {e}")

        # Over/under calibration
        for line in ["2.5", "3.5"]:
            over_col = f"prob_over_{line}"
            if over_col in preds.columns and "total_goals" in preds.columns:
                over_pred = preds[over_col].dropna().values
                over_actual = (preds.loc[preds[over_col].notna(), "total_goals"] > float(line)).astype(int).values
                if len(over_pred) > 0:
                    ece_over = expected_calibration_error(over_pred, over_actual)
                    eval_results[model_name][f"ece_over_{line}"] = ece_over
                    print(f"  ECE (Over {line}): {ece_over:.4f}")

                    if args.plots:
                        try:
                            plot_calibration(
                                over_pred, over_actual,
                                title=f"Calibration: {model_name} (Over {line})",
                                save_path=str(out_dir / f"calibration_{model_name}_over_{line}.png"),
                            )
                        except Exception:
                            pass

    # CLV analysis
    print("\n=== CLV ANALYSIS ===")
    for clv_file in bt_dir.glob("clv_*.csv"):
        model_name = clv_file.stem.replace("clv_", "")
        clv_df = pd.read_csv(clv_file)
        stats = clv_summary(clv_df)
        print(f"\n--- {model_name} ---")
        for k, v in stats.items():
            if isinstance(v, float):
                print(f"  {k}: {v:.4f}")
            else:
                print(f"  {k}: {v}")
        eval_results.setdefault(model_name, {})["clv"] = stats

    # ROI comparison chart
    if args.plots and "roi" in metrics_df.columns:
        try:
            import matplotlib.pyplot as plt
            fig, ax = plt.subplots(figsize=(10, 6))
            models = metrics_df["model"].values
            rois = metrics_df["roi"].values

            colors = ["green" if r > 0 else "red" for r in rois]
            ax.bar(models, rois * 100, color=colors, alpha=0.7)
            ax.set_ylabel("ROI (%)")
            ax.set_title("ROI by Model")
            ax.axhline(y=0, color="black", linestyle="-", linewidth=0.5)

            fig.savefig(str(out_dir / "roi_comparison.png"), dpi=150, bbox_inches="tight")
            plt.close(fig)
            logger.info("ROI comparison chart saved")
        except Exception as e:
            logger.warning(f"Failed to generate ROI chart: {e}")

    # Bet log analysis
    print("\n=== BET LOG ANALYSIS ===")
    for log_file in bt_dir.glob("bet_log_*.csv"):
        model_name = log_file.stem.replace("bet_log_", "")
        log_df = pd.read_csv(log_file)
        if log_df.empty:
            continue

        print(f"\n--- {model_name} ---")
        print(f"  Total bets: {len(log_df)}")
        print(f"  Total staked: {log_df['stake'].sum():.2f}")
        print(f"  Total PnL: {log_df['pnl'].sum():.2f}")
        print(f"  ROI: {log_df['pnl'].sum() / log_df['stake'].sum() * 100:.2f}%")
        print(f"  Hit rate: {(log_df['pnl'] > 0).mean() * 100:.1f}%")

        if "market" in log_df.columns:
            for market_type in ["1x2", "total"]:
                sub = log_df[log_df["market"].str.contains(market_type, case=False, na=False)]
                if len(sub) > 0:
                    print(f"  [{market_type}] Bets={len(sub)}, PnL={sub['pnl'].sum():.2f}, "
                          f"ROI={sub['pnl'].sum() / sub['stake'].sum() * 100:.2f}%")

        if args.plots and "bankroll_after" in log_df.columns:
            try:
                import matplotlib.pyplot as plt
                fig, ax = plt.subplots(figsize=(12, 5))
                ax.plot(range(len(log_df)), log_df["bankroll_after"], linewidth=1.5)
                ax.set_xlabel("Bet number")
                ax.set_ylabel("Bankroll")
                ax.set_title(f"Bankroll Over Time: {model_name}")
                ax.axhline(y=log_df["bankroll_after"].iloc[0], color="gray",
                           linestyle="--", alpha=0.5)
                fig.savefig(str(out_dir / f"bankroll_{model_name}.png"),
                            dpi=150, bbox_inches="tight")
                plt.close(fig)
            except Exception:
                pass

    save_json(eval_results, out_dir / "evaluation_results.json")
    print(f"\nEvaluation results saved to {out_dir}")


if __name__ == "__main__":
    main()
