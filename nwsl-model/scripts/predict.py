#!/usr/bin/env python3
"""Generate predictions and slate recommendations for upcoming matches.

Usage:
    python scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv
    python scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv --model champion_blended
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.betting.market_derivation import derive_all_markets
from src.betting.recommendations import evaluate_market_candidates, load_bet_selection_config
from src.betting.staking import StakingConfig, StakingEngine
from src.data.loaders import load_odds
from src.data.transforms import merge_odds_to_matches
from src.features.market_features import compute_market_probabilities, compute_totals_market_probabilities
from src.models.calibration import apply_market_calibration, summarize_projection_quality
from src.models.market_blend import MarketBlender
from src.utils.artifacts import resolve_model_artifact
from src.utils.io import load_config, load_json, load_pickle, save_csv
from src.utils.logging import setup_logging
from src.utils.math_utils import decimal_from_probability


def _load_upcoming_matches(path: str | Path) -> pd.DataFrame:
    upcoming = pd.read_csv(path)
    required = {"match_id", "match_date", "home_team", "away_team"}
    missing = required - set(upcoming.columns)
    if missing:
        raise ValueError(f"Upcoming fixtures file is missing required columns: {sorted(missing)}")

    upcoming = upcoming.copy()
    upcoming["match_id"] = upcoming["match_id"].astype(str)
    upcoming["match_date"] = pd.to_datetime(upcoming["match_date"], errors="coerce").dt.date
    if upcoming["match_date"].isna().any():
        raise ValueError("Upcoming fixtures contain invalid match_date values.")
    if "season" not in upcoming.columns:
        upcoming["season"] = pd.to_datetime(upcoming["match_date"]).dt.year
    return upcoming


def _match_odds_rows(odds: pd.DataFrame | None, match_id: str) -> pd.DataFrame:
    if odds is None or odds.empty:
        return pd.DataFrame()

    rows = odds[odds["match_id"].astype(str) == str(match_id)].copy()
    if rows.empty:
        return rows
    if "source_type" not in rows.columns:
        return rows

    rows["source_type"] = rows["source_type"].astype(str).str.lower()
    current_rows = rows[rows["source_type"] == "current"].copy()
    if not current_rows.empty:
        return current_rows
    close_rows = rows[rows["source_type"] == "close"].copy()
    if not close_rows.empty:
        return close_rows
    return rows


def _load_calibration_artifact(artifact: dict[str, object]) -> dict[str, object] | None:
    calibration_path = Path(artifact["version_dir"]) / "calibration_artifacts.json"
    if not calibration_path.exists():
        return None
    payload = load_json(calibration_path)
    evaluation_model = str(artifact.get("evaluation_model", artifact["model_family"]))
    return payload.get("models", {}).get(evaluation_model)


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict NWSL match outcomes")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--matches", type=str, required=True, help="Path to upcoming matches CSV")
    parser.add_argument("--model", type=str, default="champion_pure")
    parser.add_argument("--model-dir", type=str, default="data/processed/models")
    parser.add_argument("--output", type=str, default="data/processed/predictions.csv")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.predict")

    model_dir = Path(args.model_dir)
    try:
        artifact = resolve_model_artifact(args.model, model_dir)
    except FileNotFoundError as exc:
        logger.error(str(exc))
        sys.exit(1)

    model_path = artifact["version_dir"] / f"{artifact['model_family']}_model.pkl"
    model = load_pickle(model_path)
    logger.info(f"Loaded model from {model_path}")

    ratings_path = artifact["version_dir"] / "team_ratings.pkl"
    ratings_model = load_pickle(ratings_path) if ratings_path.exists() else None
    context_provider_path = artifact["version_dir"] / "context_provider.pkl"
    context_provider = load_pickle(context_provider_path) if context_provider_path.exists() else None
    calibration_artifact = _load_calibration_artifact(artifact)

    upcoming = _load_upcoming_matches(args.matches)
    logger.info(f"Predicting {len(upcoming)} matches")

    data_cfg = config.get("data", {})
    odds_path = Path(str(data_cfg.get("odds_path", "")).strip())
    odds = load_odds(odds_path) if odds_path and odds_path.exists() and odds_path.is_file() else None
    consensus_source = "close"
    if odds is not None and not odds.empty and "source_type" in odds.columns:
        source_types = odds["source_type"].astype(str).str.lower()
        if (source_types == "current").any():
            consensus_source = "current"
    if odds is not None:
        upcoming = merge_odds_to_matches(upcoming, odds, source_type=consensus_source)
        upcoming = compute_market_probabilities(upcoming)
        upcoming = compute_totals_market_probabilities(upcoming)

    blend_cfg = config.get("market_blend", {})
    blender = MarketBlender(
        alpha=blend_cfg.get("alpha", 0.5),
        alpha_schedule=blend_cfg.get("alpha_schedule"),
        alpha_schedule_enabled=blend_cfg.get("alpha_schedule_enabled", False),
        devig_method=blend_cfg.get("devig_method", "multiplicative"),
    )

    bet_cfg = config.get("betting", {})
    staker = StakingEngine(
        StakingConfig(
            min_edge=bet_cfg.get("min_edge", 0.02),
            kelly_fraction=bet_cfg.get("kelly_fraction", 0.25),
            max_stake_pct=bet_cfg.get("max_stake_pct", 0.0025),
            max_slate_exposure_pct=bet_cfg.get("max_slate_exposure_pct", 0.01),
            bankroll=bet_cfg.get("starting_bankroll", 10000.0),
        )
    )
    selection = load_bet_selection_config(config)

    predictions = []
    now = datetime.now(UTC)

    for _, row in upcoming.iterrows():
        contextual_features = (
            context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row.get("match_date"),
            )
            if context_provider is not None
            else None
        )
        pred = model.predict_score_matrix(
            home_team=row["home_team"],
            away_team=row["away_team"],
            contextual_features=contextual_features,
        )
        pred.match_id = str(row["match_id"])
        markets = derive_all_markets(pred.score_matrix, match_id=pred.match_id)

        market_odds_1x2 = None
        if all(column in row.index for column in ["home_odds", "draw_odds", "away_odds"]):
            h_o, d_o, a_o = row.get("home_odds"), row.get("draw_odds"), row.get("away_odds")
            if not any(pd.isna(value) for value in [h_o, d_o, a_o]):
                market_odds_1x2 = (float(h_o), float(d_o), float(a_o))

        if artifact.get("blended", False) and market_odds_1x2:
            matches_played = 999
            if ratings_model is not None:
                matches_played = min(
                    ratings_model.get_rating(row["home_team"]).n_matches,
                    ratings_model.get_rating(row["away_team"]).n_matches,
                )
            blended_probs = blender.blend_1x2(
                (pred.home_win_prob, pred.draw_prob, pred.away_win_prob),
                market_odds_1x2,
                matches_played=matches_played,
            )
            pred.home_win_prob, pred.draw_prob, pred.away_win_prob = blended_probs
            pred.score_matrix = blender.blend_score_matrix(pred.score_matrix, market_odds_1x2, matches_played)
            markets = derive_all_markets(pred.score_matrix, match_id=pred.match_id)

        if calibration_artifact:
            markets = apply_market_calibration(markets, calibration_artifact)
            pred.home_win_prob = markets.home_prob
            pred.draw_prob = markets.draw_prob
            pred.away_win_prob = markets.away_prob

        projection_quality = summarize_projection_quality(
            markets.home_prob,
            markets.draw_prob,
            markets.away_prob,
            contextual_features=contextual_features,
            calibration_applied=bool(calibration_artifact),
        )

        odds_rows = _match_odds_rows(odds, str(row["match_id"]))
        decisions = evaluate_market_candidates(
            match_id=str(row["match_id"]),
            slate_key=str(row["match_date"]),
            odds_rows=odds_rows,
            markets=markets,
            staker=staker,
            selection=selection,
            now=now,
            model_version=artifact["version"],
            model_family=artifact["model_family"],
            blended=bool(artifact.get("blended", False)),
            gating_status=str(artifact.get("gating_status", "unknown")),
        )
        accepted = [decision for decision in decisions if decision.accepted]
        rejected = [decision for decision in decisions if not decision.accepted]

        pred_row = {
            "match_id": row["match_id"],
            "match_date": row["match_date"],
            "timestamp": now.isoformat(),
            "model": args.model,
            "model_version": artifact["version"],
            "model_family": artifact["model_family"],
            "blended": bool(artifact.get("blended", False)),
            "gating_status": artifact.get("gating_status", "unknown"),
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "lambda_home": pred.lambda_home,
            "lambda_away": pred.lambda_away,
            "prob_home": markets.home_prob,
            "prob_draw": markets.draw_prob,
            "prob_away": markets.away_prob,
            "fair_odds_home": decimal_from_probability(markets.home_prob),
            "fair_odds_draw": decimal_from_probability(markets.draw_prob),
            "fair_odds_away": decimal_from_probability(markets.away_prob),
            "btts_yes_prob": markets.btts_yes_prob,
            "calibration_applied": bool(calibration_artifact),
            "confidence_score": projection_quality["confidence_score"],
            "confidence_band": projection_quality["confidence_band"],
            "data_quality_score": projection_quality["data_quality_score"],
            "data_quality_band": projection_quality["data_quality_band"],
            "projection_uncertainty": projection_quality["uncertainty"],
            "projection_notes": "; ".join(projection_quality["notes"]) if projection_quality["notes"] else "none",
            "candidate_bet_count": len(decisions),
            "accepted_bet_count": len(accepted),
            "recommended_bets": (
                "; ".join(
                    f"{decision.market}@{decision.market_price:.2f}(edge={decision.edge:.3f},stake={decision.stake:.1f})"
                    for decision in accepted
                )
                if accepted
                else "none"
            ),
            "rejected_bet_reasons": (
                "; ".join(sorted({decision.reason for decision in rejected}))
                if rejected
                else "none"
            ),
        }

        for line in [1.5, 2.5, 3.5, 4.5]:
            if line in markets.over_probs:
                pred_row[f"prob_over_{line}"] = markets.over_probs[line]
                pred_row[f"prob_under_{line}"] = markets.under_probs[line]
                pred_row[f"fair_over_{line}"] = markets.over_fair_odds[line]
                pred_row[f"fair_under_{line}"] = markets.under_fair_odds[line]

        if market_odds_1x2:
            pred_row["mkt_home_odds"] = market_odds_1x2[0]
            pred_row["mkt_draw_odds"] = market_odds_1x2[1]
            pred_row["mkt_away_odds"] = market_odds_1x2[2]

        total_line = row.get("total_line")
        if total_line is not None and not pd.isna(total_line):
            total_line = float(total_line)
            pred_row["main_total_line"] = total_line
            pred_row["mkt_over_odds"] = row.get("over_odds")
            pred_row["mkt_under_odds"] = row.get("under_odds")
            if total_line in markets.over_probs:
                pred_row["prob_over_main_total"] = markets.over_probs[total_line]
                pred_row["prob_under_main_total"] = markets.under_probs[total_line]
                pred_row["fair_over_main_total"] = markets.over_fair_odds[total_line]
                pred_row["fair_under_main_total"] = markets.under_fair_odds[total_line]

        predictions.append(pred_row)

    output_df = pd.DataFrame(predictions)
    save_csv(output_df, args.output)
    logger.info(f"Predictions saved to {args.output}")

    print(f"\nPredictions for {len(predictions)} matches:")
    for prediction in predictions:
        print(
            f"  {prediction['home_team']:20s} vs {prediction['away_team']:20s} | "
            f"H={prediction['prob_home']:.2%} D={prediction['prob_draw']:.2%} A={prediction['prob_away']:.2%} | "
            f"Bets: {prediction['recommended_bets']}"
        )


if __name__ == "__main__":
    main()
