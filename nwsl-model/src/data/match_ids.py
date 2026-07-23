"""Match ID crosswalks between official NWSL and model fixtures."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from src.data.team_names import normalize_team_key

TEAM_KEY_ALIASES = {
    "angel city": "angel city fc",
    "bay": "bay fc",
    "boston legacy": "boston legacy fc",
    "chicago red stars": "chicago stars fc",
    "chicago stars": "chicago stars fc",
    "current": "kansas city current",
    "denver summit": "denver summit fc",
    "kc current": "kansas city current",
    "nc courage": "north carolina courage",
    "portland thorns": "portland thorns fc",
    "racing louisville": "racing louisville fc",
    "reign": "seattle reign fc",
    "royals": "utah royals",
    "sd wave": "san diego wave fc",
    "san diego wave": "san diego wave fc",
    "seattle reign": "seattle reign fc",
    "utah royals": "utah royals",
}


def model_team_key(value: Any) -> str:
    """Normalize source-specific team labels to a common matching key."""
    key = normalize_team_key(str(value or ""))
    return TEAM_KEY_ALIASES.get(key, key)


def _resolve_path(value: str | Path | None) -> Path | None:
    if value is None or not str(value).strip():
        return None
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def load_official_match_archive(official_matches_dir: str | Path | None) -> pd.DataFrame:
    """Load official NWSL match archive files if available."""
    official_dir = _resolve_path(official_matches_dir)
    if official_dir is None or not official_dir.exists():
        return pd.DataFrame()

    frames = [
        pd.read_csv(path)
        for path in sorted(official_dir.glob("nwsl_*_official_matches.csv"))
    ]
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def build_match_id_crosswalk(
    model_matches: pd.DataFrame,
    official_matches: pd.DataFrame,
    *,
    max_date_delta_days: int = 1,
) -> pd.DataFrame:
    """Build a deterministic official match_id -> model match_id crosswalk."""
    columns = [
        "official_match_id",
        "model_match_id",
        "season",
        "date_delta_days",
        "score_match",
        "official_match_date_utc",
        "official_match_date_local",
        "model_match_date",
        "official_home_team",
        "official_away_team",
        "model_home_team",
        "model_away_team",
    ]
    if model_matches.empty or official_matches.empty:
        return pd.DataFrame(columns=columns)

    required_model = {"match_id", "match_date", "season", "home_team", "away_team"}
    required_official = {
        "match_id",
        "season",
        "match_date_utc",
        "match_date_local",
        "home_official_name",
        "away_official_name",
    }
    if not required_model.issubset(model_matches.columns) or not required_official.issubset(official_matches.columns):
        return pd.DataFrame(columns=columns)

    model = model_matches.copy()
    model["model_match_id"] = model["match_id"].astype(str)
    model["season"] = pd.to_numeric(model["season"], errors="coerce").astype("Int64")
    model["model_match_date"] = pd.to_datetime(model["match_date"], errors="coerce").dt.date
    model["home_key"] = model["home_team"].map(model_team_key)
    model["away_key"] = model["away_team"].map(model_team_key)
    for column in ("home_goals_90", "away_goals_90"):
        if column in model.columns:
            model[column] = pd.to_numeric(model[column], errors="coerce")
        else:
            model[column] = pd.NA
    model = model.dropna(subset=["season", "model_match_date", "home_key", "away_key"])

    official = official_matches.copy()
    official["official_match_id"] = official["match_id"].astype(str)
    official["season"] = pd.to_numeric(official["season"], errors="coerce").astype("Int64")
    official["official_match_date_utc"] = pd.to_datetime(official["match_date_utc"], errors="coerce", utc=True).dt.date
    official["official_match_date_local"] = pd.to_datetime(official["match_date_local"], errors="coerce").dt.date
    official["home_key"] = official["home_official_name"].map(model_team_key)
    official["away_key"] = official["away_official_name"].map(model_team_key)
    for column in ("home_score", "away_score"):
        if column in official.columns:
            official[column] = pd.to_numeric(official[column], errors="coerce")
        else:
            official[column] = pd.NA
    official = official.dropna(subset=["season", "home_key", "away_key"])

    merged = official.merge(
        model,
        on=["season", "home_key", "away_key"],
        how="inner",
        suffixes=("_official", "_model"),
    )
    if merged.empty:
        return pd.DataFrame(columns=columns)

    utc_delta = (pd.to_datetime(merged["model_match_date"]) - pd.to_datetime(merged["official_match_date_utc"])).abs().dt.days
    local_delta = (pd.to_datetime(merged["model_match_date"]) - pd.to_datetime(merged["official_match_date_local"])).abs().dt.days
    merged["date_delta_days"] = pd.concat([utc_delta, local_delta], axis=1).min(axis=1)
    merged = merged[merged["date_delta_days"].le(max_date_delta_days)].copy()
    if merged.empty:
        return pd.DataFrame(columns=columns)

    score_available = (
        merged["home_score"].notna()
        & merged["away_score"].notna()
        & merged["home_goals_90"].notna()
        & merged["away_goals_90"].notna()
    )
    merged["score_match"] = (
        (merged["home_score"] == merged["home_goals_90"])
        & (merged["away_score"] == merged["away_goals_90"])
    )
    merged = merged[(~score_available) | merged["score_match"]].copy()
    if merged.empty:
        return pd.DataFrame(columns=columns)

    merged = merged.sort_values(
        [
            "official_match_id",
            "date_delta_days",
            "score_match",
            "model_match_date",
            "model_match_id",
        ],
        ascending=[True, True, False, True, True],
    )
    crosswalk = merged.drop_duplicates("official_match_id", keep="first").copy()
    crosswalk = crosswalk.sort_values(
        ["model_match_id", "date_delta_days", "score_match"],
        ascending=[True, True, False],
    ).drop_duplicates("model_match_id", keep="first")

    output = pd.DataFrame(
        {
            "official_match_id": crosswalk["official_match_id"].astype(str),
            "model_match_id": crosswalk["model_match_id"].astype(str),
            "season": crosswalk["season"].astype(int),
            "date_delta_days": crosswalk["date_delta_days"].astype(int),
            "score_match": crosswalk["score_match"].astype(bool),
            "official_match_date_utc": crosswalk["official_match_date_utc"].astype(str),
            "official_match_date_local": crosswalk["official_match_date_local"].astype(str),
            "model_match_date": crosswalk["model_match_date"].astype(str),
            "official_home_team": crosswalk["home_official_name"].astype(str),
            "official_away_team": crosswalk["away_official_name"].astype(str),
            "model_home_team": crosswalk["home_team"].astype(str),
            "model_away_team": crosswalk["away_team"].astype(str),
        }
    )
    return output[columns].sort_values(["season", "model_match_date", "model_match_id"]).reset_index(drop=True)


def apply_official_match_id_crosswalk(
    frame: pd.DataFrame | None,
    model_matches: pd.DataFrame,
    official_matches_dir: str | Path | None,
) -> pd.DataFrame | None:
    """Map official match IDs and team labels in a frame to model fixture IDs."""
    if frame is None or frame.empty or "match_id" not in frame.columns:
        return frame

    official = load_official_match_archive(official_matches_dir)
    crosswalk = build_match_id_crosswalk(model_matches, official)
    if crosswalk.empty:
        return frame

    output = frame.copy()
    output["match_id"] = output["match_id"].astype(str)
    known_model_ids = set(model_matches["match_id"].astype(str)) if "match_id" in model_matches.columns else set()

    mapped = output.merge(
        crosswalk,
        left_on="match_id",
        right_on="official_match_id",
        how="left",
        suffixes=("", "_crosswalk"),
    )
    needs_mapping = ~mapped["match_id"].isin(known_model_ids)
    has_mapping = mapped["model_match_id"].notna()
    mapped.loc[needs_mapping & has_mapping, "match_id"] = mapped.loc[needs_mapping & has_mapping, "model_match_id"]

    if "team" in mapped.columns:
        team_key = mapped["team"].map(model_team_key)
        home_key = mapped["official_home_team"].map(model_team_key)
        away_key = mapped["official_away_team"].map(model_team_key)
        mapped.loc[has_mapping & team_key.eq(home_key), "team"] = mapped.loc[has_mapping & team_key.eq(home_key), "model_home_team"]
        mapped.loc[has_mapping & team_key.eq(away_key), "team"] = mapped.loc[has_mapping & team_key.eq(away_key), "model_away_team"]

    helper_cols = [column for column in crosswalk.columns if column in mapped.columns and column not in output.columns]
    helper_cols.extend(
        column
        for column in mapped.columns
        if column.endswith("_crosswalk") and column not in output.columns
    )
    return mapped.drop(columns=helper_cols)
