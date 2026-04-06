#!/usr/bin/env python3
"""Export model outputs as JSON files consumable by the Next.js analytics UI.

Run after train.py and predict.py to generate web-ready JSON:
    python scripts/export_web.py --config configs/default.yaml

Outputs to data/processed/web/:
    predictions.json     - Upcoming match predictions with score matrices
    team-ratings.json    - Attack/defense ratings per team
    backtest-summary.json - Model accuracy metrics
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.utils.io import load_config, load_pickle
from src.utils.logging import setup_logging


def numpy_serializer(obj):
    """JSON serializer for numpy types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return round(float(obj), 6)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def export_predictions(model_dir: Path, output_dir: Path, config: dict) -> None:
    """Export predictions to web-ready JSON."""
    predictions_path = model_dir / "predictions.csv"
    if not predictions_path.exists():
        logging.warning(f"No predictions found at {predictions_path}. Run predict.py first.")
        return

    df = pd.read_csv(predictions_path)
    predictions = []

    for _, row in df.iterrows():
        pred = {
            "matchId": str(row.get("match_id", "")),
            "date": str(row.get("match_date", "")),
            "homeTeam": row.get("home_team", ""),
            "awayTeam": row.get("away_team", ""),
            "homeProb": round(float(row.get("prob_home", 0)), 4),
            "drawProb": round(float(row.get("prob_draw", 0)), 4),
            "awayProb": round(float(row.get("prob_away", 0)), 4),
            "lambdaHome": round(float(row.get("lambda_home", 0)), 3),
            "lambdaAway": round(float(row.get("lambda_away", 0)), 3),
            "bttsYesProb": round(float(row.get("btts_yes_prob", 0)), 4),
            "model": row.get("model", "dixon_coles"),
            "timestamp": str(row.get("timestamp", "")),
        }

        # Over/Under lines
        ou = {}
        for line in ["1.5", "2.5", "3.5", "4.5"]:
            over_col = f"prob_over_{line}"
            under_col = f"prob_under_{line}"
            if over_col in row and under_col in row:
                ou[line] = {
                    "over": round(float(row[over_col]), 4),
                    "under": round(float(row[under_col]), 4),
                }
        pred["overUnder"] = ou

        predictions.append(pred)

    output_file = output_dir / "predictions.json"
    with open(output_file, "w") as f:
        json.dump(predictions, f, indent=2, default=numpy_serializer)
    logging.info(f"Exported {len(predictions)} predictions to {output_file}")


def export_team_ratings(model_dir: Path, output_dir: Path) -> None:
    """Export team ratings to web-ready JSON."""
    ratings_path = model_dir / "team_ratings.pkl"
    if not ratings_path.exists():
        logging.warning(f"No team ratings found at {ratings_path}.")
        return

    ratings_model = load_pickle(ratings_path)
    ratings = []

    for team_name in sorted(ratings_model._team_ratings.keys()):
        rating = ratings_model.get_rating(team_name)
        ratings.append({
            "team": team_name,
            "attackRating": round(float(rating.attack), 3),
            "defenseRating": round(float(rating.defense), 3),
            "overallRating": round(float((rating.attack + rating.defense) / 2), 3),
            "nMatches": int(rating.n_matches),
        })

    ratings.sort(key=lambda r: r["overallRating"], reverse=True)
    for i, r in enumerate(ratings):
        r["currentRank"] = i + 1

    output_file = output_dir / "team-ratings.json"
    with open(output_file, "w") as f:
        json.dump(ratings, f, indent=2, default=numpy_serializer)
    logging.info(f"Exported {len(ratings)} team ratings to {output_file}")


def export_backtest_summary(model_dir: Path, output_dir: Path) -> None:
    """Export backtest metrics summary to web-ready JSON."""
    backtest_dir = model_dir.parent / "backtest"
    metrics_path = backtest_dir / "aggregate_metrics.csv"

    if not metrics_path.exists():
        logging.warning(f"No backtest metrics at {metrics_path}. Run backtest.py first.")
        return

    df = pd.read_csv(metrics_path)
    summary = {}

    for _, row in df.iterrows():
        model_name = row.get("model", "unknown")
        summary[model_name] = {
            "logLoss": round(float(row.get("log_loss", 0)), 4),
            "brierScore": round(float(row.get("brier_score", 0)), 4),
            "calibrationError": round(float(row.get("calibration_error", 0)), 4),
            "roi": round(float(row.get("roi", 0)), 4),
            "hitRate": round(float(row.get("hit_rate", 0)), 4),
            "totalPredictions": int(row.get("n_predictions", 0)),
        }

    output_file = output_dir / "backtest-summary.json"
    with open(output_file, "w") as f:
        json.dump(summary, f, indent=2, default=numpy_serializer)
    logging.info(f"Exported backtest summary to {output_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export model outputs for web UI")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--model-dir", type=str, default="data/processed/models")
    parser.add_argument("--output-dir", type=str, default="data/processed/web")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))

    model_dir = Path(args.model_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logging.info(f"Exporting model outputs to {output_dir}")

    export_predictions(model_dir, output_dir, config)
    export_team_ratings(model_dir, output_dir)
    export_backtest_summary(model_dir, output_dir)

    logging.info("Web export complete.")


if __name__ == "__main__":
    main()
