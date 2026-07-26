#!/usr/bin/env python3
"""Remove stale rows from the active current-odds contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.apify_footystats import update_dataset_manifest_odds  # noqa: E402
from src.odds.source_health import filter_fresh_current_rows  # noqa: E402


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove stale or invalid rows labeled source_type=current"
    )
    parser.add_argument("--odds", default="data/raw/odds.csv")
    parser.add_argument(
        "--audit-output", default="data/raw/odds_freshness_audit.json"
    )
    parser.add_argument("--max-age-minutes", type=int, default=180)
    args = parser.parse_args()

    odds_path = resolve_path(args.odds)
    odds = pd.read_csv(odds_path, dtype={"match_id": str})
    cleaned, report = filter_fresh_current_rows(
        odds,
        max_age_minutes=args.max_age_minutes,
    )
    cleaned.to_csv(odds_path, index=False)
    update_dataset_manifest_odds(
        odds_path.parent / "dataset_manifest.json",
        cleaned,
    )

    audit_path = resolve_path(args.audit_output)
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "Enforced current-odds freshness: "
        f"before={report['current_rows_before']} after={report['current_rows_after']} "
        f"removed={report['removed_rows']} max_age_minutes={report['max_age_minutes']}"
    )


if __name__ == "__main__":
    main()
