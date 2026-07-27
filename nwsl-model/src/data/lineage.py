"""Daily data-lineage gates shared by frozen and general model lanes."""

from __future__ import annotations

from typing import Any

import pandas as pd


def build_daily_lineage_quality(
    *,
    espn_matches: list[dict[str, Any]],
    completed: pd.DataFrame,
    upcoming: pd.DataFrame,
    manifest: dict[str, Any],
) -> dict[str, Any]:
    completed_espn = [
        row
        for row in espn_matches
        if str(row.get("status", "")).lower() == "completed"
    ]
    latest_espn_date = max(
        (str(row.get("date")) for row in completed_espn),
        default=None,
    )
    latest_raw_date = (
        str(pd.to_datetime(completed["match_date"]).max().date())
        if not completed.empty and "match_date" in completed.columns
        else None
    )
    completed_ids = (
        set(completed["match_id"].astype(str))
        if not completed.empty and "match_id" in completed.columns
        else set()
    )
    upcoming_ids = (
        set(upcoming["match_id"].astype(str))
        if not upcoming.empty and "match_id" in upcoming.columns
        else set()
    )
    overlap = sorted(completed_ids & upcoming_ids)
    xg_season = (
        manifest.get("asa", {})
        .get("coverage_by_season", {})
        .get("2026", {})
    )
    fallback_ids = [
        str(value) for value in xg_season.get("fallback_match_ids", [])
    ]

    blockers: list[str] = []
    if latest_raw_date != latest_espn_date:
        blockers.append("raw_completed_max_date_does_not_match_espn")
    if overlap:
        blockers.append("completed_upcoming_match_ids_overlap")
    if not xg_season:
        blockers.append("asa_2026_coverage_missing")

    return {
        "status": "ready" if not blockers else "blocked",
        "blockers": blockers,
        "completed_matches": {
            "latest_espn_date": latest_espn_date,
            "latest_raw_date": latest_raw_date,
            "raw_rows": int(len(completed)),
        },
        "fixture_identity": {
            "completed_ids": len(completed_ids),
            "upcoming_ids": len(upcoming_ids),
            "overlap_match_ids": overlap,
        },
        "asa_xg_2026": {
            "covered_matches": int(xg_season.get("covered_matches", 0)),
            "reference_matches": int(xg_season.get("reference_matches", 0)),
            "coverage_pct": float(xg_season.get("coverage_pct", 0.0)),
            "fallback_match_ids": fallback_ids,
        },
        "source_manifest_generated_at": manifest.get("generated_at"),
    }
