from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.utils.dates import parse_mixed_utc_datetime


SNAPSHOT_COLUMNS = [
    "match_id",
    "timestamp",
    "sportsbook",
    "market_type",
    "line",
    "home_odds",
    "draw_odds",
    "away_odds",
    "over_odds",
    "under_odds",
    "source_type",
]

SNAPSHOT_KEY_COLUMNS = [
    column for column in SNAPSHOT_COLUMNS if column != "source_type"
]


LIVE_SOURCE_TYPES = ("current", "live", "open")


def _empty_snapshot_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=SNAPSHOT_COLUMNS)


def extract_live_snapshot_rows(
    odds: pd.DataFrame,
    live_source_types: tuple[str, ...] = LIVE_SOURCE_TYPES,
) -> pd.DataFrame:
    """Select the live (non-close) odds rows worth accumulating for CLV.

    A capture run records the *current* line stamped with wall-clock time so the
    open->close series builds up over repeated runs. Static "close" history rows
    (e.g. consensus closing averages) carry a single fixed timestamp and would
    only ever dedupe to themselves, so they are excluded here.
    """
    if odds is None or odds.empty or "source_type" not in odds.columns:
        return _empty_snapshot_frame()
    allowed = {value.lower() for value in live_source_types}
    mask = odds["source_type"].astype(str).str.lower().isin(allowed)
    live = odds.loc[mask].copy()
    for column in SNAPSHOT_COLUMNS:
        if column not in live.columns:
            live[column] = pd.NA
    return live.loc[:, SNAPSHOT_COLUMNS].reset_index(drop=True)


def append_snapshot_rows(existing: pd.DataFrame, incoming: pd.DataFrame) -> pd.DataFrame:
    frames = [frame for frame in [existing, incoming] if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame(columns=SNAPSHOT_COLUMNS)
    combined = pd.concat(frames, ignore_index=True, sort=False)
    for column in SNAPSHOT_COLUMNS:
        if column not in combined.columns:
            combined[column] = pd.NA
    combined["match_id"] = combined["match_id"].astype(str)
    combined = combined.drop_duplicates(subset=SNAPSHOT_KEY_COLUMNS, keep="last")
    combined = combined.sort_values(["timestamp", "match_id", "sportsbook", "market_type"])
    return combined.loc[:, SNAPSHOT_COLUMNS].reset_index(drop=True)


def append_snapshot_file(snapshot_path: Path, incoming_path: Path) -> pd.DataFrame:
    existing = pd.read_csv(snapshot_path) if snapshot_path.exists() else pd.DataFrame()
    incoming = pd.read_csv(incoming_path)
    combined = append_snapshot_rows(existing, incoming)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(snapshot_path, index=False)
    return combined


def materialize_closing_odds(
    matches: pd.DataFrame,
    snapshots: pd.DataFrame,
    *,
    max_hours_before_match: int = 168,
) -> pd.DataFrame:
    if matches.empty or snapshots.empty:
        return _empty_snapshot_frame()

    if "match_status" in matches.columns:
        match_status = matches["match_status"].astype(str).str.lower()
    else:
        match_status = pd.Series("completed", index=matches.index)
    completed = matches[match_status == "completed"].copy()
    completed["match_id"] = completed["match_id"].astype(str)
    if "match_datetime" in completed.columns:
        completed["match_cutoff"] = pd.to_datetime(completed["match_datetime"], utc=True, errors="coerce")
    else:
        match_date = completed["match_date"]
        completed["match_cutoff"] = pd.to_datetime(match_date, utc=True, errors="coerce")
        date_only = match_date.astype("string").str.fullmatch(r"\d{4}-\d{2}-\d{2}").fillna(False)
        completed.loc[date_only, "match_cutoff"] += pd.Timedelta(days=1) - pd.Timedelta(nanoseconds=1)

    frames = []
    snap = snapshots.copy()
    for column in SNAPSHOT_COLUMNS:
        if column not in snap.columns:
            snap[column] = pd.NA
    snap["match_id"] = snap["match_id"].astype(str)
    snap["timestamp_dt"] = parse_mixed_utc_datetime(snap["timestamp"])
    for match in completed.itertuples(index=False):
        if pd.isna(match.match_cutoff):
            continue
        candidates = snap[snap["match_id"] == str(match.match_id)].copy()
        candidates = candidates[candidates["timestamp_dt"].notna()]
        candidates = candidates[candidates["timestamp_dt"] <= match.match_cutoff]
        candidates = candidates[
            candidates["timestamp_dt"] >= match.match_cutoff - pd.Timedelta(hours=max_hours_before_match)
        ]
        if candidates.empty:
            continue
        latest_timestamp = candidates["timestamp_dt"].max()
        latest = candidates[candidates["timestamp_dt"] == latest_timestamp].copy()
        latest["source_type"] = "close"
        frames.append(latest.drop(columns=["timestamp_dt"]))
    if not frames:
        return _empty_snapshot_frame()
    close = pd.concat(frames, ignore_index=True, sort=False)
    return close.loc[:, SNAPSHOT_COLUMNS].reset_index(drop=True)
