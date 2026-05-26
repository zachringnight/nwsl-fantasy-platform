#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

MODEL_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(MODEL_ROOT))

from src.odds.snapshots import append_snapshot_file


def resolve_cli_path(value: str | None, default: str) -> Path:
    if value is None:
        return MODEL_ROOT / default
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def main() -> None:
    parser = argparse.ArgumentParser(description="Append current odds into the historical snapshot file")
    parser.add_argument("--incoming")
    parser.add_argument("--snapshot")
    args = parser.parse_args()

    incoming_path = resolve_cli_path(args.incoming, "data/raw/odds.csv")
    snapshot_path = resolve_cli_path(args.snapshot, "data/raw/odds_snapshots.csv")
    combined = append_snapshot_file(snapshot_path, incoming_path)
    print(f"Wrote {len(combined)} odds snapshot rows to {snapshot_path}")


if __name__ == "__main__":
    main()
