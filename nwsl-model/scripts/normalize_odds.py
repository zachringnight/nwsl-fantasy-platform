#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.odds.normalization import normalize_odds_frame


def _resolve(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else Path.cwd() / candidate


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize wide odds into one row per selection")
    parser.add_argument("--input", default="data/raw/odds.csv")
    parser.add_argument("--output", default="data/raw/odds_normalized.csv")
    parser.add_argument("--include-rejected", action="store_true")
    args = parser.parse_args()

    input_path = _resolve(args.input)
    output_path = _resolve(args.output)
    odds = pd.read_csv(input_path, dtype={"match_id": str})
    normalized = normalize_odds_frame(odds, include_rejected=args.include_rejected)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized.to_csv(output_path, index=False)
    print(f"Wrote {len(normalized)} normalized odds rows to {output_path}")


if __name__ == "__main__":
    main()
