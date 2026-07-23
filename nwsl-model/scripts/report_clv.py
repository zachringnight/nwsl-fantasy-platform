#!/usr/bin/env python3
"""Report closing-line value (CLV) from the accumulated odds snapshot history.

For every match/book/market where the snapshot store has captured the line at
two or more times, compares the earliest price (open proxy) to the close and
reports whether early lines beat the close. This is the core measurement for a
line-timing edge. It is only meaningful once captures have accumulated movement,
so it honestly reports when there is not yet enough paired history.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.betting.clv import clv_summary, open_close_clv_report


def resolve_cli_path(value: str | None, default: str) -> Path:
    if value is None:
        return MODEL_ROOT / default
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def main() -> None:
    parser = argparse.ArgumentParser(description="Report CLV (open vs close) from the odds snapshot history")
    parser.add_argument("--snapshot", help="Snapshot history file (default data/raw/odds_snapshots.csv)")
    parser.add_argument("--by-book", action="store_true", help="Break down mean CLV per sportsbook")
    parser.add_argument("--output", help="Optional CSV path to write the per-side CLV rows")
    args = parser.parse_args()

    snapshot_path = resolve_cli_path(args.snapshot, "data/raw/odds_snapshots.csv")
    if not snapshot_path.exists():
        raise SystemExit(f"Snapshot history not found: {snapshot_path}. Run capture_clv_snapshot.py first.")

    snapshots = pd.read_csv(snapshot_path)
    report = open_close_clv_report(snapshots)

    total_groups = snapshots.groupby(["match_id", "sportsbook", "market_type"])["timestamp"].nunique()
    movement_groups = int((total_groups > 1).sum())

    print("=" * 64)
    print("CLV REPORT (earliest captured line vs close)")
    print("=" * 64)
    print(f"snapshot rows           : {len(snapshots)}")
    print(f"match/book/market groups: {len(total_groups)}  (with >1 timestamp: {movement_groups})")

    if report.empty:
        print()
        print("Not enough paired open/close history yet to measure CLV.")
        print("Each capture only adds a row when the line has moved since last seen.")
        print("Schedule capture_clv_snapshot.py so movement accumulates for upcoming matches.")
        return

    summary = clv_summary(report)
    print(f"priced sides with CLV   : {summary['n_bets_with_clv']}")
    print(f"mean CLV                : {summary['mean_clv'] * 100:+.2f}%")
    print(f"median CLV              : {summary.get('median_clv', 0.0) * 100:+.2f}%")
    print(f"share positive CLV      : {summary.get('pct_positive_clv', 0.0) * 100:.1f}%")

    if args.by_book:
        print("-" * 64)
        print(f"{'sportsbook':20s}{'n':>6s}{'mean CLV':>12s}{'% positive':>12s}")
        for book, g in report.groupby("sportsbook"):
            print(f"{str(book):20s}{len(g):>6d}{g['clv'].mean() * 100:>11.2f}%{(g['clv'] > 0).mean() * 100:>11.1f}%")

    if args.output:
        out = resolve_cli_path(args.output, args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        report.to_csv(out, index=False)
        print(f"Wrote {len(report)} per-side CLV rows to {out}")


if __name__ == "__main__":
    main()
