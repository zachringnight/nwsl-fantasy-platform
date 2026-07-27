#!/usr/bin/env python3
"""Write and enforce the daily raw-data lineage quality artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd


MODEL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = MODEL_ROOT.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.data.lineage import build_daily_lineage_quality  # noqa: E402
from src.utils.io import save_json  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate daily model lineage")
    parser.add_argument(
        "--espn",
        default="../src/data/espn/matches-2026.json",
    )
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument("--manifest", default="data/raw/dataset_manifest.json")
    parser.add_argument(
        "--output",
        default="data/raw/daily_lineage_quality.json",
    )
    args = parser.parse_args()

    espn = json.loads(Path(args.espn).read_text(encoding="utf-8"))
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    quality = build_daily_lineage_quality(
        espn_matches=espn,
        completed=pd.read_csv(Path(args.matches), dtype={"match_id": str}),
        upcoming=pd.read_csv(Path(args.upcoming), dtype={"match_id": str}),
        manifest=manifest,
    )
    save_json(quality, Path(args.output))
    print(json.dumps(quality, indent=2, sort_keys=True))
    if quality["status"] != "ready":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
