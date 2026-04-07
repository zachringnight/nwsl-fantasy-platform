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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.reports import generate_backtest_report, print_summary
from src.backtest.runner import BacktestRunner
from src.data.loaders import NWSLDataset
from src.utils.io import load_config
from src.utils.logging import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest NWSL betting model")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument(
        "--models", nargs="+",
        default=["dixon_coles", "bivariate_poisson", "market_implied", "full_blend"],
        help="Models to evaluate",
    )
    parser.add_argument("--output-dir", type=str, default="data/processed/backtest")
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.backtest")

    logger.info("Loading data...")
    dataset = NWSLDataset.from_config(config)

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

    generate_backtest_report(results, args.output_dir, closing_odds)
    print_summary(results)

    logger.info("Backtest complete.")


if __name__ == "__main__":
    import pandas as pd
    main()
