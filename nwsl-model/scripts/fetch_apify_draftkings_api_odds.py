#!/usr/bin/env python3
"""Fetch structured NWSL DraftKings odds from the Apify Standby API."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = MODEL_ROOT.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.apify_draftkings import (  # noqa: E402
    DRAFTKINGS_API_PARSED_COLUMNS,
    DRAFTKINGS_API_REJECTED_COLUMNS,
    DRAFTKINGS_NWSL_API_URL,
    DRAFTKINGS_NWSL_LEAGUE_ID,
    build_draftkings_api_contract,
    fetch_draftkings_api_payload,
    load_env_token,
    merge_current_odds_contract,
    parse_draftkings_api_payload,
)
from src.odds.apify_footystats import update_dataset_manifest_odds  # noqa: E402


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch current NWSL DraftKings moneyline and total odds from the Apify Standby API"
        )
    )
    parser.add_argument("--url", default=DRAFTKINGS_NWSL_API_URL)
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument("--output", default="data/raw/odds.csv")
    parser.add_argument(
        "--raw-output",
        default="data/raw/apify_draftkings_api_odds_raw.json",
    )
    parser.add_argument(
        "--unmatched-output",
        default="data/raw/apify_draftkings_api_odds_unmatched.csv",
    )
    parser.add_argument(
        "--status-output",
        default="data/raw/apify_draftkings_api_odds_status.json",
    )
    parser.add_argument("--token-env", default="APIFY_TOKEN")
    parser.add_argument("--timeout-seconds", type=int, default=60)
    parser.add_argument("--max-date-delta-days", type=int, default=1)
    return parser.parse_args()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2) + "\n",
        encoding="utf-8",
    )


def _empty_unmatched() -> pd.DataFrame:
    columns = list(DRAFTKINGS_API_REJECTED_COLUMNS)
    columns.extend(column for column in DRAFTKINGS_API_PARSED_COLUMNS if column not in columns)
    if "reason" not in columns:
        columns.append("reason")
    return pd.DataFrame(columns=columns)


def _safe_endpoint(value: str) -> str:
    parts = urlsplit(str(value))
    query = urlencode(
        [
            (key, item)
            for key, item in parse_qsl(
                parts.query,
                keep_blank_values=True,
            )
            if key.casefold() not in {"token", "access_token", "api_key", "apikey"}
        ]
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def _status_base(checked_at: datetime, endpoint: str) -> dict:
    return {
        "source": "apify-draftkings",
        "actor": "zen-studio/draftkings-odds",
        "sportsbook": "DraftKings",
        "league_id": DRAFTKINGS_NWSL_LEAGUE_ID,
        "endpoint": _safe_endpoint(endpoint),
        "checked_at": checked_at.isoformat(),
    }


def main() -> None:
    args = parse_args()
    checked_at = datetime.now(UTC)
    status_path = resolve_path(args.status_output)
    status_base = _status_base(checked_at, str(args.url))
    token = load_env_token(
        args.token_env,
        env_files=[
            MODEL_ROOT / ".env.local",
            REPO_ROOT / ".env.local",
        ],
    )
    if not token:
        write_json(
            status_path,
            {
                **status_base,
                "status": "missing_token",
                "error_type": "MissingCredential",
            },
        )
        raise SystemExit(f"{args.token_env} is not configured; status written to {status_path}")

    try:
        payload = fetch_draftkings_api_payload(
            token,
            url=args.url,
            timeout_seconds=args.timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001 - provider failure is status data
        write_json(
            status_path,
            {
                **status_base,
                "status": "failed",
                "error_type": type(exc).__name__,
            },
        )
        raise SystemExit(
            "Apify DraftKings API fetch failed "
            f"({type(exc).__name__}); status written to {status_path}"
        ) from exc

    raw_path = resolve_path(args.raw_output)
    write_json(raw_path, payload)

    try:
        parsed, rejected = parse_draftkings_api_payload(payload)
        upcoming = pd.read_csv(
            resolve_path(args.upcoming),
            dtype={"match_id": str},
        )
        contract, unmatched = build_draftkings_api_contract(
            parsed,
            upcoming,
            max_date_delta_days=args.max_date_delta_days,
        )
        unmatched_frames = [frame for frame in (rejected, unmatched) if not frame.empty]
        all_unmatched = (
            pd.concat(
                unmatched_frames,
                ignore_index=True,
                sort=False,
            )
            if unmatched_frames
            else _empty_unmatched()
        )

        output_path = resolve_path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        existing_odds = (
            pd.read_csv(output_path, dtype={"match_id": str})
            if output_path.exists()
            else pd.DataFrame()
        )
        merged_odds = merge_current_odds_contract(
            existing_odds,
            contract,
            sportsbook="DraftKings",
            replace_source_types=("current", "live"),
            replace_when_empty=True,
        )
        merged_odds.to_csv(output_path, index=False)
        update_dataset_manifest_odds(
            output_path.parent / "dataset_manifest.json",
            merged_odds,
        )

        unmatched_path = resolve_path(args.unmatched_output)
        unmatched_path.parent.mkdir(parents=True, exist_ok=True)
        all_unmatched.to_csv(unmatched_path, index=False)
    except Exception as exc:  # noqa: BLE001 - preserve failed processing state
        write_json(
            status_path,
            {
                **status_base,
                "status": "failed",
                "scraped_at": payload.get("scrapedAt"),
                "error_type": type(exc).__name__,
                "raw_output": str(raw_path),
            },
        )
        raise SystemExit(
            "Apify DraftKings API processing failed "
            f"({type(exc).__name__}); status written to {status_path}"
        ) from exc

    status = {
        **status_base,
        "status": "ok",
        "scraped_at": payload.get("scrapedAt"),
        "event_count": int(len(payload.get("events") or [])),
        "parsed_rows": int(len(parsed)),
        "moneyline_rows": int(parsed["market_type"].eq("1x2").sum()),
        "total_rows": int(parsed["market_type"].eq("total").sum()),
        "matched_rows": int(len(contract)),
        "matched_matches": int(
            contract.get(
                "match_id",
                pd.Series(dtype=str),
            )
            .astype(str)
            .nunique()
        ),
        "rejected_rows": int(len(rejected)),
        "unmatched_rows": int(len(unmatched)),
        "review_rows": int(len(all_unmatched)),
        "authoritative_odds_rows": int(len(merged_odds)),
        "raw_output": str(raw_path),
        "unmatched_output": str(unmatched_path),
    }
    write_json(status_path, status)
    print(
        "Fetched Apify DraftKings API odds: "
        f"events={status['event_count']} parsed_rows={status['parsed_rows']} "
        f"matched_rows={status['matched_rows']} "
        f"unmatched_rows={status['unmatched_rows']} "
        f"total_odds_rows={status['authoritative_odds_rows']}"
    )


if __name__ == "__main__":
    main()
