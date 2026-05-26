#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(MODEL_ROOT))

from src.odds.snapshots import materialize_closing_odds


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return parsed


def resolve_cli_path(value: str | None, default: str) -> Path:
    if value is None:
        return MODEL_ROOT / default
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build close odds from snapshot history")
    parser.add_argument("--matches")
    parser.add_argument("--snapshots")
    parser.add_argument("--output")
    parser.add_argument("--max-hours-before-match", type=positive_int, default=168)
    args = parser.parse_args()

    matches_path = resolve_cli_path(args.matches, "data/raw/matches.csv")
    snapshots_path = resolve_cli_path(args.snapshots, "data/raw/odds_snapshots.csv")
    output_path = resolve_cli_path(args.output, "data/raw/closing_odds.csv")

    matches = pd.read_csv(matches_path)
    snapshots = pd.read_csv(snapshots_path)
    close = materialize_closing_odds(
        matches,
        snapshots,
        max_hours_before_match=args.max_hours_before_match,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    close.to_csv(output_path, index=False)
    print(f"Wrote {len(close)} close odds rows to {output_path}")


if __name__ == "__main__":
    main()
