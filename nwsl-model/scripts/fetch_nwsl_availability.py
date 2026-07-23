#!/usr/bin/env python3
"""Fetch official NWSL availability report and apply it to projected lineups."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.availability import (
    AVAILABILITY_URL,
    append_availability_snapshot,
    apply_availability_to_projected_lineups,
    fetch_availability_report,
)
from src.utils.io import save_csv, save_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch NWSL availability report")
    parser.add_argument("--url", default=AVAILABILITY_URL)
    parser.add_argument("--raw-dir", default="data/raw")
    parser.add_argument("--profiles", default="../data/nwsl-official/nwsl_2026_official_player_profiles.csv")
    parser.add_argument("--projected-lineups", default="data/raw/projected_lineups.csv")
    parser.add_argument("--no-apply", action="store_true")
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    availability = fetch_availability_report(args.url)
    availability_path = raw_dir / "availability_report.csv"
    save_csv(availability, availability_path)

    # Accumulate each weekly report into a dated history. The official page only
    # shows the current week, so this snapshot store is the only way historical
    # injury/suspension/international-duty flags become recoverable over time.
    snapshot_path = raw_dir / "availability_snapshots.csv"
    prior_snapshots = (
        pd.read_csv(snapshot_path) if snapshot_path.exists() else pd.DataFrame()
    )
    snapshots = append_availability_snapshot(prior_snapshots, availability)
    save_csv(snapshots, snapshot_path)

    report = {
        "source_url": args.url,
        "rows": int(len(availability)),
        "teams": sorted(availability["team"].dropna().astype(str).unique().tolist())
        if not availability.empty
        else [],
        "status_counts": availability["status"].value_counts(dropna=False).to_dict()
        if not availability.empty and "status" in availability.columns
        else {},
        "report_dates": sorted(availability["report_date"].dropna().astype(str).unique().tolist())
        if not availability.empty and "report_date" in availability.columns
        else [],
        "applied_to_projected_lineups": False,
        "projected_rows_updated": 0,
        "projected_start_removed": 0,
        "snapshot_rows_total": int(len(snapshots)),
        "snapshot_report_dates": sorted(
            snapshots["report_date"].dropna().astype(str).unique().tolist()
        )
        if not snapshots.empty and "report_date" in snapshots.columns
        else [],
    }

    projected_path = Path(args.projected_lineups)
    profiles_path = Path(args.profiles)
    if not args.no_apply and projected_path.exists() and profiles_path.exists() and not availability.empty:
        projected = pd.read_csv(projected_path)
        profiles = pd.read_csv(profiles_path)
        before_status = projected.get("status", pd.Series(index=projected.index, dtype=object)).copy()
        before_start = (
            projected.get("projected_start", pd.Series(False, index=projected.index)).astype(bool).copy()
        )
        updated = apply_availability_to_projected_lineups(projected, availability, profiles)
        save_csv(updated, projected_path)
        after_status = updated.get("status", pd.Series(index=updated.index, dtype=object)).copy()
        after_start = updated.get("projected_start", pd.Series(False, index=updated.index)).astype(bool)
        report["applied_to_projected_lineups"] = True
        report["projected_rows_updated"] = int((before_status.astype(str) != after_status.astype(str)).sum())
        report["projected_start_removed"] = int((before_start & ~after_start).sum())

    report_path = raw_dir / "availability_report_summary.json"
    save_json(report, report_path)
    print(json.dumps(report, indent=2))
    print(f"Wrote availability rows to {availability_path}")
    print(f"Wrote availability summary to {report_path}")


if __name__ == "__main__":
    main()
