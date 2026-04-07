#!/usr/bin/env python3
"""Run expanding-window backtest on historical NWSL data.

Usage:
    python scripts/backtest.py --config configs/default.yaml
    python scripts/backtest.py --config configs/default.yaml --models dixon_coles bivariate_poisson
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.reports import generate_backtest_report, print_summary
from src.backtest.runner import BacktestRunner
from src.data.dataset_builder import build_dataset, write_dataset
from src.data.loaders import NWSLDataset
from src.utils.artifacts import resolve_version_dir, write_artifact_json
from src.utils.io import load_config
from src.utils.logging import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest NWSL betting model")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument(
        "--models", nargs="+",
        default=["dixon_coles", "bivariate_poisson"],
        help="Models to evaluate",
    )
    parser.add_argument("--artifact-root", type=str, default="data/processed/models")
    parser.add_argument("--output-dir", type=str, default="")
    parser.add_argument("--version", type=str, default="")
    parser.add_argument("--build-dataset", action="store_true")
    parser.add_argument(
        "--fetch-asa",
        action="store_true",
        help="Fetch fresh ASA analytics when rebuilding raw datasets",
    )
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.backtest")

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

    logger.info(f"Running backtest with models: {args.models}")
    runner = BacktestRunner(config)
    results = runner.run(
        matches=dataset.matches,
        odds=dataset.odds,
        appearances=dataset.appearances,
        projected_lineups=dataset.projected_lineups,
        team_season_priors=dataset.team_season_priors,
        player_season_priors=dataset.player_season_priors,
        models_to_run=args.models,
    )

    # Generate reports
    closing_odds = None
    if dataset.has_odds:
        closing_odds = dataset.odds[
            dataset.odds.get("source_type", pd.Series(dtype=str)).str.lower() == "close"
        ] if "source_type" in dataset.odds.columns else dataset.odds

    version_dir = resolve_version_dir(args.version or None, Path(args.artifact_root))
    output_dir = Path(args.output_dir) if args.output_dir else version_dir / "backtest"
    summary = generate_backtest_report(results, str(output_dir), closing_odds)
    write_artifact_json(
        version_dir,
        "backtest_summary.json",
        {
            "version": version_dir.name,
            "models": {
                model_name: result["metrics"]
                for model_name, result in results.items()
            },
            "report_summary": summary,
        },
    )
    print_summary(results)

    logger.info("Backtest complete.")


if __name__ == "__main__":
    main()
