"""Operational freshness and source-readiness checks for current odds."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pandas as pd

from src.utils.dates import parse_mixed_utc_datetime


def filter_fresh_current_rows(
    odds: pd.DataFrame,
    *,
    now: datetime | None = None,
    max_age_minutes: int = 180,
    max_future_skew_minutes: int = 15,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Remove stale/invalid current rows while preserving historical evidence."""
    current_time = pd.Timestamp(now or datetime.now(UTC))
    if current_time.tzinfo is None:
        current_time = current_time.tz_localize("UTC")
    else:
        current_time = current_time.tz_convert("UTC")

    frame = odds.copy()
    if frame.empty:
        return frame, {
            "generated_at": current_time.isoformat(),
            "max_age_minutes": int(max_age_minutes),
            "current_rows_before": 0,
            "current_rows_after": 0,
            "removed_rows": 0,
            "removed_by_reason": {},
            "removed_by_sportsbook": {},
            "sample_removed_match_ids": [],
        }

    source_type = frame.get(
        "source_type", pd.Series("", index=frame.index)
    ).astype(str).str.lower()
    current_mask = source_type.eq("current")
    timestamps = (
        parse_mixed_utc_datetime(frame["timestamp"])
        if "timestamp" in frame.columns
        else pd.Series(pd.NaT, index=frame.index, dtype="datetime64[ns, UTC]")
    )
    age_minutes = (current_time - timestamps).dt.total_seconds() / 60.0
    invalid_mask = current_mask & timestamps.isna()
    future_mask = current_mask & age_minutes.lt(-float(max_future_skew_minutes))
    stale_mask = current_mask & age_minutes.gt(float(max_age_minutes))
    remove_mask = invalid_mask | future_mask | stale_mask

    reasons = pd.Series("", index=frame.index, dtype="string")
    reasons.loc[invalid_mask] = "invalid_timestamp"
    reasons.loc[future_mask] = "future_timestamp"
    reasons.loc[stale_mask] = "stale_timestamp"
    removed = frame.loc[remove_mask].copy()
    removed["removal_reason"] = reasons.loc[remove_mask]
    cleaned = frame.loc[~remove_mask].copy().reset_index(drop=True)

    report = {
        "generated_at": current_time.isoformat(),
        "max_age_minutes": int(max_age_minutes),
        "max_future_skew_minutes": int(max_future_skew_minutes),
        "current_rows_before": int(current_mask.sum()),
        "current_rows_after": int(
            cleaned.get("source_type", pd.Series(dtype=str))
            .astype(str)
            .str.lower()
            .eq("current")
            .sum()
        ),
        "removed_rows": int(remove_mask.sum()),
        "removed_by_reason": {
            str(key): int(value)
            for key, value in removed.get(
                "removal_reason", pd.Series(dtype=str)
            ).value_counts().items()
        },
        "removed_by_sportsbook": {
            str(key): int(value)
            for key, value in removed.get(
                "sportsbook", pd.Series(dtype=str)
            ).value_counts().items()
        },
        "sample_removed_match_ids": removed.get(
            "match_id", pd.Series(dtype=str)
        ).astype(str).drop_duplicates().head(10).tolist(),
    }
    return cleaned, report


