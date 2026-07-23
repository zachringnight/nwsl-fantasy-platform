#!/usr/bin/env python3
"""Fetch current NWSL total-goals odds from FOX Sports event pages."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.odds.apify_footystats import (
    merge_current_odds_contract,
    update_dataset_manifest_odds,
)
from src.odds.foxsports import (
    build_current_total_contract,
    discover_event_urls,
    fetch_current_total_rows,
)


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch current NWSL totals from FOX Sports")
    parser.add_argument("--start-date", default=date.today().isoformat())
    parser.add_argument("--days", type=positive_int, default=14)
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument("--output", default="data/raw/odds.csv")
    parser.add_argument("--raw-output", default="data/raw/foxsports_current_totals_raw.json")
    parser.add_argument("--unmatched-output", default="data/raw/foxsports_current_totals_unmatched.csv")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()

    event_urls = discover_event_urls(start_date=start_date, days=args.days)
    parsed, fetch_unmatched = fetch_current_total_rows(event_urls, captured_at=datetime.now(UTC))

    raw_output = Path(args.raw_output)
    raw_output.parent.mkdir(parents=True, exist_ok=True)
    raw_output.write_text(
        json.dumps(
            {
                "start_date": start_date.isoformat(),
                "days": args.days,
                "event_urls": event_urls,
                "parsed": parsed.to_dict(orient="records"),
                "fetch_unmatched": fetch_unmatched.to_dict(orient="records"),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    upcoming = pd.read_csv(args.upcoming)
    contract, match_unmatched = build_current_total_contract(parsed, upcoming)
    unmatched = pd.concat(
        [frame for frame in (fetch_unmatched, match_unmatched) if not frame.empty],
        ignore_index=True,
    ) if not fetch_unmatched.empty or not match_unmatched.empty else pd.DataFrame()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    existing_odds = pd.read_csv(output) if output.exists() else pd.DataFrame()
    merged_odds = merge_current_odds_contract(existing_odds, contract, sportsbook="FoxSports")
    merged_odds.to_csv(output, index=False)
    update_dataset_manifest_odds(output.parent / "dataset_manifest.json", merged_odds)

    unmatched_output = Path(args.unmatched_output)
    if unmatched.empty:
        if unmatched_output.exists():
            unmatched_output.unlink()
    else:
        unmatched_output.parent.mkdir(parents=True, exist_ok=True)
        unmatched.to_csv(unmatched_output, index=False)

    print(
        "Fetched FOX Sports current totals: "
        f"event_urls={len(event_urls)} parsed_rows={len(parsed)} matched_rows={len(contract)} "
        f"unmatched_rows={len(unmatched)} total_odds_rows={len(merged_odds)} output={output}"
    )
    if not unmatched.empty:
        print(f"Unmatched FOX Sports rows written to {unmatched_output}")


if __name__ == "__main__":
    main()
