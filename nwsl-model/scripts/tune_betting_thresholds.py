#!/usr/bin/env python3
"""Nested chronological threshold tuning CLI.

For every model with a decision log in a run's backtest/ directory, tunes
(min_edge, min_confidence) per market group on strictly-prior history only
and evaluates the frozen selection out-of-sample block by block. Writes a
per-model OOS curve CSV and summary JSON into <version_dir>/betting_analysis/,
plus a fixed-name copy of the summary for the designated evidence model
(default: spi_lite_baseline) for backward-compatible/simple consumption by
downstream gates and reports.

No tokens involved; this reads local backtest artifacts only.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.threshold_tuning import (
    DEFAULT_CONFIDENCE_GRID,
    DEFAULT_EDGE_GRID,
    run_nested_threshold_tuning,
)
from src.utils.artifacts import resolve_version_dir
from src.utils.io import load_config, save_csv, save_json


def _discover_models(backtest_dir: Path, requested: list[str] | None) -> list[str]:
    available = sorted(
        path.stem.replace("decision_log_", "", 1) for path in backtest_dir.glob("decision_log_*.csv")
    )
    if not requested:
        return available
    resolved = []
    for model in requested:
        if model in available:
            resolved.append(model)
        else:
            print(f"WARNING: no decision log found for model '{model}' in {backtest_dir}, skipping")
    return resolved


def _load_frame(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except pd.errors.EmptyDataError:
        return pd.DataFrame()


def main() -> None:
    parser = argparse.ArgumentParser(description="Nested chronological betting threshold tuning")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", default="")
    parser.add_argument("--backtest-dir", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument(
        "--models",
        nargs="*",
        default=None,
        help="Model names to process. Default: every model with a decision_log_<model>.csv present.",
    )
    parser.add_argument("--config", default="configs/default.yaml")
    parser.add_argument(
        "--evidence-model",
        default="spi_lite_baseline",
        help="Model whose summary is also written to the fixed nested_thresholds_summary.json path.",
    )
    args = parser.parse_args()

    version_dir = resolve_version_dir(args.version or None, Path(args.artifact_root))
    backtest_dir = Path(args.backtest_dir) if args.backtest_dir else version_dir / "backtest"
    output_dir = Path(args.output_dir) if args.output_dir else version_dir / "betting_analysis"
    output_dir.mkdir(parents=True, exist_ok=True)

    config_path = Path(args.config)
    config = load_config(config_path) if config_path.exists() else {}
    tt_cfg = config.get("threshold_tuning", {}) or {}
    edge_grid = tt_cfg.get("edge_grid", DEFAULT_EDGE_GRID)
    confidence_grid = tt_cfg.get("confidence_grid", DEFAULT_CONFIDENCE_GRID)
    min_bets_per_cell = int(tt_cfg.get("min_bets_per_cell", 8))
    min_history_bets = int(tt_cfg.get("min_history_bets", 30))
    rank_metric = tt_cfg.get("rank_metric", "roi_units")

    models = _discover_models(backtest_dir, args.models)
    if not models:
        print(f"No decision logs found in {backtest_dir}; nothing to tune.")
        return

    generated_at = datetime.now(timezone.utc).isoformat()
    table_rows: list[dict] = []

    for model in models:
        decisions_path = backtest_dir / f"decision_log_{model}.csv"
        predictions_path = backtest_dir / f"predictions_{model}.csv"
        decisions = _load_frame(decisions_path)
        predictions = _load_frame(predictions_path)

        result = run_nested_threshold_tuning(
            decisions,
            predictions,
            edge_grid=edge_grid,
            confidence_grid=confidence_grid,
            min_bets_per_cell=min_bets_per_cell,
            min_history_bets=min_history_bets,
            rank_metric=rank_metric,
            model=model,
            generated_at=generated_at,
        )

        save_csv(result.oos_curve, output_dir / f"nested_thresholds_oos_curve_{model}.csv")
        payload = {
            "version": version_dir.name,
            "model": model,
            "oos": result.oos_summary,
            "recommended": result.recommended,
            "metadata": result.metadata,
        }
        save_json(payload, output_dir / f"nested_thresholds_summary_{model}.json")
        if model == args.evidence_model:
            save_json(payload, output_dir / "nested_thresholds_summary.json")

        for group in ("moneyline", "totals"):
            oos = result.oos_summary.get(group, {})
            recommended = result.recommended.get(group, {})
            table_rows.append(
                {
                    "model": model,
                    "market_group": group,
                    "evidence_missing": result.metadata.get("evidence_missing", False),
                    "n_bets": oos.get("n_bets", 0),
                    "pnl_units": oos.get("pnl_units", 0.0),
                    "roi_units": oos.get("roi_units", 0.0),
                    "n_blocks_tuned": oos.get("n_blocks_tuned", 0),
                    "n_blocks_fallback": oos.get("n_blocks_fallback", 0),
                    "recommended_min_edge": recommended.get("min_edge"),
                    "recommended_min_confidence": recommended.get("min_confidence"),
                }
            )

    table = pd.DataFrame(table_rows)
    if not table.empty:
        print(table.to_string(index=False))
    print(f"Wrote nested threshold tuning summaries for {len(models)} model(s) to {output_dir}")
    if args.evidence_model in models:
        print(f"Evidence-model copy written to {output_dir / 'nested_thresholds_summary.json'}")
    else:
        print(
            f"NOTE: evidence model '{args.evidence_model}' was not among the processed models "
            f"({models}); no fixed-name nested_thresholds_summary.json was written."
        )


if __name__ == "__main__":
    main()
