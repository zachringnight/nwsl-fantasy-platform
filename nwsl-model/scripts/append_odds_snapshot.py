#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.odds.snapshots import append_snapshot_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Append current odds into the historical snapshot file")
    parser.add_argument("--incoming", default="data/raw/odds.csv")
    parser.add_argument("--snapshot", default="data/raw/odds_snapshots.csv")
    args = parser.parse_args()

    combined = append_snapshot_file(Path(args.snapshot), Path(args.incoming))
    print(f"Wrote {len(combined)} odds snapshot rows to {args.snapshot}")


if __name__ == "__main__":
    main()