def _fresh_total_rows(
    frame: pd.DataFrame | None,
    *,
    source_types: set[str],
    current_time: pd.Timestamp,
    max_age_minutes: int,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    if frame is None or frame.empty:
        empty = pd.DataFrame()
        return empty, {
            "rows": 0,
            "fresh_rows": 0,
            "stale_rows": 0,
            "matches": 0,
            "sportsbooks": [],
            "latest_timestamp": None,
        }

    data = frame.copy()
    source = data.get("source_type", pd.Series("", index=data.index)).astype(str).str.lower()
    market = data.get("market_type", pd.Series("", index=data.index)).astype(str).str.lower()
    totals = data[source.isin(source_types) & market.eq("total")].copy()
    if totals.empty:
        return totals, {
            "rows": 0,
            "fresh_rows": 0,
            "stale_rows": 0,
            "matches": 0,
            "sportsbooks": [],
            "latest_timestamp": None,
        }

    totals["timestamp_dt"] = parse_mixed_utc_datetime(totals["timestamp"])
    ages = (current_time - totals["timestamp_dt"]).dt.total_seconds() / 60.0
    fresh_mask = totals["timestamp_dt"].notna() & ages.ge(-15) & ages.le(max_age_minutes)
    fresh = totals.loc[fresh_mask].copy()
    latest = totals["timestamp_dt"].max()
    summary = {
        "rows": int(len(totals)),
        "fresh_rows": int(len(fresh)),
        "stale_rows": int(len(totals) - len(fresh)),
        "matches": int(fresh.get("match_id", pd.Series(dtype=str)).astype(str).nunique()),
        "sportsbooks": sorted(
            fresh.get("sportsbook", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()
        ),
        "latest_timestamp": latest.isoformat() if pd.notna(latest) else None,
    }
    return fresh, summary


def build_odds_source_health_report(
    upcoming: pd.DataFrame,
    authoritative_odds: pd.DataFrame | None,
    shadow_current: pd.DataFrame | None,
    shadow_snapshots: pd.DataFrame | None,
    *,
    shadow_status: dict[str, Any] | None = None,
    unmatched_count: int = 0,
    now: datetime | None = None,
    max_age_minutes: int = 180,
) -> dict[str, Any]:
    current_time = pd.Timestamp(now or datetime.now(UTC))
    if current_time.tzinfo is None:
        current_time = current_time.tz_localize("UTC")
    else:
        current_time = current_time.tz_convert("UTC")

    authoritative_fresh, authoritative_summary = _fresh_total_rows(
        authoritative_odds,
        source_types={"current", "live"},
        current_time=current_time,
        max_age_minutes=max_age_minutes,
    )
    shadow_fresh, shadow_summary = _fresh_total_rows(
        shadow_current,
        source_types={"shadow"},
        current_time=current_time,
        max_age_minutes=max_age_minutes,
    )

    schedule = upcoming.copy()
    schedule["match_id"] = schedule.get(
        "match_id", pd.Series(dtype=str)
    ).astype(str)
    schedule["match_date_dt"] = pd.to_datetime(
        schedule.get("match_date"), errors="coerce"
    ).dt.date
    window_end = current_time.date() + pd.Timedelta(days=3)
    near_term = schedule[
        schedule["match_date_dt"].ge(current_time.date())
        & schedule["match_date_dt"].le(window_end)
    ]
    near_term_ids = set(near_term["match_id"].astype(str))
    authoritative_ids = set(authoritative_fresh.get("match_id", pd.Series(dtype=str)).astype(str))
    shadow_ids = set(shadow_fresh.get("match_id", pd.Series(dtype=str)).astype(str))
    fox_ids = set(
        authoritative_fresh[
            authoritative_fresh.get(
                "sportsbook", pd.Series("", index=authoritative_fresh.index)
            ).astype(str).eq("FoxSports")
        ].get("match_id", pd.Series(dtype=str)).astype(str)
    )
    coverage_vs_fox = (
        len(shadow_ids.intersection(fox_ids)) / len(fox_ids) * 100.0
        if fox_ids
        else 0.0
    )

    snapshots = shadow_snapshots.copy() if shadow_snapshots is not None else pd.DataFrame()
    if not snapshots.empty:
        snapshots["timestamp_dt"] = parse_mixed_utc_datetime(snapshots["timestamp"])
        valid_snapshot_times = snapshots["timestamp_dt"].dropna()
        observation_days = (
            int(valid_snapshot_times.dt.date.nunique())
            if not valid_snapshot_times.empty
            else 0
        )
        observed_matches = int(snapshots["match_id"].astype(str).nunique())
        observed_books = int(snapshots["sportsbook"].astype(str).nunique())
    else:
        observation_days = 0
        observed_matches = 0
        observed_books = 0

    provider_status = str((shadow_status or {}).get("status") or "missing")
    fresh_ratio = (
        shadow_summary["fresh_rows"] / shadow_summary["rows"]
        if shadow_summary["rows"]
        else 0.0
    )
    thresholds = {
        "provider_status": "ok",
        "minimum_observation_days": 7,
        "minimum_observed_matches": 5,
        "minimum_sportsbooks": 2,
        "minimum_coverage_vs_fox_pct": 90.0,
        "maximum_unmatched_rows": 0,
        "minimum_fresh_row_ratio": 1.0,
    }
    reasons: list[str] = []
    if provider_status != "ok":
        reasons.append("provider_status_not_ok")
    if observation_days < thresholds["minimum_observation_days"]:
        reasons.append("insufficient_observation_days")
    if observed_matches < thresholds["minimum_observed_matches"]:
        reasons.append("insufficient_observed_matches")
    if observed_books < thresholds["minimum_sportsbooks"]:
        reasons.append("insufficient_sportsbooks")
    if coverage_vs_fox < thresholds["minimum_coverage_vs_fox_pct"]:
        reasons.append("coverage_vs_fox_below_threshold")
    if int(unmatched_count) > thresholds["maximum_unmatched_rows"]:
        reasons.append("unmatched_rows_present")
    if fresh_ratio < thresholds["minimum_fresh_row_ratio"]:
        reasons.append("stale_or_missing_shadow_rows")

    authoritative_summary["status"] = (
        "healthy"
        if authoritative_summary["fresh_rows"] > 0
        else "unavailable"
    )
    shadow_summary["provider_status"] = provider_status
    shadow_summary["status"] = (
        "healthy"
        if provider_status == "ok" and shadow_summary["fresh_rows"] > 0
        else "degraded"
        if shadow_summary["rows"] > 0
        else "unavailable"
    )

    return {
        "generated_at": current_time.isoformat(),
        "max_age_minutes": int(max_age_minutes),
        "authoritative": authoritative_summary,
        "api_football_shadow": shadow_summary,
        "coverage": {
            "near_term_schedule_matches": int(len(near_term_ids)),
            "authoritative_near_term_matches": int(
                len(near_term_ids.intersection(authoritative_ids))
            ),
            "shadow_near_term_matches": int(
                len(near_term_ids.intersection(shadow_ids))
            ),
            "fox_priced_matches": int(len(fox_ids)),
            "shadow_matches_overlapping_fox": int(
                len(shadow_ids.intersection(fox_ids))
            ),
            "coverage_vs_fox_pct": round(float(coverage_vs_fox), 2),
        },
        "promotion_gate": {
            "lane": "shadow_only",
            "automatic_promotion": False,
            "ready_for_manual_review": not reasons,
            "reasons": reasons,
            "thresholds": thresholds,
            "observed": {
                "observation_days": observation_days,
                "matches": observed_matches,
                "sportsbooks": observed_books,
                "unmatched_rows": int(unmatched_count),
                "fresh_row_ratio": round(float(fresh_ratio), 4),
                "coverage_vs_fox_pct": round(float(coverage_vs_fox), 2),
            },
        },
    }
