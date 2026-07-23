#!/usr/bin/env python3
"""Fetch NWSL historical 1X2 odds from OddsPortal through Apify."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = MODEL_ROOT.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.apify_footystats import ODDS_CONTRACT_COLUMNS, load_env_token, run_apify_web_scraper, update_dataset_manifest_odds
from src.odds.apify_oddsportal import (
    ODDSPORTAL_NWSL_RESULTS_URLS,
    archive_pages_to_match_rows,
    build_discovery_input,
    build_historical_1x2_open_close_contract,
    build_historical_odds_contract,
    build_historical_total_odds_contract,
    merge_historical_with_existing_odds,
    run_apify_match_event_fetch,
    run_direct_match_event_fetch,
    resolve_season_requests,
    run_apify_archive_fetch,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch historical NWSL OddsPortal odds through Apify")
    parser.add_argument("--seasons", nargs="+", type=int, default=[2025, 2026])
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument("--existing-odds", default="data/raw/odds.csv")
    parser.add_argument("--output", default="data/raw/odds.csv")
    parser.add_argument("--historical-output", default="data/raw/oddsportal_historical_close.csv")
    parser.add_argument("--historical-total-output", default="data/raw/oddsportal_historical_totals.csv")
    parser.add_argument("--parsed-output", default="data/raw/oddsportal_historical_matches.csv")
    parser.add_argument("--unmatched-output", default="data/raw/oddsportal_historical_unmatched.csv")
    parser.add_argument("--raw-output", default="data/raw/apify_oddsportal_archive_raw.json")
    parser.add_argument("--raw-total-output", default="data/raw/apify_oddsportal_total_markets_raw.json")
    parser.add_argument("--discovery-output", default="data/raw/apify_oddsportal_discovery_raw.json")
    parser.add_argument("--report-output", default="data/raw/oddsportal_historical_report.json")
    parser.add_argument("--token-env", default="APIFY_TOKEN")
    parser.add_argument("--timeout-seconds", type=int, default=420)
    parser.add_argument("--include-max-book", action="store_true")
    parser.add_argument("--skip-total-markets", action="store_true")
    parser.add_argument("--include-all-total-lines", action="store_true")
    parser.add_argument(
        "--total-market-fetch-mode",
        choices=["apify", "direct", "apify_then_direct"],
        default="apify_then_direct",
    )
    parser.add_argument("--total-market-workers", type=int, default=8)
    parser.add_argument(
        "--include-1x2-opening",
        action="store_true",
        help="Also fetch per-match 1X2 event payloads to capture opening odds (extra fetch).",
    )
    parser.add_argument(
        "--raw-1x2-opening-output",
        default="data/raw/apify_oddsportal_1x2_opening_raw.json",
    )
    return parser.parse_args()


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else MODEL_ROOT / path


def main() -> None:
    args = parse_args()
    unknown = [season for season in args.seasons if season not in ODDSPORTAL_NWSL_RESULTS_URLS]
    if unknown:
        raise SystemExit(f"No OddsPortal NWSL URL configured for seasons: {unknown}")

    token = load_env_token(
        args.token_env,
        env_files=[
            MODEL_ROOT / ".env.local",
            REPO_ROOT / ".env.local",
        ],
    )
    if not token:
        raise SystemExit(f"{args.token_env} is not configured in environment or ignored .env.local files.")

    season_urls = {season: ODDSPORTAL_NWSL_RESULTS_URLS[season] for season in args.seasons}
    discovery_items = run_apify_web_scraper(
        token,
        build_discovery_input(list(season_urls.values())),
        timeout_seconds=args.timeout_seconds,
    )
    discovery_output = resolve_path(args.discovery_output)
    discovery_output.parent.mkdir(parents=True, exist_ok=True)
    discovery_output.write_text(json.dumps(discovery_items, indent=2), encoding="utf-8")

    season_requests = resolve_season_requests(discovery_items, args.seasons, season_urls)
    archive_items, decrypted_pages = run_apify_archive_fetch(
        token,
        season_requests,
        timeout_seconds=args.timeout_seconds,
    )
    raw_output = resolve_path(args.raw_output)
    raw_output.parent.mkdir(parents=True, exist_ok=True)
    raw_output.write_text(json.dumps(archive_items, indent=2), encoding="utf-8")

    parsed = archive_pages_to_match_rows(decrypted_pages)
    parsed_output = resolve_path(args.parsed_output)
    parsed_output.parent.mkdir(parents=True, exist_ok=True)
    parsed.to_csv(parsed_output, index=False)

    matches = pd.read_csv(resolve_path(args.matches))
    historical_1x2, unmatched_1x2 = build_historical_odds_contract(
        parsed,
        matches,
        include_max_book=args.include_max_book,
    )
    historical_total = pd.DataFrame()
    unmatched_total = pd.DataFrame()
    total_payloads = {}
    raw_total_output = resolve_path(args.raw_total_output)
    if not args.skip_total_markets:
        total_items = []
        if args.total_market_fetch_mode in {"apify", "apify_then_direct"}:
            try:
                total_items, total_payloads = run_apify_match_event_fetch(
                    token,
                    parsed,
                    timeout_seconds=args.timeout_seconds,
                )
            except (HTTPError, TimeoutError) as exc:
                if args.total_market_fetch_mode == "apify":
                    raise
                print(
                    f"Apify total-market event fetch failed ({exc}); falling back to direct event endpoints.",
                    file=sys.stderr,
                )
        if args.total_market_fetch_mode == "direct" or (
            args.total_market_fetch_mode == "apify_then_direct" and not total_payloads
        ):
            total_items, total_payloads = run_direct_match_event_fetch(
                parsed,
                max_workers=args.total_market_workers,
            )
        raw_total_output.parent.mkdir(parents=True, exist_ok=True)
        raw_total_output.write_text(json.dumps(total_items, indent=2), encoding="utf-8")
        historical_total, unmatched_total = build_historical_total_odds_contract(
            parsed,
            matches,
            total_payloads,
            include_all_total_lines=args.include_all_total_lines,
        )

    historical_1x2_open_close = pd.DataFrame()
    if args.include_1x2_opening:
        opening_items: list = []
        opening_payloads: dict = {}
        if args.total_market_fetch_mode in {"apify", "apify_then_direct"}:
            try:
                opening_items, opening_payloads = run_apify_match_event_fetch(
                    token,
                    parsed,
                    betting_type=1,
                    timeout_seconds=args.timeout_seconds,
                )
            except (HTTPError, TimeoutError) as exc:
                if args.total_market_fetch_mode == "apify":
                    raise
                print(
                    f"Apify 1X2 opening event fetch failed ({exc}); falling back to direct endpoints.",
                    file=sys.stderr,
                )
        if args.total_market_fetch_mode == "direct" or (
            args.total_market_fetch_mode == "apify_then_direct" and not opening_payloads
        ):
            opening_items, opening_payloads = run_direct_match_event_fetch(
                parsed,
                betting_type=1,
                max_workers=args.total_market_workers,
            )
        raw_opening_output = resolve_path(args.raw_1x2_opening_output)
        raw_opening_output.parent.mkdir(parents=True, exist_ok=True)
        raw_opening_output.write_text(json.dumps(opening_items, indent=2), encoding="utf-8")
        historical_1x2_open_close, _ = build_historical_1x2_open_close_contract(
            parsed,
            matches,
            opening_payloads,
        )

    if not unmatched_1x2.empty:
        unmatched_1x2 = unmatched_1x2.copy()
        unmatched_1x2["market_type"] = "1x2"
    if not unmatched_total.empty:
        unmatched_total = unmatched_total.copy()
        unmatched_total["market_type"] = "total"
    unmatched = pd.concat(
        [frame for frame in (unmatched_1x2, unmatched_total) if not frame.empty],
        ignore_index=True,
        sort=False,
    )
    historical = pd.concat(
        [
            frame
            for frame in (historical_1x2, historical_total, historical_1x2_open_close)
            if not frame.empty
        ],
        ignore_index=True,
        sort=False,
    )
    if historical.empty:
        historical = pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS)
    historical_output = resolve_path(args.historical_output)
    historical_output.parent.mkdir(parents=True, exist_ok=True)
    historical.to_csv(historical_output, index=False)
    historical_total_output = resolve_path(args.historical_total_output)
    historical_total_output.parent.mkdir(parents=True, exist_ok=True)
    historical_total.to_csv(historical_total_output, index=False)

    unmatched_output = resolve_path(args.unmatched_output)
    if unmatched.empty:
        if unmatched_output.exists():
            unmatched_output.unlink()
    else:
        unmatched_output.parent.mkdir(parents=True, exist_ok=True)
        unmatched.to_csv(unmatched_output, index=False)

    existing_path = resolve_path(args.existing_odds)
    existing = pd.read_csv(existing_path) if existing_path.exists() else pd.DataFrame()
    combined = merge_historical_with_existing_odds(existing, historical)
    output = resolve_path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(output, index=False)
    update_dataset_manifest_odds(output.parent / "dataset_manifest.json", combined)

    report = {
        "seasons": args.seasons,
        "season_pages": {
            str(season): sorted(int(page) for page in pages)
            for season, pages in decrypted_pages.items()
        },
        "archive_rows": int(
            sum(
                len(payload.get("d", {}).get("rows", []))
                for pages in decrypted_pages.values()
                for payload in pages.values()
            )
        ),
        "parsed_rows_with_1x2": int(len(parsed)),
        "total_market_payloads": int(len(total_payloads)),
        "historical_1x2_rows": int(len(historical_1x2)),
        "historical_1x2_open_close_rows": int(len(historical_1x2_open_close)),
        "historical_total_rows": int(len(historical_total)),
        "historical_total_matches": int(historical_total["match_id"].nunique()) if not historical_total.empty else 0,
        "historical_close_rows": int(len(historical)),
        "historical_close_matches": int(historical["match_id"].nunique()) if not historical.empty else 0,
        "unmatched_rows": int(len(unmatched)),
        "combined_odds_rows": int(len(combined)),
        "combined_markets": sorted(combined["market_type"].dropna().astype(str).unique().tolist())
        if not combined.empty
        else [],
        "combined_source_types": sorted(combined["source_type"].dropna().astype(str).unique().tolist())
        if not combined.empty
        else [],
        "combined_sportsbooks": sorted(combined["sportsbook"].dropna().astype(str).unique().tolist())
        if not combined.empty
        else [],
        "raw_output": str(raw_output),
        "raw_total_output": str(raw_total_output) if not args.skip_total_markets else None,
        "historical_output": str(historical_output),
        "historical_total_output": str(historical_total_output),
        "combined_output": str(output),
    }
    report_output = resolve_path(args.report_output)
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(
        "Fetched Apify OddsPortal history: "
        f"archive_rows={report['archive_rows']} parsed_1x2={report['parsed_rows_with_1x2']} "
        f"historical_1x2_rows={report['historical_1x2_rows']} "
        f"historical_total_rows={report['historical_total_rows']} "
        f"unmatched={report['unmatched_rows']} "
        f"combined_rows={report['combined_odds_rows']} output={output}"
    )
    if not unmatched.empty:
        print(f"Unmatched OddsPortal rows written to {unmatched_output}")


if __name__ == "__main__":
    main()
