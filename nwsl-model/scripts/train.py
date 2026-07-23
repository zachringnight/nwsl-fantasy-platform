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

from src.data.dataset_builder import build_dataset, write_dataset
from src.data.loaders import NWSLDataset
from src.data.transforms import encode_teams, melt_to_team_match, merge_odds_to_matches
from src.data.validation import run_all_validations
from src.features.context import (
    ContextualFeatureProvider,
    build_contextual_training_frame,
    select_model_contextual_columns,
)
from src.features.match_features import compute_rolling_form, compute_season_stats
from src.features.roster_continuity import compute_roster_continuity
from src.models.bivariate_poisson import BivariatePoissonConfig, BivariatePoissonModel
from src.models.dixon_coles import DixonColesConfig, DixonColesModel
from src.models.lineup_adjustment import LineupAdjustmentModel
from src.models.team_ratings import TeamRatingsConfig, TeamRatingsModel
from src.odds.quality import build_odds_quality_report
from src.utils.artifacts import create_version_dir, write_artifact_json
from src.utils.io import load_config, load_json, save_json, save_pickle
from src.utils.logging import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NWSL betting model")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--model", type=str, default="all",
                        choices=["dixon_coles", "bivariate_poisson", "all"])
    parser.add_argument("--output-dir", type=str, default="data/processed/models")
    parser.add_argument("--version", type=str, default="")
    parser.add_argument(
        "--build-dataset",
        action="store_true",
        help="Regenerate data/raw inputs from the repo archives before training",
    )
    parser.add_argument(
        "--fetch-asa",
        action="store_true",
        help="Fetch fresh ASA analytics when rebuilding raw datasets",
    )
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.train")

    data_cfg = config.get("data", {})
    matches_path = Path(data_cfg.get("matches_path", "data/raw/matches.csv"))
    if args.build_dataset or not matches_path.exists():
        logger.info("Building deterministic raw datasets...")
        dataset_outputs = build_dataset(
            repo_root=Path(__file__).resolve().parents[2],
            fetch_asa=args.fetch_asa,
            history_start_season=data_cfg.get("history_start_season"),
        )
        write_dataset(dataset_outputs)

    logger.info("Loading data...")
    dataset = NWSLDataset.from_config(config)

    # Validate and prepare matches
    matches = run_all_validations(dataset.matches)

    if dataset.has_odds:
        matches = merge_odds_to_matches(matches, dataset.odds)
    roster_continuity = compute_roster_continuity(
        dataset.player_season_priors,
        target_seasons=matches["season"].dropna().astype(int).unique().tolist()
        if "season" in matches.columns and matches["season"].notna().any()
        else None,
    )

    # Team ratings
    base_prepared_matches, contextual_cols = build_contextual_training_frame(
        matches,
        appearances=dataset.appearances,
        projected_lineups=None,
        team_season_priors=dataset.team_season_priors,
        player_season_priors=dataset.player_season_priors,
        lineup_model=None,
        rolling_windows=config.get("features", {}).get("rolling_windows", [3, 5, 10]),
        short_rest_days=config.get("features", {}).get("short_rest_days", 4),
    )

    team_matches = melt_to_team_match(base_prepared_matches)
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
        lineup_model.fit(dataset.appearances, base_prepared_matches)

    prepared_matches, contextual_cols = build_contextual_training_frame(
        matches,
        appearances=dataset.appearances,
        projected_lineups=dataset.projected_lineups,
        team_season_priors=dataset.team_season_priors,
        player_season_priors=dataset.player_season_priors,
        lineup_model=lineup_model,
        rolling_windows=config.get("features", {}).get("rolling_windows", [3, 5, 10]),
        short_rest_days=config.get("features", {}).get("short_rest_days", 4),
    )
    model_contextual_cols = select_model_contextual_columns(contextual_cols)

    # Compute recency weights
    reference_date = prepared_matches["match_date"].max()
    days_since = np.array([
        (reference_date - d).days for d in prepared_matches["match_date"]
    ], dtype=np.float64)
    weights = np.exp(-days_since * math.log(2) / ratings_cfg.get("half_life_days", 90))

    # Encode teams
    _, team_map = encode_teams(prepared_matches)

    output_dir = create_version_dir(args.version or None, Path(args.output_dir))

    models_to_train = (
        ["dixon_coles", "bivariate_poisson"] if args.model == "all"
        else [args.model]
    )

    model_cfg = config.get("model", {})
    max_goals = model_cfg.get("max_goals", 8)
    dataset_manifest = {}
    raw_data_dir = Path(data_cfg.get("output_dir", "data/processed")).parent / "raw"
    manifest_path = raw_data_dir / "dataset_manifest.json"
    if manifest_path.exists():
        dataset_manifest = load_json(manifest_path)
    odds_for_quality = dataset.odds if dataset.has_odds else None
    odds_path_value = data_cfg.get("odds_path", "")
    odds_path = Path(odds_path_value)
    if str(odds_path_value).strip() and odds_path.exists():
        raw_odds = pd.read_csv(odds_path)
        if "source_type" in raw_odds.columns:
            current_odds = raw_odds[
                raw_odds["source_type"].astype(str).str.lower() == "current"
            ].copy()
            if not current_odds.empty:
                quality_parts = []
                if odds_for_quality is not None and not odds_for_quality.empty:
                    quality_parts.append(odds_for_quality)
                quality_parts.append(current_odds)
                odds_for_quality = pd.concat(quality_parts, ignore_index=True).drop_duplicates()
    odds_quality_report = build_odds_quality_report(
        matches,
        odds_for_quality,
    )
    training_summary = {
        "version": output_dir.name,
        "models": {},
        "n_matches": len(prepared_matches),
        "n_teams": len(team_map),
        "history_start_season": data_cfg.get("history_start_season"),
        "contextual_columns": contextual_cols,
        "model_contextual_columns": model_contextual_cols,
        "feature_policy": {
            "team_season_priors": "previous_available_season",
            "team_season_prior_weighting": "roster_continuity_scaled_and_decayed_by_current_season_matches",
            "player_season_priors": "last_season_only_projection_fallback",
            "lineup_features": "observed_appearances_and_projected_lineups_only",
            "score_model_contextual_profile": "pure_projection_v1",
        },
        "feature_inclusion_decisions": {
            "travel_features": "disabled",
            "weather_features": "disabled",
            "surface_features": "disabled",
            "training_window": f"{data_cfg.get('history_start_season')}+" if data_cfg.get("history_start_season") is not None else "all_available",
        },
        "dataset_manifest": dataset_manifest,
        "odds_quality": odds_quality_report,
        "roster_continuity": {
            "enabled": not roster_continuity.empty,
            "rows": int(len(roster_continuity)),
            "season_coverage": sorted(
                roster_continuity["season"].dropna().astype(int).unique().tolist()
            ) if not roster_continuity.empty and "season" in roster_continuity.columns else [],
            "mean_score": float(roster_continuity["roster_continuity_score"].mean())
            if not roster_continuity.empty else None,
            "min_score": float(roster_continuity["roster_continuity_score"].min())
            if not roster_continuity.empty else None,
        },
    }

    for model_name in models_to_train:
        logger.info(f"Training {model_name}...")

        if model_name == "dixon_coles":
            dc_cfg = config.get("dixon_coles", {})
            model = DixonColesModel(DixonColesConfig(
                max_goals=max_goals,
                home_advantage_init=dc_cfg.get("home_advantage_init", 0.25),
                home_advantage_scale=dc_cfg.get("home_advantage_scale", 1.0),
                home_advantage_cap=dc_cfg.get("home_advantage_cap"),
                max_iter=dc_cfg.get("max_iter", 2000),
                tol=dc_cfg.get("tol", 1e-8),
                rho_init=dc_cfg.get("rho_init", -0.05),
                rho_bounds=tuple(dc_cfg.get("rho_bounds", [-0.5, 0.5])),
                regularization=dc_cfg.get("regularization", 0.001),
                contextual_regularization=dc_cfg.get("contextual_regularization", 0.01),
                rho_regularization=dc_cfg.get("rho_regularization", 0.002),
            ))
        elif model_name == "bivariate_poisson":
            bp_cfg = config.get("bivariate_poisson", {})
            model = BivariatePoissonModel(BivariatePoissonConfig(
                max_goals=max_goals,
                home_advantage_init=bp_cfg.get("home_advantage_init", 0.25),
                home_advantage_scale=bp_cfg.get("home_advantage_scale", 1.0),
                home_advantage_cap=bp_cfg.get("home_advantage_cap"),
                max_iter=bp_cfg.get("max_iter", 2000),
                tol=bp_cfg.get("tol", 1e-8),
                lambda3_init=bp_cfg.get("lambda3_init", 0.1),
                lambda3_bounds=tuple(bp_cfg.get("lambda3_bounds", [0.001, 2.0])),
                regularization=bp_cfg.get("regularization", 0.001),
                contextual_regularization=bp_cfg.get("contextual_regularization", 0.01),
                lambda3_regularization=bp_cfg.get("lambda3_regularization", 0.002),
            ))
        else:
            logger.error(f"Unknown model: {model_name}")
            continue

        fit_result = model.fit(
            prepared_matches,
            weights=weights,
            contextual_cols=model_contextual_cols,
        )

        # Save model
        save_pickle(model, output_dir / f"{model_name}_model.pkl")
        save_json(model.get_parameters(), output_dir / f"{model_name}_params.json")

        training_summary["models"][model_name] = {
            "converged": fit_result.converged,
            "log_likelihood": fit_result.log_likelihood,
            "n_teams": fit_result.n_teams,
            "parameters": fit_result.parameters,
            "warnings": fit_result.warnings,
            "diagnostics": fit_result.diagnostics,
        }
        logger.info(
            f"{model_name} training complete: converged={fit_result.converged}, "
            f"grad_norm={fit_result.diagnostics.get('grad_norm', 'n/a')}"
        )

    # Save team ratings
    save_pickle(ratings_model, output_dir / "team_ratings.pkl")
    ratings_model.to_dataframe().to_csv(output_dir / "team_ratings.csv", index=False)
    if not roster_continuity.empty:
        roster_continuity.to_csv(output_dir / "roster_continuity.csv", index=False)

    # Save lineup model if fitted
    if lineup_model is not None:
        save_pickle(lineup_model, output_dir / "lineup_model.pkl")
        lineup_model.to_dataframe().to_csv(output_dir / "player_ratings.csv", index=False)

    context_provider = (
        ContextualFeatureProvider.from_training_frame(
            prepared_matches,
            short_rest_days=config.get("features", {}).get("short_rest_days", 4),
        )
        .attach_projected_lineups(
            dataset.projected_lineups,
            lineup_model=lineup_model,
            player_season_priors=dataset.player_season_priors,
        )
    )
    save_pickle(context_provider, output_dir / "context_provider.pkl")

    # Save training summary
    save_json(training_summary, output_dir / "training_summary.json")
    write_artifact_json(output_dir, "config_snapshot.json", config)
    if dataset_manifest:
        write_artifact_json(output_dir, "dataset_manifest.json", dataset_manifest)
    if odds_quality_report:
        write_artifact_json(output_dir, "odds_quality_report.json", odds_quality_report)

    logger.info(f"Training complete. Artifacts saved to {output_dir}")


if __name__ == "__main__":
    main()
