#!/usr/bin/env python3
"""Build an operator-facing odds source health and shadow-readiness report."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.source_health import build_odds_source_health_report  # noqa: E402


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype={"match_id": str}) if path.exists() else pd.DataFrame()


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build current odds source health report")
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument("--odds", default="data/raw/odds.csv")
    parser.add_argument(
        "--shadow-current", default="data/raw/api_football_shadow_current.csv"
    )
    parser.add_argument(
        "--shadow-snapshots", default="data/raw/api_football_shadow_snapshots.csv"
    )
    parser.add_argument(
        "--shadow-status", default="data/raw/api_football_shadow_status.json"
    )
    parser.add_argument(
        "--shadow-unmatched", default="data/raw/api_football_shadow_unmatched.csv"
    )
    parser.add_argument("--output", default="data/raw/odds_source_health.json")
    parser.add_argument("--max-age-minutes", type=int, default=180)
    args = parser.parse_args()

    unmatched_path = resolve_path(args.shadow_unmatched)
    unmatched_count = len(read_csv(unmatched_path))
    report = build_odds_source_health_report(
        upcoming=read_csv(resolve_path(args.upcoming)),
        authoritative_odds=read_csv(resolve_path(args.odds)),
        shadow_current=read_csv(resolve_path(args.shadow_current)),
        shadow_snapshots=read_csv(resolve_path(args.shadow_snapshots)),
        shadow_status=read_json(resolve_path(args.shadow_status)),
        unmatched_count=unmatched_count,
        max_age_minutes=args.max_age_minutes,
    )
    output = resolve_path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    gate = report["promotion_gate"]
    print(
        "Odds source health: "
        f"authoritative={report['authoritative']['status']} "
        f"api_football_shadow={report['api_football_shadow']['status']} "
        f"manual_review_ready={gate['ready_for_manual_review']} "
        f"reasons={','.join(gate['reasons']) or 'none'}"
    )


if __name__ == "__main__":
    main()
