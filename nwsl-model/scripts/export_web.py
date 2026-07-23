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


def _coerce_metric(row: pd.Series, *names: str, default: float = 0.0) -> float:
    for name in names:
        if name in row and pd.notna(row[name]):
            return float(row[name])
    return default


def _coerce_int_value(value: object, default: int = 0) -> int:
    if value is None:
        return default
    try:
        if pd.isna(value):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _predictions_path(model_dir: Path) -> Path:
    direct_path = model_dir / "predictions.csv"
    if direct_path.exists():
        return direct_path
    processed_path = model_dir.parent / "predictions.csv"
    if model_dir.name == "models" and processed_path.exists():
        return processed_path
    return direct_path


def _version_from_predictions(predictions_path: Path) -> str | None:
    if not predictions_path.exists():
        return None
    try:
        frame = pd.read_csv(predictions_path, usecols=["model_version"])
    except (ValueError, OSError, pd.errors.EmptyDataError):
        return None
    versions = frame["model_version"].dropna().astype(str)
    if versions.empty:
        return None
    return versions.iloc[0]


def _latest_artifact_dir(models_root: Path) -> Path | None:
    if not models_root.exists():
        return None
    candidates = [
        path
        for path in models_root.iterdir()
        if path.is_dir() and (path / "training_summary.json").exists()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: (path.stat().st_mtime, path.name))


def resolve_artifact_dir(model_dir: Path) -> Path | None:
    """Resolve the versioned artifact that matches the predictions export."""
    if (model_dir / "training_summary.json").exists():
        return model_dir

    predictions_path = _predictions_path(model_dir)
    version = _version_from_predictions(predictions_path)
    search_roots = []
    if (model_dir / "models").exists():
        search_roots.append(model_dir / "models")
    if model_dir.name == "models":
        search_roots.append(model_dir)

    for root in search_roots:
        if version:
            candidate = root / version
            if candidate.exists():
                return candidate
        latest = _latest_artifact_dir(root)
        if latest is not None:
            return latest
    return None


def export_predictions(model_dir: Path, output_dir: Path, config: dict) -> None:
    """Export predictions to web-ready JSON."""
    predictions_path = _predictions_path(model_dir)
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
            "modelVersion": row.get("model_version", ""),
            "modelFamily": row.get("model_family", ""),
            "gatingStatus": row.get("gating_status", "unknown"),
            "topPickTier": row.get("top_pick_tier", "no_bet"),
            "officialPickCount": _coerce_int_value(row.get("official_pick_count", row.get("accepted_bet_count", 0))),
            "leanBetCount": _coerce_int_value(row.get("lean_bet_count", 0)),
            "actionablePickCount": _coerce_int_value(row.get("actionable_pick_count", 0)),
            "recommendedBets": row.get("recommended_bets", "none"),
            "recommendedLeans": row.get("recommended_leans", "none"),
            "actionablePicks": row.get("actionable_picks", "none"),
            "rejectedBetReasons": row.get("rejected_bet_reasons", "none"),
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
    ratings_csv_path = model_dir / "team_ratings.csv"
    if not ratings_path.exists() and not ratings_csv_path.exists():
        logging.warning(f"No team ratings found at {ratings_path} or {ratings_csv_path}.")
        return

    ratings = []
    if ratings_path.exists():
        ratings_model = load_pickle(ratings_path)
        rating_map = getattr(ratings_model, "ratings", None) or getattr(
            ratings_model,
            "_team_ratings",
            {},
        )
        for team_name in sorted(rating_map.keys()):
            rating = ratings_model.get_rating(team_name)
            ratings.append({
                "team": team_name,
                "attackRating": round(float(rating.attack), 3),
                "defenseRating": round(float(rating.defense), 3),
                "overallRating": round(float((rating.attack + rating.defense) / 2), 3),
                "nMatches": int(rating.n_matches),
            })
    else:
        frame = pd.read_csv(ratings_csv_path)
        for _, row in frame.iterrows():
            attack = float(row.get("attack_rating", 0.0))
            defense = float(row.get("defense_rating", 0.0))
            ratings.append({
                "team": row.get("team", ""),
                "attackRating": round(attack, 3),
                "defenseRating": round(defense, 3),
                "overallRating": round(float((attack + defense) / 2), 3),
                "nMatches": int(row.get("n_matches", 0)),
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
    metrics_path = model_dir / "backtest" / "metrics_comparison.csv"
    if not metrics_path.exists():
        metrics_path = model_dir.parent / "backtest" / "aggregate_metrics.csv"

    if not metrics_path.exists():
        logging.warning(f"No backtest metrics at {metrics_path}. Run backtest.py first.")
        return

    df = pd.read_csv(metrics_path)
    summary = {}

    for _, row in df.iterrows():
        model_name = row.get("model", "unknown")
        prediction_rows_path = metrics_path.parent / f"predictions_{model_name}.csv"
        total_predictions = int(_coerce_metric(row, "n_predictions", "n_matches"))
        if prediction_rows_path.exists():
            try:
                total_predictions = len(pd.read_csv(prediction_rows_path))
            except (OSError, pd.errors.EmptyDataError, pd.errors.ParserError):
                logging.warning(
                    "Could not count prediction rows at %s.",
                    prediction_rows_path,
                )
        summary[model_name] = {
            "logLoss": round(_coerce_metric(row, "log_loss_1x2", "log_loss"), 4),
            "brierScore": round(_coerce_metric(row, "brier_score_1x2", "brier_score"), 4),
            "calibrationError": round(_coerce_metric(row, "calibration_error", "ece_home_win"), 4),
            "roi": round(_coerce_metric(row, "roi"), 4),
            "hitRate": round(_coerce_metric(row, "hit_rate"), 4),
            "totalPredictions": total_predictions,
            "brierOver25": round(_coerce_metric(row, "brier_over_2_5"), 4),
            "totalGoalsMae": round(_coerce_metric(row, "expected_total_goals_mae"), 4),
        }

    output_file = output_dir / "backtest-summary.json"
    with open(output_file, "w") as f:
        json.dump(summary, f, indent=2, default=numpy_serializer)
    logging.info(f"Exported backtest summary to {output_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export model outputs for web UI")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--model-dir", type=str, default="data/processed")
    parser.add_argument("--output-dir", type=str, default="data/processed/web")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))

    model_dir = Path(args.model_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logging.info(f"Exporting model outputs to {output_dir}")

    artifact_dir = resolve_artifact_dir(model_dir)
    if artifact_dir is None:
        logging.warning(f"No versioned model artifact found from {model_dir}.")

    export_predictions(model_dir, output_dir, config)
    export_team_ratings(artifact_dir or model_dir, output_dir)
    export_backtest_summary(artifact_dir or model_dir, output_dir)

    logging.info("Web export complete.")


if __name__ == "__main__":
    main()
