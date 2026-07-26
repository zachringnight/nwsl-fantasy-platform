#!/usr/bin/env python3
"""Validate one train-season-frozen betting policy and export its evidence."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.backtest.frozen_policy import validate_frozen_policy  # noqa: E402
from src.backtest.threshold_tuning import (  # noqa: E402
    DEFAULT_CONFIDENCE_GRID,
    DEFAULT_EDGE_GRID,
)
from src.utils.io import save_csv, save_json  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Freeze thresholds on one season and validate on the next"
    )
    parser.add_argument("--backtest-dir", required=True)
    parser.add_argument("--model", default="team_ratings_poisson")
    parser.add_argument("--policy-id", default="nwsl-totals-open-over-v1")
    parser.add_argument("--train-season", type=int, default=2025)
    parser.add_argument("--test-season", type=int, default=2026)
    parser.add_argument("--market-group", default="totals")
    parser.add_argument("--side", default="over")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--bootstrap-iterations", type=int, default=20_000)
    parser.add_argument("--bootstrap-seed", type=int, default=20260726)
    args = parser.parse_args()

    backtest_dir = Path(args.backtest_dir)
    decisions = pd.read_csv(
        backtest_dir / f"decision_log_{args.model}.csv",
        dtype={"match_id": str},
    )
    predictions = pd.read_csv(
        backtest_dir / f"predictions_{args.model}.csv",
        dtype={"match_id": str},
    )
    result = validate_frozen_policy(
        decisions,
        predictions,
        policy_id=args.policy_id,
        model_family=args.model,
        train_season=args.train_season,
        test_season=args.test_season,
        market_group=args.market_group,
        side=args.side,
        edge_grid=DEFAULT_EDGE_GRID,
        confidence_grid=DEFAULT_CONFIDENCE_GRID,
        bootstrap_iterations=args.bootstrap_iterations,
        bootstrap_seed=args.bootstrap_seed,
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "frozen_policy_validation.json"
    bets_path = output_dir / "frozen_policy_test_bets.csv"
    grid_path = output_dir / "frozen_policy_threshold_grid.csv"
    save_json(result.summary, summary_path)
    save_csv(result.selected_bets, bets_path)
    save_csv(result.threshold_grid, grid_path)
    print(
        f"{result.summary['policy_id']}: status={result.summary['status']} "
        f"thresholds={result.summary['thresholds']['min_edge']:.3f}/"
        f"{result.summary['thresholds']['min_confidence']:.3f} "
        f"test_bets={result.summary['test']['n_bets']} "
        f"test_roi={result.summary['test']['roi_units']:.3%} "
        f"test_clv={result.summary['test']['mean_clv']:.3%}"
    )
    print(f"Wrote {summary_path}, {bets_path}, {grid_path}")


if __name__ == "__main__":
    main()
