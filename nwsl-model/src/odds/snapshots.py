from __future__ import annotations

from pathlib import Path

import pandas as pd


SNAPSHOT_KEY_COLUMNS = [
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
]


def append_snapshot_rows(existing: pd.DataFrame, incoming: pd.DataFrame) -> pd.DataFrame:
    frames = [frame for frame in [existing, incoming] if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True, sort=False)
    for column in SNAPSHOT_KEY_COLUMNS:
        if column not in combined.columns:
            combined[column] = pd.NA
    combined["match_id"] = combined["match_id"].astype(str)
    combined = combined.drop_duplicates(subset=SNAPSHOT_KEY_COLUMNS, keep="last")
    return combined.sort_values(["timestamp", "match_id", "sportsbook", "market_type"]).reset_index(drop=True)


def append_snapshot_file(snapshot_path: Path, incoming_path: Path) -> pd.DataFrame:
    existing = pd.read_csv(snapshot_path) if snapshot_path.exists() else pd.DataFrame()
    incoming = pd.read_csv(incoming_path)
    combined = append_snapshot_rows(existing, incoming)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(snapshot_path, index=False)
    return combined
