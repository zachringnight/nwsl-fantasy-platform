#!/usr/bin/env python3
"""Generate a pure-projection operator report focused on forecast trust."""

from __future__ import annotations

import argparse
import logging
import math
import sys
from datetime import datetime, timedelta, timezone

UTC = timezone.utc
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import poisson

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.betting.market_derivation import derive_all_markets
from src.models.baseline import ProjectionBaselineModel
from src.models.calibration import apply_market_calibration, summarize_projection_quality
from src.odds.provider import load_official_match_reference
from src.utils.artifacts import resolve_model_artifact
from src.utils.io import load_config, load_json, load_pickle, save_csv, save_json
from src.utils.logging import setup_logging


def _build_independent_score_matrix(lambda_home: float, lambda_away: float, max_goals: int = 8) -> np.ndarray:
    goals = np.arange(max_goals + 1, dtype=np.float64)
    home_pmf = poisson.pmf(goals, max(lambda_home, 0.05))
    away_pmf = poisson.pmf(goals, max(lambda_away, 0.05))
    matrix = np.outer(home_pmf, away_pmf)
    total = matrix.sum()
    if total > 0:
        matrix /= total
    return matrix


def _team_ratings_baseline(ratings_model: object | None, home_team: str, away_team: str) -> dict[str, float]:
    if ratings_model is None:
        return {"home": 1 / 3, "draw": 1 / 3, "away": 1 / 3}
    home_rating = ratings_model.get_rating(home_team)
    away_rating = ratings_model.get_rating(away_team)
    lambda_home = 1.25 * math.exp(0.12 + home_rating.attack - away_rating.defense)
    lambda_away = 1.05 * math.exp(away_rating.attack - home_rating.defense)
    markets = derive_all_markets(_build_independent_score_matrix(lambda_home, lambda_away))
    return {"home": markets.home_prob, "draw": markets.draw_prob, "away": markets.away_prob}


def _rolling_npxg_baseline(contextual_features: dict[str, float] | None) -> dict[str, float]:
    context = contextual_features or {}
    lambda_home = max(
        (
            float(context.get("home_roll_5_npxg_for", context.get("home_season_avg_npxg_for", 1.2)))
            + float(context.get("away_roll_5_npxg_against", context.get("away_season_avg_npxg_against", 1.1)))
        )
        / 2.0,
        0.1,
    )
    lambda_away = max(
        (
            float(context.get("away_roll_5_npxg_for", context.get("away_season_avg_npxg_for", 1.0)))
            + float(context.get("home_roll_5_npxg_against", context.get("home_season_avg_npxg_against", 1.0)))
        )
        / 2.0,
        0.1,
    )
    markets = derive_all_markets(_build_independent_score_matrix(lambda_home, lambda_away))
    return {"home": markets.home_prob, "draw": markets.draw_prob, "away": markets.away_prob}


def _load_calibration_artifact(artifact: dict[str, object]) -> dict[str, object] | None:
    calibration_path = Path(artifact["version_dir"]) / "calibration_artifacts.json"
    if not calibration_path.exists():
        return None
    payload = load_json(calibration_path)
    evaluation_model = str(artifact.get("evaluation_model", artifact["model_family"]))
    return payload.get("models", {}).get(evaluation_model)


