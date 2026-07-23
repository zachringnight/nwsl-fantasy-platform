#!/usr/bin/env python3
"""Append the current live odds line into the historical snapshot store.

CLV (closing line value) requires a time series of odds per match: the price we
could bet now versus the price at close. A single capture of consensus closing
averages cannot measure that. This command reads the current odds file, keeps
only the live (wall-clock-stamped) rows, and appends them to the snapshot store.
Run it repeatedly (see cron schedule) so the open->close series accumulates for
each upcoming match.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.snapshots import append_snapshot_rows, extract_live_snapshot_rows


def resolve_cli_path(value: str | None, default: str) -> Path:
    if value is None:
        return MODEL_ROOT / default
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture current live odds into the CLV snapshot history")
    parser.add_argument("--odds", help="Current odds file (default data/raw/odds.csv)")
    parser.add_argument("--snapshot", help="Snapshot history file (default data/raw/odds_snapshots.csv)")
    args = parser.parse_args()

    odds_path = resolve_cli_path(args.odds, "data/raw/odds.csv")
    snapshot_path = resolve_cli_path(args.snapshot, "data/raw/odds_snapshots.csv")

    if not odds_path.exists():
        raise SystemExit(f"Current odds file not found: {odds_path}")

    odds = pd.read_csv(odds_path)
    live = extract_live_snapshot_rows(odds)
    if live.empty:
        print(
            f"No live odds rows in {odds_path.name} (need source_type in current/live/open). "
            "Nothing captured; run the DraftKings fetch first."
        )
        return

    existing = pd.read_csv(snapshot_path) if snapshot_path.exists() else pd.DataFrame()
    before = len(existing)
    combined = append_snapshot_rows(existing, live)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(snapshot_path, index=False)

    added = len(combined) - before
    distinct_ts = combined["timestamp"].nunique()
    matches_with_series = (combined.groupby("match_id")["timestamp"].nunique() > 1).sum()
    print(
        f"Captured {len(live)} live rows ({added} new) into {snapshot_path.name}: "
        f"{len(combined)} total rows, {distinct_ts} distinct timestamps, "
        f"{matches_with_series} matches now have multi-timestamp (movement) history."
    )


if __name__ == "__main__":
    main()
