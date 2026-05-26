#!/usr/bin/env python3
"""Fetch current NWSL 1X2 odds from FootyStats through Apify."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.odds.apify_footystats import (
    FOOTYSTATS_NWSL_ODDS_URL,
    build_current_odds_contract,
    build_web_scraper_input,
    extract_text_from_apify_items,
    load_env_token,
    parse_footystats_odds_text,
    run_apify_web_scraper,
    update_dataset_manifest_odds,
)

UTC = timezone.utc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch current NWSL odds through Apify Web Scraper")
    parser.add_argument("--url", default=FOOTYSTATS_NWSL_ODDS_URL)
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument("--output", default="data/raw/odds.csv")
    parser.add_argument("--raw-output", default="data/raw/apify_footystats_odds_raw.json")
    parser.add_argument("--unmatched-output", default="data/raw/apify_footystats_odds_unmatched.csv")
    parser.add_argument("--token-env", default="APIFY_TOKEN")
    parser.add_argument("--timeout-seconds", type=int, default=300)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model_root = Path(__file__).resolve().parents[1]
    repo_root = model_root.parent
    token = load_env_token(
        args.token_env,
        env_files=[
            model_root / ".env.local",
            repo_root / ".env.local",
        ],
    )
    if not token:
        raise SystemExit(f"{args.token_env} is not configured in environment or ignored .env.local files.")

    run_input = build_web_scraper_input(args.url)
    items = run_apify_web_scraper(token, run_input, timeout_seconds=args.timeout_seconds)
    raw_output = Path(args.raw_output)
    raw_output.parent.mkdir(parents=True, exist_ok=True)
    raw_output.write_text(json.dumps(items, indent=2), encoding="utf-8")

    text = extract_text_from_apify_items(items)
    if not text:
        raise SystemExit("Apify completed but did not return FootyStats NWSL odds text.")

    parsed = parse_footystats_odds_text(text)
    if parsed.empty:
        raise SystemExit("FootyStats page text did not contain parseable NWSL odds rows.")

    upcoming = pd.read_csv(args.upcoming)
    contract, unmatched = build_current_odds_contract(parsed, upcoming, captured_at=datetime.now(UTC))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    contract.to_csv(output, index=False)
    update_dataset_manifest_odds(output.parent / "dataset_manifest.json", contract)

    unmatched_output = Path(args.unmatched_output)
    if unmatched.empty:
        if unmatched_output.exists():
            unmatched_output.unlink()
    else:
        unmatched_output.parent.mkdir(parents=True, exist_ok=True)
        unmatched.to_csv(unmatched_output, index=False)

    print(
        "Fetched Apify FootyStats odds: "
        f"parsed_rows={len(parsed)} matched_rows={len(contract)} unmatched_rows={len(unmatched)} output={output}"
    )
    if not unmatched.empty:
        print(f"Unmatched odds rows written to {unmatched_output}")


if __name__ == "__main__":
    main()
