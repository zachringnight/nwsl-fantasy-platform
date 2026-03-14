#!/usr/bin/env python3
"""Generate predictions for upcoming matches.

Usage:
    python scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv
    python scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv --model dixon_coles
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.betting.market_derivation import derive_all_markets
from src.betting.staking import StakingConfig, StakingEngine
from src.data.loaders import load_matches, load_odds
from src.data.transforms import merge_odds_to_matches
from src.features.market_features import compute_market_probabilities
from src.models.market_blend import MarketBlender
from src.utils.io import load_config, load_pickle, save_csv, save_json
from src.utils.logging import setup_logging
from src.utils.math_utils import decimal_from_probability


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict NWSL match outcomes")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--matches", type=str, required=True,
                        help="Path to upcoming matches CSV")
    parser.add_argument("--model", type=str, default="dixon_coles",
                        choices=["dixon_coles", "bivariate_poisson"])
    parser.add_argument("--model-dir", type=str, default="data/processed/models")
    parser.add_argument("--output", type=str, default="data/processed/predictions.csv")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.predict")

    # Load model
    model_dir = Path(args.model_dir)
    model_path = model_dir / f"{args.model}_model.pkl"
    if not model_path.exists():
        logger.error(f"Model not found: {model_path}. Run train.py first.")
        sys.exit(1)

    model = load_pickle(model_path)
    logger.info(f"Loaded model from {model_path}")

    # Load team ratings
    ratings_path = model_dir / "team_ratings.pkl"
    ratings_model = load_pickle(ratings_path) if ratings_path.exists() else None

    # Load upcoming matches
    upcoming = load_matches(args.matches)
    logger.info(f"Predicting {len(upcoming)} matches")

    # Load odds if available
    data_cfg = config.get("data", {})
    odds = load_odds(data_cfg.get("odds_path", ""))
    if odds is not None:
        upcoming = merge_odds_to_matches(upcoming, odds)
        upcoming = compute_market_probabilities(upcoming)

    # Market blender
    blend_cfg = config.get("market_blend", {})
    blender = MarketBlender(
        alpha=blend_cfg.get("alpha", 0.5),
        alpha_schedule=blend_cfg.get("alpha_schedule"),
        alpha_schedule_enabled=blend_cfg.get("alpha_schedule_enabled", False),
        devig_method=blend_cfg.get("devig_method", "multiplicative"),
    )

    # Staking
    bet_cfg = config.get("betting", {})
    staker = StakingEngine(StakingConfig(
        min_edge=bet_cfg.get("min_edge", 0.02),
        kelly_fraction=bet_cfg.get("kelly_fraction", 0.25),
        max_stake_pct=bet_cfg.get("max_stake_pct", 0.01),
        bankroll=bet_cfg.get("starting_bankroll", 10000.0),
    ))

    predictions = []
    timestamp = datetime.now().isoformat()

    for _, row in upcoming.iterrows():
        pred = model.predict_score_matrix(
            home_team=row["home_team"],
            away_team=row["away_team"],
        )
        pred.match_id = str(row["match_id"])

        # Derive markets
        markets = derive_all_markets(pred.score_matrix, match_id=pred.match_id)

        # Blend with market if available
        blended_1x2 = (pred.home_win_prob, pred.draw_prob, pred.away_win_prob)
        market_odds_1x2 = None
        if all(c in row.index for c in ["home_odds", "draw_odds", "away_odds"]):
            h_o, d_o, a_o = row.get("home_odds"), row.get("draw_odds"), row.get("away_odds")
            if not any(pd.isna(x) for x in [h_o, d_o, a_o]):
                market_odds_1x2 = (h_o, d_o, a_o)
                mp = 999
                if ratings_model:
                    mp = min(
                        ratings_model.get_rating(row["home_team"]).n_matches,
                        ratings_model.get_rating(row["away_team"]).n_matches,
                    )
                blended_1x2 = blender.blend_1x2(
                    (pred.home_win_prob, pred.draw_prob, pred.away_win_prob),
                    market_odds_1x2,
                    matches_played=mp,
                )

        # Build prediction row
        pred_row = {
            "match_id": row["match_id"],
            "match_date": row["match_date"],
            "timestamp": timestamp,
            "model": args.model,
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "lambda_home": pred.lambda_home,
            "lambda_away": pred.lambda_away,
            "prob_home": blended_1x2[0],
            "prob_draw": blended_1x2[1],
            "prob_away": blended_1x2[2],
            "fair_odds_home": decimal_from_probability(blended_1x2[0]),
            "fair_odds_draw": decimal_from_probability(blended_1x2[1]),
            "fair_odds_away": decimal_from_probability(blended_1x2[2]),
            "btts_yes_prob": markets.btts_yes_prob,
        }

        # Add totals
        for line in [1.5, 2.5, 3.5, 4.5]:
            if line in markets.over_probs:
                pred_row[f"prob_over_{line}"] = markets.over_probs[line]
                pred_row[f"prob_under_{line}"] = markets.under_probs[line]
                pred_row[f"fair_over_{line}"] = markets.over_fair_odds[line]
                pred_row[f"fair_under_{line}"] = markets.under_fair_odds[line]

        # Add handicaps
        for hline in [-0.5, -1.0, 0.5, 1.0]:
            if hline in markets.ah_home_probs:
                pred_row[f"ah_home_{hline}"] = markets.ah_home_probs[hline]
                pred_row[f"ah_away_{hline}"] = markets.ah_away_probs[hline]

        # Market odds
        if market_odds_1x2:
            pred_row["mkt_home_odds"] = market_odds_1x2[0]
            pred_row["mkt_draw_odds"] = market_odds_1x2[1]
            pred_row["mkt_away_odds"] = market_odds_1x2[2]

        # Bet recommendations
        bets = []
        for side_name, prob, odds_col in [
            ("home", blended_1x2[0], "home_odds"),
            ("draw", blended_1x2[1], "draw_odds"),
            ("away", blended_1x2[2], "away_odds"),
        ]:
            mkt_odds = row.get(odds_col, np.nan)
            if not pd.isna(mkt_odds) and mkt_odds > 1.0:
                rec = staker.recommend_bet(
                    str(row["match_id"]), f"1x2_{side_name}", side_name, prob, mkt_odds
                )
                if rec:
                    bets.append(f"1x2_{side_name}@{mkt_odds:.2f}(edge={rec.edge:.3f},stake={rec.stake:.1f})")

        pred_row["recommended_bets"] = "; ".join(bets) if bets else "none"
        predictions.append(pred_row)

    output_df = pd.DataFrame(predictions)
    save_csv(output_df, args.output)
    logger.info(f"Predictions saved to {args.output}")

    # Print summary
    print(f"\nPredictions for {len(predictions)} matches:")
    for p in predictions:
        print(
            f"  {p['home_team']:20s} vs {p['away_team']:20s} | "
            f"H={p['prob_home']:.2%} D={p['prob_draw']:.2%} A={p['prob_away']:.2%} | "
            f"Bets: {p['recommended_bets']}"
        )


if __name__ == "__main__":
    main()
