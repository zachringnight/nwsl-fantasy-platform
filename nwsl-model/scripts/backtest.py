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
from src.data.loaders import NWSLDataset
from src.utils.artifacts import resolve_version_dir, write_artifact_json
from src.utils.io import load_config
from src.utils.logging import setup_logging


def _build_version_backtest_summary(
    report_summary: dict,
    version_name: str,
    odds_source_type: str,
) -> dict:
    """Normalize report metrics into the schema promotion gates expect."""
    metrics_rows = report_summary.get("metrics_comparison", [])
    return {
        "version": version_name,
        "odds_source_type": odds_source_type,
        "models": {
            str(row["model"]): {
                key: value
                for key, value in row.items()
                if key != "model" and pd.notna(value)
            }
            for row in metrics_rows
            if "model" in row
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest NWSL betting model")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument(
        "--models", nargs="+",
        default=None,
        help="Models to evaluate",
    )
    parser.add_argument("--output-dir", type=str, default="")
    parser.add_argument("--artifact-root", type=str, default="data/processed/models")
    parser.add_argument("--version", type=str, default="")
    parser.add_argument(
        "--odds-source-type",
        choices=("close", "open"),
        default="",
        help=(
            "Historical quote timing to evaluate. 'open' writes separate research "
            "artifacts and pairs bets with like-for-like closing prices for CLV."
        ),
    )
    args = parser.parse_args()

    config = load_config(args.config)
    if args.odds_source_type:
        config["backtest"] = {
            **(config.get("backtest", {}) or {}),
            "odds_source_type": args.odds_source_type,
        }
    odds_source_type = str(config.get("backtest", {}).get("odds_source_type", "close")).lower()
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.backtest")

    logger.info("Loading data...")
    dataset = NWSLDataset.from_config(config)

    artifact_mode = bool(args.version) or args.artifact_root != "data/processed/models"
    version_dir = None
    if artifact_mode:
        version_dir = resolve_version_dir(args.version or None, Path(args.artifact_root))
    backtest_dir_name = "backtest" if odds_source_type == "close" else f"backtest_{odds_source_type}"
    output_dir = Path(args.output_dir) if args.output_dir else (
        version_dir / backtest_dir_name
        if version_dir is not None
        else Path("data/processed") / backtest_dir_name
    )

    logger.info(
        "Running backtest with models=%s odds_source_type=%s",
        args.models,
        odds_source_type,
    )
    runner = BacktestRunner(config)
    results = runner.run(
        matches=dataset.matches,
        odds=dataset.odds,
        appearances=dataset.appearances,
        projected_lineups=dataset.projected_lineups,
        team_season_priors=dataset.team_season_priors,
        player_season_priors=dataset.player_season_priors,
        venues=dataset.venues,
        models_to_run=args.models,
    )

    # Generate reports
    closing_odds = None
    if dataset.has_odds:
        closing_odds = dataset.odds[
            dataset.odds.get("source_type", pd.Series(dtype=str)).str.lower() == "close"
        ] if "source_type" in dataset.odds.columns else dataset.odds

    report_summary = generate_backtest_report(results, str(output_dir), closing_odds)
    if version_dir is not None:
        summary_name = (
            "backtest_summary.json"
            if odds_source_type == "close"
            else f"backtest_{odds_source_type}_summary.json"
        )
        write_artifact_json(
            version_dir,
            summary_name,
            _build_version_backtest_summary(
                report_summary,
                version_dir.name,
                odds_source_type,
            ),
        )
    print_summary(results)

    logger.info("Backtest complete.")


if __name__ == "__main__":
    main()
