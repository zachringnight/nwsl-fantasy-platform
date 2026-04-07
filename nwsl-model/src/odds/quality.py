"""Odds coverage and readiness reporting."""

from __future__ import annotations

from datetime import datetime, timezone

UTC = timezone.utc
from typing import Any

import pandas as pd


def build_odds_quality_report(
    matches: pd.DataFrame,
    odds: pd.DataFrame | None,
    stale_line_minutes: int = 180,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Summarize odds coverage and operational quality."""
    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    report: dict[str, Any] = {
        "generated_at": current_time.isoformat(),
        "source_available": False,
        "total_rows": 0,
        "sportsbooks": [],
        "markets": [],
        "coverage_by_season": {},
        "close_coverage_pct": {"1x2": 0.0, "total": 0.0},
        "current_price_health": {
            "rows": 0,
            "fresh_rows": 0,
            "stale_rows": 0,
            "stale_pct": 0.0,
        },
        "excluded_backtest_matches": {"count": int(len(matches)), "sample_match_ids": matches["match_id"].astype(str).head(10).tolist()},
    }

    if odds is None or odds.empty:
        return report

    odds = odds.copy()
    odds["match_id"] = odds["match_id"].astype(str)
    odds["source_type"] = odds["source_type"].astype(str).str.lower()
    odds["market_type"] = odds["market_type"].astype(str).str.lower()
    if "timestamp" in odds.columns:
        odds["timestamp"] = pd.to_datetime(odds["timestamp"], utc=True, errors="coerce")

    report["source_available"] = True
    report["total_rows"] = int(len(odds))
    report["sportsbooks"] = sorted(odds["sportsbook"].dropna().astype(str).unique().tolist())
    report["markets"] = sorted(odds["market_type"].dropna().astype(str).unique().tolist())

    matches = matches.copy()
    matches["match_id"] = matches["match_id"].astype(str)
    matches["season"] = pd.to_numeric(matches["season"], errors="coerce").astype("Int64")

    close_rows = odds[odds["source_type"] == "close"].copy()
    close_1x2 = close_rows[close_rows["market_type"] == "1x2"]
    close_total = close_rows[close_rows["market_type"] == "total"]
    total_matches = max(int(matches["match_id"].nunique()), 1)
    report["close_coverage_pct"] = {
        "1x2": round(float(close_1x2["match_id"].nunique() / total_matches * 100), 2),
        "total": round(float(close_total["match_id"].nunique() / total_matches * 100), 2),
    }

    close_1x2_ids = set(close_1x2["match_id"].tolist())
    close_total_ids = set(close_total["match_id"].tolist())
    excluded = matches[
        ~matches["match_id"].isin(close_1x2_ids.intersection(close_total_ids))
    ]["match_id"].astype(str)
    report["excluded_backtest_matches"] = {
        "count": int(len(excluded)),
        "sample_match_ids": excluded.head(10).tolist(),
    }

    coverage_by_season: dict[str, Any] = {}
    for season, group in matches.groupby("season", dropna=False):
        if pd.isna(season):
            continue
        match_ids = set(group["match_id"].tolist())
        coverage_by_season[str(int(season))] = {
            "matches": int(len(match_ids)),
            "close_1x2_matches": int(len(match_ids.intersection(close_1x2_ids))),
            "close_total_matches": int(len(match_ids.intersection(close_total_ids))),
            "close_1x2_pct": round(float(len(match_ids.intersection(close_1x2_ids)) / max(len(match_ids), 1) * 100), 2),
            "close_total_pct": round(float(len(match_ids.intersection(close_total_ids)) / max(len(match_ids), 1) * 100), 2),
        }
    report["coverage_by_season"] = coverage_by_season

    current_rows = odds[odds["source_type"] == "current"].copy()
    if not current_rows.empty and "timestamp" in current_rows.columns:
        age_minutes = (current_time - current_rows["timestamp"]).dt.total_seconds() / 60.0
        fresh_rows = current_rows[age_minutes <= stale_line_minutes]
        report["current_price_health"] = {
            "rows": int(len(current_rows)),
            "fresh_rows": int(len(fresh_rows)),
            "stale_rows": int(len(current_rows) - len(fresh_rows)),
            "stale_pct": round(float((len(current_rows) - len(fresh_rows)) / max(len(current_rows), 1) * 100), 2),
        }

    return report
