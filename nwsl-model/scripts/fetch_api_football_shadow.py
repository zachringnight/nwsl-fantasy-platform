#!/usr/bin/env python3
"""Fetch the cached API-Football NWSL feed into the isolated shadow lane."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.api_football import (  # noqa: E402
    DEFAULT_API_FOOTBALL_FEED_URL,
    ApiFootballFeedClient,
    build_api_football_shadow_contract,
    flatten_api_football_totals,
)
from src.odds.snapshots import append_snapshot_rows  # noqa: E402


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch API-Football NWSL totals into a shadow-only contract"
    )
    parser.add_argument(
        "--url",
        default=os.environ.get(
            "NWSL_API_FOOTBALL_FEED_URL",
            DEFAULT_API_FOOTBALL_FEED_URL,
        ),
    )
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument(
        "--output", default="data/raw/api_football_shadow_current.csv"
    )
    parser.add_argument(
        "--snapshot", default="data/raw/api_football_shadow_snapshots.csv"
    )
    parser.add_argument(
        "--raw-output", default="data/raw/api_football_shadow_raw.json"
    )
    parser.add_argument(
        "--unmatched-output",
        default="data/raw/api_football_shadow_unmatched.csv",
    )
    parser.add_argument(
        "--status-output", default="data/raw/api_football_shadow_status.json"
    )
    parser.add_argument("--timeout-seconds", type=int, default=30)
    return parser.parse_args()


def write_status(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    checked_at = datetime.now(UTC)
    status_path = resolve_path(args.status_output)
    client = ApiFootballFeedClient(
        args.url,
        timeout_seconds=args.timeout_seconds,
    )
    try:
        feed = client.fetch()
    except Exception as exc:  # noqa: BLE001 - provider failure is operational state
        write_status(
            status_path,
            {
                "source": "api-football",
                "status": "failed",
                "checked_at": checked_at.isoformat(),
                "error_type": type(exc).__name__,
            },
        )
        raise SystemExit(
            f"API-Football shadow fetch failed ({type(exc).__name__}); "
            f"status written to {status_path}"
        ) from exc

    raw_path = resolve_path(args.raw_output)
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_text(json.dumps(feed, indent=2) + "\n", encoding="utf-8")

    flattened, rejected = flatten_api_football_totals(
        feed,
        captured_at=checked_at,
    )
    upcoming = pd.read_csv(resolve_path(args.upcoming), dtype={"match_id": str})
    contract, unmatched = build_api_football_shadow_contract(
        flattened,
        upcoming,
    )
    all_unmatched = pd.concat(
        [frame for frame in (rejected, unmatched) if not frame.empty],
        ignore_index=True,
        sort=False,
    ) if not rejected.empty or not unmatched.empty else pd.DataFrame()

    output_path = resolve_path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    contract.to_csv(output_path, index=False)

    snapshot_path = resolve_path(args.snapshot)
    existing = (
        pd.read_csv(snapshot_path, dtype={"match_id": str})
        if snapshot_path.exists()
        else pd.DataFrame()
    )
    snapshots = append_snapshot_rows(existing, contract)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshots.to_csv(snapshot_path, index=False)

    unmatched_path = resolve_path(args.unmatched_output)
    if all_unmatched.empty:
        if unmatched_path.exists():
            unmatched_path.unlink()
    else:
        unmatched_path.parent.mkdir(parents=True, exist_ok=True)
        all_unmatched.to_csv(unmatched_path, index=False)

    status = {
        "source": "api-football",
        "status": str(feed.get("status") or "unknown"),
        "checked_at": checked_at.isoformat(),
        "contract_version": feed.get("contractVersion"),
        "fixture_count": int(feed.get("fixtureCount") or 0),
        "provider_quote_count": int(feed.get("quoteCount") or 0),
        "parsed_rows": int(len(flattened)),
        "matched_rows": int(len(contract)),
        "unmatched_rows": int(len(all_unmatched)),
        "snapshot_rows": int(len(snapshots)),
    }
    write_status(status_path, status)
    print(
        "Fetched API-Football shadow totals: "
        f"fixtures={status['fixture_count']} provider_quotes={status['provider_quote_count']} "
        f"matched_rows={status['matched_rows']} unmatched_rows={status['unmatched_rows']} "
        f"snapshot_rows={status['snapshot_rows']}"
    )


if __name__ == "__main__":
    main()
