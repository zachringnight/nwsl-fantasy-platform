#!/usr/bin/env python3
"""Build deterministic nwsl-model raw datasets from repo data sources."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.dataset_builder import build_dataset, write_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Build nwsl-model raw datasets")
    parser.add_argument(
        "--repo-root",
        type=str,
        default=str(Path(__file__).resolve().parents[2]),
        help="Path to the monorepo root that contains data/",
    )
    parser.add_argument(
        "--odds-source",
        type=str,
        default="",
        help="Optional historical odds CSV to normalize into data/raw/odds.csv",
    )
    parser.add_argument(
        "--fetch-asa",
        action="store_true",
        help="Fetch fresh ASA analytics and cache them into data/raw before building priors",
    )
    parser.add_argument(
        "--history-start-season",
        type=int,
        default=2025,
        help="Filter raw model datasets to this season and later",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    odds_source = Path(args.odds_source).resolve() if args.odds_source else None

    outputs = build_dataset(
        repo_root=repo_root,
        odds_source=odds_source,
        fetch_asa=args.fetch_asa,
        history_start_season=args.history_start_season,
    )
    paths = write_dataset(outputs)

    print("Built raw nwsl-model datasets:")
    for name, path in paths.items():
        print(f"  {name}: {path}")


if __name__ == "__main__":
    main()
