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


def _build_version_backtest_summary(report_summary: dict, version_name: str) -> dict:
    """Normalize report metrics into the schema promotion gates expect."""
    metrics_rows = report_summary.get("metrics_comparison", [])
    return {
        "version": version_name,
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
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.backtest")

    logger.info("Loading data...")
    dataset = NWSLDataset.from_config(config)

    artifact_mode = bool(args.version) or args.artifact_root != "data/processed/models"
    version_dir = None
    if artifact_mode:
        version_dir = resolve_version_dir(args.version or None, Path(args.artifact_root))
    output_dir = Path(args.output_dir) if args.output_dir else (
        version_dir / "backtest" if version_dir is not None else Path("data/processed/backtest")
    )

    logger.info(f"Running backtest with models: {args.models}")
    runner = BacktestRunner(config)
    results = runner.run(
        matches=dataset.matches,
        odds=dataset.odds,
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
        write_artifact_json(
            version_dir,
            "backtest_summary.json",
            _build_version_backtest_summary(report_summary, version_dir.name),
        )
    print_summary(results)

    logger.info("Backtest complete.")


if __name__ == "__main__":
    main()
