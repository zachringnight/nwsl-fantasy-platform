#!/usr/bin/env python3
"""Matchday pick tracker: lock in today's picks and grade past ones.

Forward pick-log workflow (run once per matchday):
  1. Read the freshly generated betting slate.
  2. Extract every actionable pick (official + lean) with its locked odds.
  3. Merge into the persistent ledger (idempotent: first-seen odds stay locked).
  4. Settle any pending picks whose match has now been played.
  5. Write the ledger back and emit a Slack-ready running-record report.

This tracks *real forward performance*, distinct from the historical backtest.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.tracking.pick_ledger import (
    LEDGER_COLUMNS,
    extract_picks_from_slate,
    merge_new_picks,
    render_record_report,
    settle_picks,
    summarize_record,
)


def _resolve(value: str | None, default: str) -> Path:
    if value is None:
        return MODEL_ROOT / default
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def main() -> None:
    parser = argparse.ArgumentParser(description="Record and settle matchday picks (forward log)")
    parser.add_argument("--slate", help="Betting slate CSV", default=None)
    parser.add_argument("--matches", help="Matches results CSV", default=None)
    parser.add_argument("--ledger", help="Persistent pick ledger CSV", default=None)
    parser.add_argument("--report", help="Where to write the Slack-ready report", default=None)
    parser.add_argument("--as-of", help="recorded_at timestamp (default: now UTC)", default=None)
    args = parser.parse_args()

    slate_path = _resolve(args.slate, "data/processed/betting_slate.csv")
    matches_path = _resolve(args.matches, "data/raw/matches.csv")
    ledger_path = _resolve(args.ledger, "data/processed/pick_ledger.csv")
    report_path = _resolve(args.report, "data/processed/pick_record_report.md")

    recorded_at = args.as_of or pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ")

    slate = pd.read_csv(slate_path) if slate_path.exists() else pd.DataFrame()
    new_picks = extract_picks_from_slate(slate, recorded_at=recorded_at) if not slate.empty else pd.DataFrame(columns=LEDGER_COLUMNS)

    existing = pd.read_csv(ledger_path) if ledger_path.exists() else pd.DataFrame(columns=LEDGER_COLUMNS)
    before_ids = set(existing["pick_id"]) if "pick_id" in existing.columns else set()

    ledger = merge_new_picks(existing, new_picks)
    new_locked = int(len(set(ledger["pick_id"]) - before_ids)) if not ledger.empty else 0

    settled_before = int((ledger["result"] != "pending").sum()) if not ledger.empty else 0
    matches = pd.read_csv(matches_path, dtype={"match_id": str}) if matches_path.exists() else pd.DataFrame()
    ledger = settle_picks(ledger, matches, settled_at=recorded_at)
    settled_after = int((ledger["result"] != "pending").sum()) if not ledger.empty else 0
    newly_settled = settled_after - settled_before

    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger.to_csv(ledger_path, index=False)

    summary = summarize_record(ledger)
    report = render_record_report(summary, new_pick_count=new_locked)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report + "\n")

    print(report)
    print(f"\n[ledger: {len(ledger)} picks at {ledger_path}]")
    # Machine-parseable line for the scheduled job's quiet-day decision.
    print(f"STATUS new_picks={new_locked} newly_settled={newly_settled} pending={summary.get('pending', 0)}")


if __name__ == "__main__":
    main()