def _load_model_stack(artifact: dict[str, object]) -> tuple[object, object | None, object | None]:
    ratings_path = Path(artifact["version_dir"]) / "team_ratings.pkl"
    ratings_model = load_pickle(ratings_path) if ratings_path.exists() else None
    context_provider_path = Path(artifact["version_dir"]) / "context_provider.pkl"
    context_provider = load_pickle(context_provider_path) if context_provider_path.exists() else None

    if artifact.get("kind") == "baseline_fallback":
        model = ProjectionBaselineModel(
            strategy=str(artifact["model_family"]),
            ratings_model=ratings_model,
        )
        return model, ratings_model, context_provider

    model_path = Path(artifact["version_dir"]) / f"{artifact['model_family']}_model.pkl"
    model = load_pickle(model_path)
    return model, ratings_model, context_provider


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the pure-projection operator report")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--model", type=str, default="champion_pure")
    parser.add_argument("--model-dir", type=str, default="data/processed/models")
    parser.add_argument("--repo-root", type=str, default="")
    parser.add_argument("--days-ahead", type=int, default=None)
    parser.add_argument("--output-dir", type=str, default="")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.operator")

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]
    operator_cfg = config.get("operator", {})
    days_ahead = args.days_ahead or int(operator_cfg.get("days_ahead", 7))
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_root = Path(args.output_dir or operator_cfg.get("output_dir", "data/processed/operator"))
    run_dir = output_root / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    artifact = resolve_model_artifact(args.model, Path(args.model_dir))
    model, ratings_model, context_provider = _load_model_stack(artifact)
    calibration_artifact = _load_calibration_artifact(artifact)

    now = datetime.now(UTC)
    horizon = now + timedelta(days=days_ahead)
    match_reference = load_official_match_reference(
        repo_root=repo_root,
        include_completed=False,
        include_upcoming=True,
    )
    upcoming = match_reference[
        (pd.to_datetime(match_reference["match_datetime"], utc=True) >= now)
        & (pd.to_datetime(match_reference["match_datetime"], utc=True) <= horizon)
    ].copy()
    if upcoming.empty:
        save_json(
            {
                "run_id": run_id,
                "generated_at": now.isoformat(),
                "message": f"No upcoming NWSL fixtures found in the next {days_ahead} days.",
                "model_version": artifact["version"],
                "model_family": artifact["model_family"],
            },
            run_dir / "run_summary.json",
        )
        print(f"No upcoming fixtures found. Wrote empty report to {run_dir}")
        return

    upcoming["match_date"] = pd.to_datetime(upcoming["match_datetime"], utc=True).dt.date
    rows: list[dict[str, object]] = []
    for _, row in upcoming.sort_values("match_datetime").iterrows():
        contextual_features = (
            context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row["match_date"],
            )
            if context_provider is not None
            else None
        )
        pred = model.predict_score_matrix(
            home_team=row["home_team"],
            away_team=row["away_team"],
            contextual_features=contextual_features,
        )
        raw_markets = derive_all_markets(pred.score_matrix, match_id=str(row["match_id"]))
        calibrated_markets = apply_market_calibration(raw_markets, calibration_artifact) if calibration_artifact else raw_markets
        projection_quality = summarize_projection_quality(
            calibrated_markets.home_prob,
            calibrated_markets.draw_prob,
            calibrated_markets.away_prob,
            contextual_features=contextual_features,
            calibration_applied=bool(calibration_artifact),
        )

        team_ratings_baseline = _team_ratings_baseline(ratings_model, row["home_team"], row["away_team"])
        rolling_baseline = _rolling_npxg_baseline(contextual_features)
        max_calibration_adjustment = max(
            abs(raw_markets.home_prob - calibrated_markets.home_prob),
            abs(raw_markets.draw_prob - calibrated_markets.draw_prob),
            abs(raw_markets.away_prob - calibrated_markets.away_prob),
        )
        baseline_disagreement = max(
            abs(calibrated_markets.home_prob - team_ratings_baseline["home"]),
            abs(calibrated_markets.draw_prob - team_ratings_baseline["draw"]),
            abs(calibrated_markets.away_prob - team_ratings_baseline["away"]),
            abs(calibrated_markets.home_prob - rolling_baseline["home"]),
            abs(calibrated_markets.draw_prob - rolling_baseline["draw"]),
            abs(calibrated_markets.away_prob - rolling_baseline["away"]),
        )

        rows.append(
            {
                "match_id": row["match_id"],
                "match_datetime": pd.to_datetime(row["match_datetime"], utc=True).isoformat(),
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "prob_home": calibrated_markets.home_prob,
                "prob_draw": calibrated_markets.draw_prob,
                "prob_away": calibrated_markets.away_prob,
                "fair_odds_home": calibrated_markets.home_fair_odds,
                "fair_odds_draw": calibrated_markets.draw_fair_odds,
                "fair_odds_away": calibrated_markets.away_fair_odds,
                "confidence_score": projection_quality["confidence_score"],
                "confidence_band": projection_quality["confidence_band"],
                "data_quality_score": projection_quality["data_quality_score"],
                "data_quality_band": projection_quality["data_quality_band"],
                "projection_uncertainty": projection_quality["uncertainty"],
                "projection_notes": "; ".join(projection_quality["notes"]) if projection_quality["notes"] else "none",
                "calibration_applied": bool(calibration_artifact),
                "max_calibration_adjustment": max_calibration_adjustment,
                "team_ratings_home_prob": team_ratings_baseline["home"],
                "team_ratings_draw_prob": team_ratings_baseline["draw"],
                "team_ratings_away_prob": team_ratings_baseline["away"],
                "rolling_home_prob": rolling_baseline["home"],
                "rolling_draw_prob": rolling_baseline["draw"],
                "rolling_away_prob": rolling_baseline["away"],
                "baseline_disagreement": baseline_disagreement,
            }
        )

    report = pd.DataFrame(rows)
    highest_confidence = report.sort_values(["confidence_score", "data_quality_score"], ascending=[False, False]).head(10)
    lowest_data_quality = report.sort_values(["data_quality_score", "confidence_score"], ascending=[True, True]).head(10)
    calibration_adjustments = report.sort_values("max_calibration_adjustment", ascending=False).head(10)
    baseline_disagreements = report.sort_values("baseline_disagreement", ascending=False).head(10)

    save_csv(report, run_dir / "fixture_projection_report.csv")
    save_csv(highest_confidence, run_dir / "highest_confidence_matches.csv")
    save_csv(lowest_data_quality, run_dir / "lowest_data_quality_matches.csv")
    save_csv(calibration_adjustments, run_dir / "largest_calibration_adjustments.csv")
    save_csv(baseline_disagreements, run_dir / "largest_baseline_disagreements.csv")

    run_summary = {
        "run_id": run_id,
        "generated_at": now.isoformat(),
        "model_version": artifact["version"],
        "model_family": artifact["model_family"],
        "gating_status": artifact.get("gating_status", "unknown"),
        "fixtures": int(len(report)),
        "calibration_applied": bool(calibration_artifact),
        "top_confidence_match_ids": highest_confidence["match_id"].astype(str).tolist(),
        "lowest_data_quality_match_ids": lowest_data_quality["match_id"].astype(str).tolist(),
        "largest_baseline_disagreement_match_ids": baseline_disagreements["match_id"].astype(str).tolist(),
        "output_dir": str(run_dir),
    }
    save_json(run_summary, run_dir / "run_summary.json")

    logger.info(f"Projection operator report written to {run_dir}")
    print(f"Projection operator report written to {run_dir}")


if __name__ == "__main__":
    main()
