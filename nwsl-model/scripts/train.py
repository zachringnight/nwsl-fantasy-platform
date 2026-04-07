#!/usr/bin/env python3
"""Train NWSL score prediction models from historical data.

Usage:
    python scripts/train.py --config configs/default.yaml
    python scripts/train.py --config configs/default.yaml --model dixon_coles
    python scripts/train.py --config configs/default.yaml --model bivariate_poisson
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loaders import NWSLDataset
from src.data.transforms import (
    add_npxg_fallback,
    add_result_columns,
    encode_teams,
    melt_to_team_match,
    merge_odds_to_matches,
)
from src.data.validation import run_all_validations
from src.features.match_features import compute_rolling_form, compute_season_stats
from src.features.schedule_features import add_short_rest_flags, compute_rest_days
from src.models.bivariate_poisson import BivariatePoissonConfig, BivariatePoissonModel
from src.models.dixon_coles import DixonColesConfig, DixonColesModel
from src.models.lineup_adjustment import LineupAdjustmentModel
from src.models.team_ratings import TeamRatingsConfig, TeamRatingsModel
from src.utils.io import load_config, save_json, save_pickle
from src.utils.logging import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NWSL betting model")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--model", type=str, default="all",
                        choices=["dixon_coles", "bivariate_poisson", "all"])
    parser.add_argument("--output-dir", type=str, default="data/processed/models")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.train")

    logger.info("Loading data...")
    dataset = NWSLDataset.from_config(config)

    # Validate and prepare matches
    matches = run_all_validations(dataset.matches)
    matches = add_result_columns(matches)
    matches = add_npxg_fallback(matches)
    matches = compute_rest_days(matches)
    matches = add_short_rest_flags(matches, config.get("features", {}).get("short_rest_days", 4))

    if dataset.has_odds:
        matches = merge_odds_to_matches(matches, dataset.odds)

    # Team ratings
    team_matches = melt_to_team_match(matches)
    team_matches = compute_rolling_form(
        team_matches, config.get("features", {}).get("rolling_windows", [3, 5, 10])
    )
    team_matches = compute_season_stats(team_matches)

    ratings_cfg = config.get("team_ratings", {})
    ratings_model = TeamRatingsModel(TeamRatingsConfig(
        half_life_days=ratings_cfg.get("half_life_days", 90),
        prior_weight=ratings_cfg.get("prior_weight", 5.0),
        season_carryover=ratings_cfg.get("season_carryover", 0.6),
    ))
    ratings = ratings_model.fit(team_matches)

    # Lineup adjustment (if data available)
    lineup_model = None
    if dataset.has_appearances:
        la_cfg = config.get("lineup_adjustment", {})
        lineup_model = LineupAdjustmentModel(
            ridge_alpha=la_cfg.get("ridge_alpha", 100.0),
            min_minutes=la_cfg.get("min_minutes", 200),
            split_attack_defense=la_cfg.get("split_attack_defense", True),
        )
        lineup_model.fit(dataset.appearances, matches)

    # Compute recency weights
    reference_date = matches["match_date"].max()
    days_since = np.array([
        (reference_date - d).days for d in matches["match_date"]
    ], dtype=np.float64)
    weights = np.exp(-days_since * math.log(2) / ratings_cfg.get("half_life_days", 90))

    # Encode teams
    matches_encoded, team_map = encode_teams(matches)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    models_to_train = (
        ["dixon_coles", "bivariate_poisson"] if args.model == "all"
        else [args.model]
    )

    model_cfg = config.get("model", {})
    max_goals = model_cfg.get("max_goals", 8)
    training_summary = {"models": {}, "n_matches": len(matches), "n_teams": len(team_map)}

    for model_name in models_to_train:
        logger.info(f"Training {model_name}...")

        if model_name == "dixon_coles":
            dc_cfg = config.get("dixon_coles", {})
            model = DixonColesModel(DixonColesConfig(
                max_goals=max_goals,
                home_advantage_init=dc_cfg.get("home_advantage_init", 0.25),
                max_iter=dc_cfg.get("max_iter", 2000),
                tol=dc_cfg.get("tol", 1e-8),
                rho_init=dc_cfg.get("rho_init", -0.05),
                rho_bounds=tuple(dc_cfg.get("rho_bounds", [-0.5, 0.5])),
            ))
        elif model_name == "bivariate_poisson":
            bp_cfg = config.get("bivariate_poisson", {})
            model = BivariatePoissonModel(BivariatePoissonConfig(
                max_goals=max_goals,
                home_advantage_init=bp_cfg.get("home_advantage_init", 0.25),
                max_iter=bp_cfg.get("max_iter", 2000),
                tol=bp_cfg.get("tol", 1e-8),
                lambda3_init=bp_cfg.get("lambda3_init", 0.1),
                lambda3_bounds=tuple(bp_cfg.get("lambda3_bounds", [0.001, 2.0])),
            ))
        else:
            logger.error(f"Unknown model: {model_name}")
            continue

        fit_result = model.fit(matches, weights=weights)

        # Save model
        save_pickle(model, output_dir / f"{model_name}_model.pkl")
        save_json(model.get_parameters(), output_dir / f"{model_name}_params.json")

        training_summary["models"][model_name] = {
            "converged": fit_result.converged,
            "log_likelihood": fit_result.log_likelihood,
            "n_teams": fit_result.n_teams,
            "parameters": fit_result.parameters,
        }
        logger.info(f"{model_name} training complete: converged={fit_result.converged}")

    # Save team ratings
    save_pickle(ratings_model, output_dir / "team_ratings.pkl")
    ratings_model.to_dataframe().to_csv(output_dir / "team_ratings.csv", index=False)

    # Save lineup model if fitted
    if lineup_model is not None:
        save_pickle(lineup_model, output_dir / "lineup_model.pkl")
        lineup_model.to_dataframe().to_csv(output_dir / "player_ratings.csv", index=False)

    # Save training summary
    save_json(training_summary, output_dir / "training_summary.json")
    save_json(config, output_dir / "config_snapshot.json")

    logger.info(f"Training complete. Artifacts saved to {output_dir}")


if __name__ == "__main__":
    main()
