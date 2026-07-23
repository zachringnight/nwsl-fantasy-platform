"""Deterministic builders for nwsl-model raw datasets."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

UTC = timezone.utc
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.data.asa import (
    ASADatasets,
    fetch_asa_datasets,
    load_asa_datasets,
    normalize_person_key,
    write_asa_datasets,
)
from src.data.team_names import canonicalize_team_name
from src.odds.quality import build_odds_quality_report
from src.utils.io import save_csv, save_json

ODDS_OUTPUT_COLUMNS = [
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

ROOT_REPO = Path(__file__).resolve().parents[3]
MODEL_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = MODEL_ROOT / "data" / "raw"


@dataclass
class BuildOutputs:
    matches: pd.DataFrame
    appearances: pd.DataFrame
    projected_lineups: pd.DataFrame
    team_season_priors: pd.DataFrame
    player_season_priors: pd.DataFrame
    asa_match_xgoals: pd.DataFrame
    asa_team_analytics: pd.DataFrame
    asa_player_analytics: pd.DataFrame
    odds: pd.DataFrame
    odds_quality_report: dict[str, Any]
    refresh_manifest: dict[str, Any]
    manifest: dict[str, Any]


def _filter_frame_by_season(
    frame: pd.DataFrame,
    history_start_season: int | None,
    season_col: str = "season",
) -> pd.DataFrame:
    if history_start_season is None or frame.empty or season_col not in frame.columns:
        return frame
    seasons = pd.to_numeric(frame[season_col], errors="coerce")
    return frame.loc[seasons.ge(history_start_season).fillna(False)].copy()


def _load_official_match_frames(repo_root: Path) -> list[pd.DataFrame]:
    official_dir = repo_root / "data" / "nwsl-official"
    return [
        pd.read_csv(path)
        for path in sorted(official_dir.glob("nwsl_*_official_matches.csv"))
    ]


def _load_official_player_stat_frames(repo_root: Path) -> list[pd.DataFrame]:
    official_dir = repo_root / "data" / "nwsl-official"
    return [
        pd.read_csv(path)
        for path in sorted(official_dir.glob("nwsl_*_official_player_stats.csv"))
    ]


def _load_official_team_stat_frames(repo_root: Path) -> list[pd.DataFrame]:
    official_dir = repo_root / "data" / "nwsl-official"
    return [
        pd.read_csv(path)
        for path in sorted(official_dir.glob("nwsl_*_official_team_stats.csv"))
    ]


def _is_regular_season(value: Any) -> bool:
    text = str(value or "").lower()
    if not text:
        return True
    playoff_markers = ("playoff", "semi", "quarter", "final", "championship", "challenge cup")
    return not any(marker in text for marker in playoff_markers)


def _numeric_series(frame: pd.DataFrame, candidates: list[str]) -> pd.Series:
    result: pd.Series | None = None
    for column in candidates:
        if column in frame.columns:
            numeric = pd.to_numeric(frame[column], errors="coerce")
            result = numeric if result is None else result.where(result.notna(), numeric)
    return result if result is not None else pd.Series(np.nan, index=frame.index, dtype=float)


def _string_series(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series([""] * len(frame), index=frame.index, dtype="object")
    return frame[column].fillna("").astype(str)


def _season_coverage(frame: pd.DataFrame, season_col: str = "season") -> list[int]:
    if frame.empty or season_col not in frame.columns:
        return []
    seasons = pd.to_numeric(frame[season_col], errors="coerce").dropna().astype(int)
    return sorted(seasons.unique().tolist())


def _latest_mtime(paths: list[Path]) -> str | None:
    mtimes = [path.stat().st_mtime for path in paths if path.exists()]
    if not mtimes:
        return None
    return datetime.fromtimestamp(max(mtimes), tz=UTC).isoformat()


def _source_batch(
    *,
    name: str,
    source: str,
    status: str,
    rows: int,
    season_coverage: list[int],
    source_confidence: float,
    provenance: dict[str, Any],
    freshness: dict[str, Any],
    output_files: list[str],
) -> dict[str, Any]:
    return {
        "name": name,
        "source": source,
        "status": status,
        "rows": int(rows),
        "season_coverage": season_coverage,
        "source_confidence": round(float(source_confidence), 2),
        "provenance": provenance,
        "freshness": freshness,
        "output_files": output_files,
    }


def _build_official_player_names(frame: pd.DataFrame) -> pd.Series:
    display_name = _string_series(frame, "display_name").str.strip()
    short_name = _string_series(frame, "short_name").str.strip()
    first_name = _string_series(frame, "media_first_name").str.strip()
    last_name = _string_series(frame, "media_last_name").str.strip()
    combined = (first_name + " " + last_name).str.replace(r"\s+", " ", regex=True).str.strip()
    fallback = short_name.where(short_name.ne(""), combined)
    return display_name.where(display_name.ne(""), fallback)


def build_matches(
    repo_root: Path = ROOT_REPO,
    asa_match_xgoals: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Materialize model-ready historical matches from repo archives."""
    frames = _load_official_match_frames(repo_root)
    if not frames:
        raise FileNotFoundError("No official match archives found under data/nwsl-official")

    matches = pd.concat(frames, ignore_index=True)
    matches = matches[matches["home_score"].notna() & matches["away_score"].notna()].copy()
    matches["match_date"] = pd.to_datetime(
        matches["match_date_utc"].fillna(matches["match_date_local"]),
        errors="coerce",
        utc=True,
    ).dt.date
    matches = matches[matches["match_date"].notna()].copy()
    matches["home_team"] = matches["home_official_name"].map(canonicalize_team_name)
    matches["away_team"] = matches["away_official_name"].map(canonicalize_team_name)
    matches["home_goals_90"] = matches["home_score"].fillna(0).astype(int)
    matches["away_goals_90"] = matches["away_score"].fillna(0).astype(int)
    matches["competition"] = "NWSL"
    matches["regular_season_flag"] = matches["round_name"].map(_is_regular_season)
    matches["venue"] = matches["stadium_name"].fillna(matches["city_name"])
    matches["stadium"] = matches["stadium_name"]
    matches["match_status"] = "completed"
    matches["resumed_flag"] = False
    matches["incomplete_flag"] = False
    matches["home_xg"] = _numeric_series(matches, ["home_xg", "home_expected_goals"])
    matches["away_xg"] = _numeric_series(matches, ["away_xg", "away_expected_goals"])
    matches["home_npxg"] = _numeric_series(matches, ["home_npxg", "home_non_penalty_xg"])
    matches["away_npxg"] = _numeric_series(matches, ["away_npxg", "away_non_penalty_xg"])
    matches["home_penalties"] = _numeric_series(matches, ["home_penalties", "home_penalty_goals", "home_penalty_kicks"])
    matches["away_penalties"] = _numeric_series(matches, ["away_penalties", "away_penalty_goals", "away_penalty_kicks"])

    statsbomb_path = repo_root / "data" / "statsbomb" / "nwsl_2018_match_team_xg.csv"
    if statsbomb_path.exists():
        statsbomb = pd.read_csv(statsbomb_path)
        statsbomb["match_date"] = pd.to_datetime(statsbomb["match_date"], errors="coerce").dt.date
        statsbomb["team"] = statsbomb["team"].map(canonicalize_team_name)
        xg_summary = (
            statsbomb.groupby(["match_date", "home_team", "away_team", "team"], as_index=False)["total_xg"]
            .sum()
        )
        xg_summary["home_team"] = xg_summary["home_team"].map(canonicalize_team_name)
        xg_summary["away_team"] = xg_summary["away_team"].map(canonicalize_team_name)

        home_xg = (
            xg_summary[xg_summary["team"] == xg_summary["home_team"]]
            .rename(columns={"total_xg": "home_xg"})
            [["match_date", "home_team", "away_team", "home_xg"]]
        )
        away_xg = (
            xg_summary[xg_summary["team"] == xg_summary["away_team"]]
            .rename(columns={"total_xg": "away_xg"})
            [["match_date", "home_team", "away_team", "away_xg"]]
        )
        matches = matches.merge(home_xg, on=["match_date", "home_team", "away_team"], how="left", suffixes=("", "_sb"))
        matches = matches.merge(away_xg, on=["match_date", "home_team", "away_team"], how="left", suffixes=("", "_sb"))
        for side in ("home", "away"):
            sb_col = f"{side}_xg_sb"
            if sb_col in matches.columns:
                matches[f"{side}_xg"] = matches[sb_col].combine_first(matches[f"{side}_xg"])
                matches.drop(columns=[sb_col], inplace=True)
        matches["home_npxg"] = matches["home_npxg"].combine_first(matches["home_xg"])
        matches["away_npxg"] = matches["away_npxg"].combine_first(matches["away_xg"])

    if asa_match_xgoals is not None and not asa_match_xgoals.empty:
        asa = asa_match_xgoals.copy()
        asa["season"] = pd.to_numeric(asa.get("season"), errors="coerce").astype("Int64")
        asa["match_date"] = pd.to_datetime(asa["match_date"], errors="coerce").dt.date
        asa["home_team"] = asa["home_team"].map(canonicalize_team_name)
        asa["away_team"] = asa["away_team"].map(canonicalize_team_name)
        asa = asa.dropna(subset=["season", "match_date", "home_team", "away_team"]).copy()
        for column in ("home_xg", "away_xg", "home_xg_players", "away_xg_players"):
            if column in asa.columns:
                asa[column] = pd.to_numeric(asa[column], errors="coerce")
        asa = (
            asa.sort_values(["season", "match_date", "home_team", "away_team"])
            .drop_duplicates(["season", "match_date", "home_team", "away_team"], keep="last")
        )
        matches = matches.merge(
            asa[
                [
                    "season",
                    "match_date",
                    "home_team",
                    "away_team",
                    "home_xg",
                    "away_xg",
                    "home_xg_players",
                    "away_xg_players",
                ]
            ],
            on=["season", "match_date", "home_team", "away_team"],
            how="left",
            suffixes=("", "_asa"),
        )
        for side in ("home", "away"):
            asa_col = f"{side}_xg_asa"
            player_col = f"{side}_xg_players"
            if asa_col in matches.columns:
                matches[f"{side}_xg"] = matches[f"{side}_xg"].combine_first(matches[asa_col]).combine_first(matches[player_col])
                matches[f"{side}_npxg"] = matches[f"{side}_npxg"].combine_first(matches[asa_col]).combine_first(matches[player_col])
                matches.drop(columns=[asa_col], inplace=True)
            if player_col in matches.columns:
                matches.drop(columns=[player_col], inplace=True)

    for side in ("home", "away"):
        matches[f"{side}_xg"] = matches[f"{side}_xg"].combine_first(matches[f"{side}_npxg"])
        matches[f"{side}_npxg"] = matches[f"{side}_npxg"].combine_first(matches[f"{side}_xg"])
        still_missing = matches[f"{side}_npxg"].isna()
        if still_missing.any():
            matches.loc[still_missing, f"{side}_npxg"] = matches.loc[still_missing, f"{side}_goals_90"].astype(float)

    output = matches[
        [
            "match_id",
            "match_date",
            "season",
            "competition",
            "regular_season_flag",
            "home_team",
            "away_team",
            "home_goals_90",
            "away_goals_90",
            "home_npxg",
            "away_npxg",
            "home_xg",
            "away_xg",
            "home_penalties",
            "away_penalties",
            "venue",
            "stadium",
            "match_status",
            "resumed_flag",
            "incomplete_flag",
        ]
    ].sort_values(["match_date", "match_id"])
    return output.reset_index(drop=True)


def build_appearances(repo_root: Path = ROOT_REPO) -> pd.DataFrame:
    """Build historical appearance rows from official per-match player logs.

    Reads every ``nwsl_*_official_player_match_logs.csv`` so multiple seasons
    accumulate rather than only the most recent one.
    """
    official_dir = repo_root / "data" / "nwsl-official"
    logs_paths = sorted(official_dir.glob("nwsl_*_official_player_match_logs.csv"))
    profiles_path = official_dir / "nwsl_2026_official_player_profiles.csv"
    empty_columns = [
        "match_id",
        "season",
        "player_id",
        "team",
        "start_minute",
        "end_minute",
        "started_flag",
        "position",
        "projected_flag",
        "available_flag",
        "injury_flag",
        "suspension_flag",
        "national_team_absence_flag",
    ]
    if not logs_paths:
        return pd.DataFrame(columns=empty_columns)

    logs = pd.concat([pd.read_csv(path) for path in logs_paths], ignore_index=True)
    logs = logs[logs["match_id"].notna()].copy()
    if "season" in logs.columns:
        logs["season"] = pd.to_numeric(logs["season"], errors="coerce").astype("Int64")
    else:
        logs["season"] = pd.NA
    logs["team"] = logs["team_name"].map(canonicalize_team_name)
    logs["player_id"] = logs["player_id"].astype(str)
    logs["started_flag"] = logs["gamestarted"].fillna(0).astype(float).gt(0)
    minutes_source = logs["minsplayed"] if "minsplayed" in logs.columns else pd.Series(index=logs.index, dtype=float)
    if "minutes" in logs.columns:
        minutes_source = minutes_source.fillna(logs["minutes"])
    minutes = minutes_source.fillna(0).astype(float)
    sub_on = logs["totalsubon"].fillna(0).astype(float)
    start_minute = np.where(logs["started_flag"], 0, np.where(sub_on > 0, sub_on, np.maximum(90 - minutes, 0)))
    end_minute = np.clip(start_minute + minutes, 0, 120)

    position_map: dict[str, str] = {}
    if profiles_path.exists():
        profiles = pd.read_csv(profiles_path)
        position_map = profiles.set_index("player_id")["role_label"].fillna("Unknown").to_dict()

    if "role_label" in logs.columns:
        position = logs["role_label"].fillna(logs["player_id"].map(position_map)).fillna("Unknown")
    else:
        position = logs["player_id"].map(position_map).fillna("Unknown")

    appearances = pd.DataFrame(
        {
            "match_id": logs["match_id"].astype(str),
            "season": logs["season"],
            "player_id": logs["player_id"],
            "team": logs["team"],
            "start_minute": start_minute.astype(int),
            "end_minute": np.maximum(end_minute, start_minute).astype(int),
            "started_flag": logs["started_flag"].astype(bool),
            "position": position,
            "projected_flag": False,
            "available_flag": True,
            "injury_flag": False,
            "suspension_flag": False,
            "national_team_absence_flag": False,
        }
    )
    return appearances.sort_values(["season", "match_id", "team", "player_id"]).reset_index(drop=True)


def build_player_season_priors(
    repo_root: Path = ROOT_REPO,
    asa_player_analytics: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Build canonical player season priors from official season stats."""
    frames = _load_official_player_stat_frames(repo_root)
    if not frames:
        return pd.DataFrame(
            columns=[
                "season",
                "player_id",
                "player_name",
                "player_name_key",
                "team",
                "position",
                "minutes_played",
                "games_played",
                "starts",
                "appearances",
                "substitute_on",
                "substitute_off",
                "goals",
                "assists",
                "xg",
                "shots",
                "shots_on_target",
                "minutes_per_appearance",
                "minutes_per_start",
                "starter_rate",
                "sub_on_rate",
                "role_proxy_score",
                "goal_actions_per90",
                "xg_per90",
                "shots_per90",
                "shots_on_target_per90",
                "asa_xgoals",
                "asa_xassists",
                "asa_points_added",
                "asa_xpoints_added",
                "asa_xg_plus_xa_per90",
                "asa_gplus_raw_total",
                "asa_gplus_above_avg_total",
                "asa_gplus_above_avg_per90",
                "season_value_score",
            ]
        )

    stats = pd.concat(frames, ignore_index=True).copy()
    stats["player_id"] = stats["player_id"].astype(str)
    stats["player_name"] = _build_official_player_names(stats)
    stats["player_name_key"] = stats["player_name"].map(normalize_person_key)
    stats["team"] = stats["team_official_name"].map(canonicalize_team_name)
    stats["position"] = stats.get("role_label", pd.Series(["Unknown"] * len(stats))).fillna("Unknown")
    stats["minutes_played"] = pd.to_numeric(stats.get("minutes_played"), errors="coerce").fillna(0.0)
    stats["games_played"] = pd.to_numeric(stats.get("games_played"), errors="coerce").fillna(0.0)
    stats["starts"] = _numeric_series(stats, ["starts"]).fillna(0.0)
    stats["appearances"] = _numeric_series(stats, ["appearances"]).fillna(stats["games_played"])
    stats["substitute_on"] = _numeric_series(stats, ["substitute_on"]).fillna(0.0)
    stats["substitute_off"] = _numeric_series(stats, ["substitute_off"]).fillna(0.0)
    stats["goals"] = pd.to_numeric(stats.get("goals"), errors="coerce").fillna(0.0)
    stats["assists"] = pd.to_numeric(stats.get("assists"), errors="coerce").fillna(0.0)
    raw_xg = pd.to_numeric(stats.get("xg"), errors="coerce")
    stats["xg"] = raw_xg.fillna(0.0)
    stats["shots"] = pd.to_numeric(stats.get("total_scoring_attempts"), errors="coerce").fillna(0.0)
    stats["shots_on_target"] = pd.to_numeric(stats.get("on_target_scoring_attempts"), errors="coerce").fillna(0.0)

    if asa_player_analytics is not None and not asa_player_analytics.empty:
        asa = asa_player_analytics.copy()
        asa["season"] = pd.to_numeric(asa.get("season"), errors="coerce").astype("Int64")
        asa["team"] = asa["team"].map(canonicalize_team_name)
        asa["player_name_key"] = asa["player_name_key"].fillna(asa["player_name"].map(normalize_person_key))
        merge_columns = [
            "season",
            "team",
            "player_name_key",
            "position",
            "minutes_played",
            "asa_xgoals",
            "asa_xassists",
            "asa_points_added",
            "asa_xpoints_added",
            "asa_xg_plus_xa_per90",
            "asa_gplus_raw_total",
            "asa_gplus_above_avg_total",
            "asa_gplus_above_avg_per90",
        ]
        stats = stats.merge(
            asa[merge_columns].rename(
                columns={
                    "position": "asa_position",
                    "minutes_played": "asa_minutes_played",
                }
            ),
            on=["season", "team", "player_name_key"],
            how="left",
        )
        stats = stats.copy()
        xg_missing = raw_xg.isna()
        stats.loc[xg_missing, "xg"] = stats.loc[xg_missing, "asa_xgoals"].fillna(stats.loc[xg_missing, "xg"])
        stats["position"] = stats["position"].replace("Unknown", pd.NA).fillna(stats.get("asa_position")).fillna("Unknown")
        stats["minutes_played"] = stats["minutes_played"].where(stats["minutes_played"] > 0, stats.get("asa_minutes_played", 0.0)).fillna(0.0)
        stats.drop(columns=[column for column in ("asa_position", "asa_minutes_played") if column in stats.columns], inplace=True)

    for column in (
        "asa_xgoals",
        "asa_xassists",
        "asa_points_added",
        "asa_xpoints_added",
        "asa_xg_plus_xa_per90",
        "asa_gplus_raw_total",
        "asa_gplus_above_avg_total",
        "asa_gplus_above_avg_per90",
    ):
        if column not in stats.columns:
            stats[column] = 0.0
        stats[column] = pd.to_numeric(stats[column], errors="coerce").fillna(0.0)

    minutes_90s = np.where(stats["minutes_played"] > 0, stats["minutes_played"] / 90.0, np.nan)
    stats["minutes_per_appearance"] = np.where(stats["appearances"] > 0, stats["minutes_played"] / stats["appearances"], 0.0)
    stats["minutes_per_start"] = np.where(stats["starts"] > 0, stats["minutes_played"] / stats["starts"], 0.0)
    stats["starter_rate"] = np.where(stats["appearances"] > 0, np.clip(stats["starts"] / stats["appearances"], 0.0, 1.0), 0.0)
    stats["sub_on_rate"] = np.where(stats["appearances"] > 0, np.clip(stats["substitute_on"] / stats["appearances"], 0.0, 1.0), 0.0)
    stats["goal_actions_per90"] = np.where(minutes_90s > 0, (stats["goals"] + stats["assists"]) / minutes_90s, 0.0)
    stats["xg_per90"] = np.where(minutes_90s > 0, stats["xg"] / minutes_90s, 0.0)
    stats["shots_per90"] = np.where(minutes_90s > 0, stats["shots"] / minutes_90s, 0.0)
    stats["shots_on_target_per90"] = np.where(minutes_90s > 0, stats["shots_on_target"] / minutes_90s, 0.0)
    minutes_share = np.where(stats["games_played"] > 0, np.clip(stats["minutes_played"] / (stats["games_played"] * 90.0), 0.0, 1.0), 0.0)
    base_value_score = (
        minutes_share * 0.45
        + np.clip(stats["goal_actions_per90"] / 1.2, 0.0, 1.0) * 0.25
        + np.clip(stats["xg_per90"] / 0.6, 0.0, 1.0) * 0.2
        + np.clip(stats["shots_per90"] / 4.0, 0.0, 1.0) * 0.1
    )
    asa_value_score = (
        np.clip(stats["asa_xg_plus_xa_per90"] / 0.8, 0.0, 1.0) * 0.6
        + np.clip((stats["asa_gplus_above_avg_per90"] + 0.15) / 0.5, 0.0, 1.0) * 0.4
    )
    asa_available = stats["asa_xg_plus_xa_per90"].gt(0) | stats["asa_gplus_above_avg_total"].ne(0)
    stats["season_value_score"] = np.where(
        asa_available,
        np.clip(base_value_score * 0.75 + asa_value_score * 0.25, 0.0, 1.0),
        np.clip(base_value_score, 0.0, 1.0),
    )
    stats["role_proxy_score"] = np.clip(
        stats["starter_rate"] * 0.45
        + np.clip(stats["minutes_per_appearance"] / 90.0, 0.0, 1.0) * 0.25
        + np.clip(stats["appearances"] / 20.0, 0.0, 1.0) * 0.15
        + stats["season_value_score"] * 0.15,
        0.0,
        1.0,
    )

    output = stats[
        [
            "season",
            "player_id",
            "player_name",
            "player_name_key",
            "team",
            "position",
            "minutes_played",
            "games_played",
            "starts",
            "appearances",
            "substitute_on",
            "substitute_off",
            "goals",
            "assists",
            "xg",
            "shots",
            "shots_on_target",
            "minutes_per_appearance",
            "minutes_per_start",
            "starter_rate",
            "sub_on_rate",
            "role_proxy_score",
            "goal_actions_per90",
            "xg_per90",
            "shots_per90",
            "shots_on_target_per90",
            "asa_xgoals",
            "asa_xassists",
            "asa_points_added",
            "asa_xpoints_added",
            "asa_xg_plus_xa_per90",
            "asa_gplus_raw_total",
            "asa_gplus_above_avg_total",
            "asa_gplus_above_avg_per90",
            "season_value_score",
        ]
    ].copy()
    return output.sort_values(["season", "team", "player_id"]).reset_index(drop=True)


def build_team_season_priors(
    repo_root: Path = ROOT_REPO,
    player_season_priors: pd.DataFrame | None = None,
    asa_team_analytics: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Build team season priors from official team stats plus player xG totals."""
    asa_columns = [
        "xg_against_per_match",
        "xpoints_per_match",
        "gplus_for_per90",
        "gplus_against_per90",
        "gplus_net_per90",
        "gplus_shooting_net_per90",
        "gplus_passing_net_per90",
        "gplus_receiving_net_per90",
    ]
    frames = _load_official_team_stat_frames(repo_root)
    if not frames:
        return pd.DataFrame(
            columns=[
                "season",
                "team",
                "games_played",
                "goals_per_match",
                "goals_against_per_match",
                "shots_per_match",
                "points_per_match",
                "average_possession",
                "xg_per_match",
                *asa_columns,
            ]
        )

    team_stats = pd.concat(frames, ignore_index=True).copy()
    team_stats["team"] = team_stats["official_name"].map(canonicalize_team_name)
    team_stats["games_played"] = pd.to_numeric(team_stats.get("games_played"), errors="coerce").fillna(0.0)
    for column in ("goals", "goals_against", "total_shots", "total_points", "average_possession"):
        team_stats[column] = pd.to_numeric(team_stats.get(column), errors="coerce").fillna(0.0)
    games = team_stats["games_played"].replace(0, np.nan)
    team_stats["goals_per_match"] = (team_stats["goals"] / games).fillna(0.0)
    team_stats["goals_against_per_match"] = (team_stats["goals_against"] / games).fillna(0.0)
    team_stats["shots_per_match"] = (team_stats["total_shots"] / games).fillna(0.0)
    team_stats["points_per_match"] = (team_stats["total_points"] / games).fillna(0.0)
    team_stats["average_possession"] = team_stats["average_possession"].fillna(0.0)

    output = team_stats[
        [
            "season",
            "team",
            "games_played",
            "goals_per_match",
            "goals_against_per_match",
            "shots_per_match",
            "points_per_match",
            "average_possession",
        ]
    ].copy()

    priors = player_season_priors if player_season_priors is not None else build_player_season_priors(repo_root)
    output["xg_per_match"] = 0.0
    if not priors.empty:
        team_xg = (
            priors.groupby(["season", "team"], as_index=False)
            .agg({"xg": "sum"})
            .rename(columns={"xg": "season_total_xg"})
        )
        output = output.merge(team_xg, on=["season", "team"], how="left")
        output["xg_per_match"] = np.where(
            output["games_played"] > 0,
            output["season_total_xg"].fillna(0.0) / output["games_played"],
            0.0,
        )
        output.drop(columns=["season_total_xg"], inplace=True)
    if asa_team_analytics is not None and not asa_team_analytics.empty:
        asa = asa_team_analytics.copy()
        asa["season"] = pd.to_numeric(asa.get("season"), errors="coerce").astype("Int64")
        asa["team"] = asa["team"].map(canonicalize_team_name)
        merge_columns = ["season", "team", "games_played", "xg_per_match", *asa_columns]
        available = [column for column in merge_columns if column in asa.columns]
        output = output.merge(
            asa[available].rename(columns={"games_played": "asa_games_played", "xg_per_match": "asa_xg_per_match"}),
            on=["season", "team"],
            how="left",
        )
        output = output.copy()
        if "asa_games_played" in output.columns:
            output["games_played"] = output["games_played"].where(output["games_played"] > 0, output["asa_games_played"]).fillna(0.0)
        if "asa_xg_per_match" in output.columns:
            output["xg_per_match"] = output["asa_xg_per_match"].combine_first(output["xg_per_match"]).fillna(0.0)
        for column in asa_columns:
            if column not in output.columns:
                output[column] = 0.0
            output[column] = pd.to_numeric(output[column], errors="coerce").fillna(0.0)
        output.drop(columns=[column for column in ("asa_games_played", "asa_xg_per_match") if column in output.columns], inplace=True)
    else:
        for column in asa_columns:
            output[column] = 0.0

    return output.sort_values(["season", "team"]).reset_index(drop=True)


def _compute_projected_starter_scores(
    logs: pd.DataFrame,
    last_season_priors: pd.DataFrame | None = None,
) -> pd.DataFrame:
    logs = logs.sort_values(["player_id", "match_date"]).copy()
    season_prior_lookup: dict[str, dict[str, float]] = {}
    if last_season_priors is not None and not last_season_priors.empty:
        latest_priors = (
            last_season_priors.sort_values(["player_id", "season"])
            .drop_duplicates("player_id", keep="last")
        )
        season_prior_lookup = latest_priors.set_index("player_id")[
            [
                "season_value_score",
                "minutes_played",
                "games_played",
                "xg_per90",
                "goal_actions_per90",
                "starter_rate",
                "minutes_per_appearance",
                "role_proxy_score",
            ]
        ].to_dict("index")

    rows: list[dict[str, Any]] = []
    for player_id, group in logs.groupby("player_id", sort=False):
        recent = group.tail(5)
        recent_apps = len(recent)
        starts_last_five = float(recent["started_flag"].sum())
        season_apps = len(group)
        season_start_rate = float(group["started_flag"].mean()) if season_apps else 0.0
        recent_minutes = float(recent["minsplayed"].fillna(0).mean()) if recent_apps else 0.0
        season_prior = season_prior_lookup.get(str(player_id), {})
        season_value_score = float(season_prior.get("season_value_score", 0.0) or 0.0)
        season_minutes = float(season_prior.get("minutes_played", 0.0) or 0.0)
        season_games = float(season_prior.get("games_played", 0.0) or 0.0)
        prior_starter_rate = float(season_prior.get("starter_rate", 0.0) or 0.0)
        prior_minutes_per_app = float(season_prior.get("minutes_per_appearance", 0.0) or 0.0)
        prior_role_proxy_score = float(season_prior.get("role_proxy_score", 0.0) or 0.0)
        current_component = (
            0.55 * (starts_last_five / max(recent_apps, 1))
            + 0.25 * season_start_rate
            + 0.20 * min(recent_minutes / 90.0, 1.0)
        )
        prior_component = (
            prior_role_proxy_score * 0.7
            + prior_starter_rate * 0.2
            + min(prior_minutes_per_app / 90.0, 1.0) * 0.1
        )
        current_reliability = min(recent_apps / 5.0, 1.0)
        score = (
            current_component * current_reliability
            + prior_component * (1.0 - current_reliability)
            + season_value_score * 0.05
        )
        rows.append(
            {
                "player_id": player_id,
                "team": canonicalize_team_name(group["team_name"].iloc[-1]),
                "recent_apps": recent_apps,
                "starts_last_five": starts_last_five,
                "season_start_rate": season_start_rate,
                "recent_minutes": recent_minutes,
                "starter_score": score,
                "season_value_score": season_value_score,
                "season_minutes": season_minutes,
                "season_games": season_games,
                "prior_starter_rate": prior_starter_rate,
                "prior_minutes_per_appearance": prior_minutes_per_app,
                "prior_role_proxy_score": prior_role_proxy_score,
            }
        )
    return pd.DataFrame(rows)


def _prior_component(priors: pd.DataFrame, season_label: str) -> pd.DataFrame:
    if priors.empty:
        return pd.DataFrame(columns=["player_id"])
    keep = [
        "player_id",
        "starter_rate",
        "minutes_per_appearance",
        "role_proxy_score",
        "season_value_score",
        "minutes_played",
        "appearances",
    ]
    available = [column for column in keep if column in priors.columns]
    output = priors[available].sort_values("player_id").drop_duplicates("player_id", keep="last").copy()
    return output.rename(
        columns={
            "starter_rate": f"{season_label}_starter_rate",
            "minutes_per_appearance": f"{season_label}_minutes_per_appearance",
            "role_proxy_score": f"{season_label}_role_proxy_score",
            "season_value_score": f"{season_label}_value_score",
            "minutes_played": f"{season_label}_minutes_played",
            "appearances": f"{season_label}_appearances",
        }
    )


def build_projected_lineups(repo_root: Path = ROOT_REPO, timestamp: str | None = None) -> pd.DataFrame:
    """Build upcoming projected lineups from official profiles and recent role signals."""
    matches_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_matches.csv"
    profiles_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_profiles.csv"
    logs_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv"
    if not matches_path.exists() or not profiles_path.exists():
        return pd.DataFrame(
            columns=[
                "match_id",
                "season",
                "team",
                "player_id",
                "projected_start",
                "projected_minutes",
                "status",
                "source",
                "report_timestamp",
            ]
        )

    matches = pd.read_csv(matches_path)
    if "season" in matches.columns:
        matches["season"] = pd.to_numeric(matches["season"], errors="coerce").astype("Int64")
    matches["match_date"] = pd.to_datetime(matches["match_date_utc"], errors="coerce", utc=True).dt.date
    upcoming = matches[
        matches["home_score"].isna() | matches["away_score"].isna() | ~matches["status"].astype(str).str.upper().isin({"FINISHED"})
    ].copy()
    if upcoming.empty:
        return pd.DataFrame(
            columns=[
                "match_id",
                "season",
                "team",
                "player_id",
                "projected_start",
                "projected_minutes",
                "status",
                "source",
                "report_timestamp",
            ]
        )

    profiles = pd.read_csv(profiles_path)
    profiles["team"] = profiles["team_name"].map(canonicalize_team_name)
    profiles["player_id"] = profiles["player_id"].astype(str)
    profiles["player_status"] = profiles["player_status"].fillna("Unknown")

    player_season_priors = build_player_season_priors(repo_root)
    reference_season = int(pd.to_numeric(upcoming.get("season"), errors="coerce").dropna().max()) if "season" in upcoming.columns and upcoming["season"].notna().any() else datetime.now(UTC).year
    prior_season = reference_season - 1
    current_season_priors = (
        player_season_priors[pd.to_numeric(player_season_priors["season"], errors="coerce") == reference_season].copy()
        if not player_season_priors.empty else pd.DataFrame()
    )
    last_season_priors = (
        player_season_priors[pd.to_numeric(player_season_priors["season"], errors="coerce") == prior_season].copy()
        if not player_season_priors.empty else pd.DataFrame()
    )
    scores = pd.DataFrame(
        columns=[
            "player_id",
            "team",
            "starter_score",
            "recent_minutes",
            "season_start_rate",
            "starts_last_five",
            "recent_apps",
            "season_value_score",
            "season_minutes",
            "season_games",
            "prior_starter_rate",
            "prior_minutes_per_appearance",
            "prior_role_proxy_score",
        ]
    )
    if logs_path.exists():
        logs = pd.read_csv(logs_path)
        logs["match_date"] = pd.to_datetime(logs["match_date_utc"], errors="coerce", utc=True).dt.date
        logs["started_flag"] = logs["gamestarted"].fillna(0).astype(float).gt(0)
        scores = _compute_projected_starter_scores(logs, last_season_priors=last_season_priors)

    scored_profiles = profiles.merge(scores, on=["player_id", "team"], how="left")
    scored_profiles = scored_profiles.merge(
        _prior_component(last_season_priors, "last_season"),
        on="player_id",
        how="left",
    )
    scored_profiles = scored_profiles.merge(
        _prior_component(current_season_priors, "current_season"),
        on="player_id",
        how="left",
    )
    for column in (
        "last_season_starter_rate",
        "last_season_minutes_per_appearance",
        "last_season_role_proxy_score",
        "last_season_value_score",
        "last_season_minutes_played",
        "last_season_appearances",
        "current_season_starter_rate",
        "current_season_minutes_per_appearance",
        "current_season_role_proxy_score",
        "current_season_value_score",
        "current_season_minutes_played",
        "current_season_appearances",
    ):
        if column not in scored_profiles.columns:
            scored_profiles[column] = np.nan

    starts_last_five = pd.to_numeric(scored_profiles["starts_last_five"], errors="coerce").fillna(0.0)
    recent_apps = pd.to_numeric(scored_profiles["recent_apps"], errors="coerce").fillna(0.0)
    season_start_rate = pd.to_numeric(scored_profiles["season_start_rate"], errors="coerce").fillna(0.0)
    recent_minutes = pd.to_numeric(scored_profiles["recent_minutes"], errors="coerce").fillna(0.0)
    season_value_score = pd.to_numeric(scored_profiles["season_value_score"], errors="coerce").fillna(0.0)
    season_minutes = pd.to_numeric(scored_profiles["season_minutes"], errors="coerce").fillna(0.0)
    last_season_minutes = pd.to_numeric(scored_profiles["last_season_minutes_per_appearance"], errors="coerce").fillna(0.0)
    current_season_minutes = pd.to_numeric(scored_profiles["current_season_minutes_per_appearance"], errors="coerce").fillna(0.0)
    current_season_appearances = pd.to_numeric(scored_profiles["current_season_appearances"], errors="coerce").fillna(0.0)
    current_component = (
        starts_last_five / recent_apps.replace(0, np.nan).fillna(1.0) * 0.55
        + season_start_rate * 0.25
        + np.clip(recent_minutes / 90.0, 0.0, 1.0) * 0.20
    )
    current_season_component = (
        scored_profiles["current_season_role_proxy_score"].fillna(0.0) * 0.65
        + scored_profiles["current_season_starter_rate"].fillna(0.0) * 0.25
        + np.clip(current_season_minutes / 90.0, 0.0, 1.0) * 0.10
    )
    prior_component = (
        scored_profiles["last_season_role_proxy_score"].fillna(0.0) * 0.70
        + scored_profiles["last_season_starter_rate"].fillna(0.0) * 0.20
        + np.clip(last_season_minutes / 90.0, 0.0, 1.0) * 0.10
    )
    log_weight = 0.35 * np.clip(recent_apps / 5.0, 0.0, 1.0)
    season_weight = 0.50 * np.clip(current_season_appearances / 6.0, 0.0, 1.0)
    prior_weight = np.clip(1.0 - log_weight - season_weight, 0.0, 1.0)
    scored_profiles["starter_score"] = (
        current_component * log_weight
        + current_season_component * season_weight
        + prior_component * prior_weight
        + scored_profiles["current_season_value_score"].fillna(scored_profiles["last_season_value_score"]).fillna(0.0) * 0.05
    )
    scored_profiles["starter_score"] = scored_profiles["starter_score"].fillna(0.05)
    scored_profiles["recent_minutes"] = recent_minutes
    scored_profiles["season_start_rate"] = season_start_rate
    scored_profiles["season_value_score"] = season_value_score
    scored_profiles["season_minutes"] = season_minutes
    scored_profiles["last_season_minutes_per_appearance"] = last_season_minutes
    scored_profiles["current_season_minutes_per_appearance"] = current_season_minutes
    scored_profiles["player_status"] = scored_profiles["player_status"].replace(
        {"Active": "available", "Left Team": "unknown"}
    ).fillna("unknown").str.lower()

    stamp = timestamp or datetime.now(UTC).isoformat()
    output_rows: list[dict[str, Any]] = []
    for _, row in upcoming.iterrows():
        for team_col in ("home_official_name", "away_official_name"):
            team = canonicalize_team_name(row[team_col])
            team_pool = scored_profiles[scored_profiles["team"] == team].copy()
            team_pool = team_pool.sort_values(
                ["starter_score", "last_season_starter_rate", "season_minutes", "recent_minutes", "season_start_rate", "player_id"],
                ascending=[False, False, False, False, False, True],
            )
            projected_ids = set(team_pool.head(11)["player_id"].astype(str))
            for _, player in team_pool.iterrows():
                projected_start = str(player["player_id"]) in projected_ids
                projected_minutes = 0.0
                if projected_start:
                    baseline_minutes = max(
                        player["recent_minutes"],
                        player["current_season_minutes_per_appearance"],
                        player["last_season_minutes_per_appearance"],
                    )
                    projected_minutes = max(58.0, min(90.0, 52.0 + player["starter_score"] * 28.0 + min(baseline_minutes / 12.0, 10.0)))
                elif player["recent_minutes"] > 0:
                    projected_minutes = min(35.0, player["recent_minutes"] * 0.45)
                elif player["current_season_minutes_per_appearance"] > 0:
                    projected_minutes = min(34.0, player["current_season_minutes_per_appearance"] * 0.35)
                elif player["last_season_minutes_per_appearance"] > 0:
                    projected_minutes = min(32.0, player["last_season_minutes_per_appearance"] * 0.30)

                output_rows.append(
                    {
                        "match_id": str(row["match_id"]),
                        "season": row.get("season"),
                        "team": team,
                        "player_id": str(player["player_id"]),
                        "projected_start": projected_start,
                        "projected_minutes": round(float(projected_minutes), 1),
                        "status": player["player_status"] if player["player_status"] in {"available", "unknown"} else "unknown",
                        "source": "official_current_season_role_model" if not current_season_priors.empty else "official_recent_role_model",
                        "report_timestamp": stamp,
                    }
                )

    return (
        pd.DataFrame(output_rows)
        .sort_values(["season", "match_id", "team", "projected_start", "projected_minutes"], ascending=[True, True, True, False, False])
        .reset_index(drop=True)
    )


def normalize_odds_contract(raw_odds: pd.DataFrame) -> pd.DataFrame:
    """Normalize an imported historical odds file into the model contract."""
    rename_map = {
        "book": "sportsbook",
        "bookmaker": "sportsbook",
        "market": "market_type",
        "captured_at": "timestamp",
        "as_of": "timestamp",
        "home_price": "home_odds",
        "draw_price": "draw_odds",
        "away_price": "away_odds",
        "over_price": "over_odds",
        "under_price": "under_odds",
    }
    odds = raw_odds.rename(columns={key: value for key, value in rename_map.items() if key in raw_odds.columns}).copy()
    for column in ODDS_OUTPUT_COLUMNS:
        if column not in odds.columns:
            odds[column] = np.nan
    odds["sportsbook"] = odds["sportsbook"].fillna("unknown")
    odds["market_type"] = odds["market_type"].fillna("1x2")
    odds["source_type"] = odds["source_type"].fillna("close")
    odds["match_id"] = odds["match_id"].astype(str)
    return odds[ODDS_OUTPUT_COLUMNS].copy()


def build_odds(odds_source: Path | None = None) -> pd.DataFrame:
    """Materialize canonical historical odds data or an empty contract file."""
    source_path = odds_source
    if source_path is None and (RAW_DIR / "odds.csv").exists():
        source_path = RAW_DIR / "odds.csv"
    if source_path is None or not source_path.exists():
        return pd.DataFrame(columns=ODDS_OUTPUT_COLUMNS)
    raw_odds = pd.read_csv(source_path)
    return normalize_odds_contract(raw_odds)


def build_dataset(
    repo_root: Path = ROOT_REPO,
    odds_source: Path | None = None,
    raw_dir: Path = RAW_DIR,
    fetch_asa: bool = False,
    history_start_season: int | None = None,
) -> BuildOutputs:
    """Build all raw model datasets and a manifest."""
    generated_at = datetime.now(UTC).isoformat()
    official_match_frames = _load_official_match_frames(repo_root)
    season_coverage = sorted(
        {
            int(season)
            for frame in official_match_frames
            for season in pd.to_numeric(frame.get("season"), errors="coerce").dropna().astype(int).tolist()
        }
    )
    asa_datasets = fetch_asa_datasets(season_coverage) if fetch_asa else load_asa_datasets(raw_dir)

    if history_start_season is not None:
        asa_datasets = ASADatasets(
            match_xgoals=_filter_frame_by_season(asa_datasets.match_xgoals, history_start_season),
            team_analytics=_filter_frame_by_season(asa_datasets.team_analytics, history_start_season),
            player_analytics=_filter_frame_by_season(asa_datasets.player_analytics, history_start_season),
        )

    matches = build_matches(repo_root, asa_match_xgoals=asa_datasets.match_xgoals)
    matches = _filter_frame_by_season(matches, history_start_season)
    appearances = build_appearances(repo_root)
    if not appearances.empty and not matches.empty:
        appearances = appearances[appearances["match_id"].astype(str).isin(matches["match_id"].astype(str))].copy()
        appearances = _filter_frame_by_season(appearances, history_start_season)
    player_season_priors = build_player_season_priors(repo_root, asa_player_analytics=asa_datasets.player_analytics)
    player_season_priors = _filter_frame_by_season(player_season_priors, history_start_season)
    team_season_priors = build_team_season_priors(
        repo_root,
        player_season_priors=player_season_priors,
        asa_team_analytics=asa_datasets.team_analytics,
    )
    team_season_priors = _filter_frame_by_season(team_season_priors, history_start_season)
    projected_lineups = build_projected_lineups(repo_root)
    projected_lineups = _filter_frame_by_season(projected_lineups, history_start_season)
    odds = build_odds(odds_source)
    if not odds.empty and not matches.empty:
        odds = odds[odds["match_id"].astype(str).isin(matches["match_id"].astype(str))].copy()
    odds_quality_report = build_odds_quality_report(matches, odds)
    asa_match_rows = int(len(asa_datasets.match_xgoals))
    asa_match_seasons = (
        sorted(asa_datasets.match_xgoals["season"].dropna().astype(int).unique().tolist())
        if not asa_datasets.match_xgoals.empty else []
    )
    match_xg_source_rows = max(
        int(matches["home_xg"].notna().sum()),
        int(matches["away_xg"].notna().sum()),
    )

    refresh_manifest = {
        "generated_at": generated_at,
        "history_start_season": history_start_season,
        "refresh_mode": "cache_first",
        "feature_policy": {
            "team_season_priors": "previous_available_season_baseline_applied_at_training_time",
            "player_season_priors": "last_season_only_for_projection_fallback",
        },
        "source_batches": [
            _source_batch(
                name="official_match_archive",
                source="data/nwsl-official",
                status="materialized",
                rows=sum(len(frame) for frame in official_match_frames),
                season_coverage=season_coverage,
                source_confidence=1.0,
                provenance={
                    "kind": "repo_archive",
                    "inputs": [str(path) for path in sorted((repo_root / "data" / "nwsl-official").glob("nwsl_*_official_matches.csv"))],
                },
                freshness={
                    "mode": "static_archive",
                    "latest_input_mtime": _latest_mtime(sorted((repo_root / "data" / "nwsl-official").glob("nwsl_*_official_matches.csv"))),
                },
                output_files=["matches.csv"],
            ),
            _source_batch(
                name="official_player_match_logs",
                source="data/nwsl-official",
                status="materialized",
                rows=int(len(appearances)),
                season_coverage=_season_coverage(appearances),
                source_confidence=0.9,
                provenance={
                    "kind": "repo_archive",
                    "inputs": [str(repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv")],
                },
                freshness={
                    "mode": "static_archive",
                    "latest_input_mtime": _latest_mtime([repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv"]),
                },
                output_files=["appearances.csv"],
            ),
            _source_batch(
                name="projected_lineup_materialization",
                source="data/nwsl-official",
                status="materialized",
                rows=int(len(projected_lineups)),
                season_coverage=_season_coverage(projected_lineups),
                source_confidence=0.85,
                provenance={
                    "kind": "repo_archive",
                    "inputs": [
                        str(repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv"),
                        str(repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_profiles.csv"),
                    ],
                },
                freshness={
                    "mode": "static_archive",
                    "latest_input_mtime": _latest_mtime([
                        repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv",
                        repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_profiles.csv",
                    ]),
                },
                output_files=["projected_lineups.csv"],
            ),
            _source_batch(
                name="player_season_priors_materialization",
                source="data/nwsl-official+asa",
                status="materialized",
                rows=int(len(player_season_priors)),
                season_coverage=_season_coverage(player_season_priors),
                source_confidence=0.9,
                provenance={
                    "kind": "repo_archive_plus_asa",
                    "inputs": [
                        str(path)
                        for path in sorted((repo_root / "data" / "nwsl-official").glob("nwsl_*_official_player_stats.csv"))
                    ] + [str(raw_dir / "asa_player_analytics.csv")],
                },
                freshness={
                    "mode": "cache_first",
                    "latest_input_mtime": _latest_mtime(
                        sorted((repo_root / "data" / "nwsl-official").glob("nwsl_*_official_player_stats.csv"))
                        + [raw_dir / "asa_player_analytics.csv"]
                    ),
                    "generated_at": generated_at,
                },
                output_files=["player_season_priors.csv"],
            ),
            _source_batch(
                name="team_season_priors_materialization",
                source="data/nwsl-official+asa",
                status="materialized",
                rows=int(len(team_season_priors)),
                season_coverage=_season_coverage(team_season_priors),
                source_confidence=0.9,
                provenance={
                    "kind": "repo_archive_plus_asa",
                    "inputs": [
                        str(path)
                        for path in sorted((repo_root / "data" / "nwsl-official").glob("nwsl_*_official_team_stats.csv"))
                    ] + [str(raw_dir / "asa_team_analytics.csv")],
                },
                freshness={
                    "mode": "cache_first",
                    "latest_input_mtime": _latest_mtime(
                        sorted((repo_root / "data" / "nwsl-official").glob("nwsl_*_official_team_stats.csv"))
                        + [raw_dir / "asa_team_analytics.csv"]
                    ),
                    "generated_at": generated_at,
                },
                output_files=["team_season_priors.csv"],
            ),
            _source_batch(
                name="asa_advanced_analytics",
                source="american-soccer-analysis",
                status="fetched" if fetch_asa else ("cached" if asa_match_rows or len(asa_datasets.team_analytics) or len(asa_datasets.player_analytics) else "empty"),
                rows=int(asa_match_rows + len(asa_datasets.team_analytics) + len(asa_datasets.player_analytics)),
                season_coverage=asa_match_seasons,
                source_confidence=0.95 if (asa_match_rows or len(asa_datasets.team_analytics) or len(asa_datasets.player_analytics)) else 0.0,
                provenance={
                    "kind": "external_provider",
                    "cache_first": True,
                    "fetch_enabled": bool(fetch_asa),
                    "inputs": [str(raw_dir / "asa_match_xgoals.csv"), str(raw_dir / "asa_team_analytics.csv"), str(raw_dir / "asa_player_analytics.csv")],
                },
                freshness={
                    "mode": "fetched" if fetch_asa else "cached",
                    "latest_input_mtime": _latest_mtime([
                        raw_dir / "asa_match_xgoals.csv",
                        raw_dir / "asa_team_analytics.csv",
                        raw_dir / "asa_player_analytics.csv",
                    ]),
                    "generated_at": generated_at,
                },
                output_files=["asa_match_xgoals.csv", "asa_team_analytics.csv", "asa_player_analytics.csv"],
            ),
            _source_batch(
                name="odds_contract",
                source=str(odds_source or raw_dir / "odds.csv"),
                status="materialized" if len(odds) > 0 else "empty",
                rows=int(len(odds)),
                season_coverage=_season_coverage(matches) if not matches.empty else [],
                source_confidence=0.85 if len(odds) > 0 else 0.0,
                provenance={
                    "kind": "canonical_contract",
                    "inputs": [str(odds_source or raw_dir / "odds.csv")],
                },
                freshness={
                    "mode": "normalized",
                    "latest_input_mtime": _latest_mtime([odds_source or raw_dir / "odds.csv"] if (odds_source or (raw_dir / "odds.csv").exists()) else []),
                    "generated_at": generated_at,
                },
                output_files=["odds.csv"],
            ),
        ],
        "source_hooks": {
            "fbref_secondary": {
                "status": "hook_only",
                "enabled": False,
                "source_confidence": 0.55,
                "note": "Reserved for secondary completeness checks; not required for a passing build.",
            },
            "espn_fallback": {
                "status": "hook_only",
                "enabled": False,
                "source_confidence": 0.25,
                "note": "Reserved as a live-status fallback; not required for a passing build.",
            },
        },
        "summary": {
            "rows": {
                "matches": int(len(matches)),
                "appearances": int(len(appearances)),
                "projected_lineups": int(len(projected_lineups)),
                "team_season_priors": int(len(team_season_priors)),
                "player_season_priors": int(len(player_season_priors)),
                "odds": int(len(odds)),
            },
            "season_coverage": {
                "matches": _season_coverage(matches),
                "appearances": _season_coverage(appearances),
                "projected_lineups": _season_coverage(projected_lineups),
                "team_season_priors": _season_coverage(team_season_priors),
                "player_season_priors": _season_coverage(player_season_priors),
            },
            "source_confidence": {
                "official": 1.0,
                "asa": 0.95 if bool(asa_match_rows or len(asa_datasets.team_analytics) or len(asa_datasets.player_analytics)) else 0.0,
                "odds": 0.85 if len(odds) > 0 else 0.0,
            },
        },
        "feature_policy": {
            "training_window": f"{history_start_season}+ only" if history_start_season is not None else "all_available_seasons",
            "travel_features": "disabled",
            "weather_features": "disabled",
            "surface_features": "disabled",
        },
    }

    manifest = {
        "generated_at": generated_at,
        "history_start_season": history_start_season,
        "refresh_manifest_path": "refresh_manifest.json",
        "refresh_mode": "cache_first",
        "feature_policy": refresh_manifest["feature_policy"],
        "feature_inclusion": {
            "training_window": f"{history_start_season}+ only" if history_start_season is not None else "all_available_seasons",
            "travel_features": "disabled",
            "weather_features": "disabled",
            "surface_features": "disabled",
        },
        "matches": {
            "rows": int(len(matches)),
            "season_coverage": _season_coverage(matches),
            "xg_coverage_pct": {
                "home_xg": round(float(matches["home_xg"].notna().mean() * 100), 2),
                "away_xg": round(float(matches["away_xg"].notna().mean() * 100), 2),
                "home_npxg": round(float(matches["home_npxg"].notna().mean() * 100), 2),
                "away_npxg": round(float(matches["away_npxg"].notna().mean() * 100), 2),
            },
        },
        "appearances": {
            "rows": int(len(appearances)),
            "season_coverage": _season_coverage(appearances),
        },
        "projected_lineups": {
            "rows": int(len(projected_lineups)),
            "matches_covered": int(projected_lineups["match_id"].nunique()) if not projected_lineups.empty else 0,
            "teams_covered": int(projected_lineups["team"].nunique()) if not projected_lineups.empty else 0,
            "season_coverage": _season_coverage(projected_lineups),
        },
        "team_season_priors": {
            "rows": int(len(team_season_priors)),
            "season_coverage": _season_coverage(team_season_priors),
        },
        "player_season_priors": {
            "rows": int(len(player_season_priors)),
            "season_coverage": _season_coverage(player_season_priors),
        },
        "asa": {
            "source_available": bool(
                asa_match_rows
                or len(asa_datasets.team_analytics) > 0
                or len(asa_datasets.player_analytics) > 0
            ),
            "match_xgoals_rows": asa_match_rows,
            "team_analytics_rows": int(len(asa_datasets.team_analytics)),
            "player_analytics_rows": int(len(asa_datasets.player_analytics)),
            "season_coverage": asa_match_seasons,
            "match_xg_coverage_pct": round(float(match_xg_source_rows / max(len(matches), 1) * 100), 2),
        },
        "odds": {
            "rows": int(len(odds)),
            "source_available": bool(len(odds) > 0),
            "markets": sorted(odds["market_type"].dropna().astype(str).unique().tolist()) if not odds.empty else [],
        },
        "odds_quality": odds_quality_report,
        "missing_feature_coverage": {
            "odds_missing_pct": round(float((1 - (len(odds) > 0)) * 100), 2),
            "asa_match_xg_missing_pct": round(float((1 - (asa_match_rows > 0)) * 100), 2),
            "appearance_match_coverage_pct": round(
                float(matches["match_id"].isin(appearances["match_id"].unique()).mean() * 100)
                if not appearances.empty else 0.0,
                2,
            ),
            "projected_lineup_upcoming_coverage_pct": round(
                float(projected_lineups["match_id"].nunique() / max(projected_lineups["match_id"].nunique(), 1) * 100)
                if not projected_lineups.empty else 0.0,
                2,
            ),
        },
    }

    return BuildOutputs(
        matches=matches,
        appearances=appearances,
        projected_lineups=projected_lineups,
        team_season_priors=team_season_priors,
        player_season_priors=player_season_priors,
        asa_match_xgoals=asa_datasets.match_xgoals,
        asa_team_analytics=asa_datasets.team_analytics,
        asa_player_analytics=asa_datasets.player_analytics,
        odds=odds,
        odds_quality_report=odds_quality_report,
        refresh_manifest=refresh_manifest,
        manifest=manifest,
    )


def write_dataset(outputs: BuildOutputs, raw_dir: Path = RAW_DIR) -> dict[str, Path]:
    """Write dataset outputs into nwsl-model/data/raw."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "matches": raw_dir / "matches.csv",
        "appearances": raw_dir / "appearances.csv",
        "projected_lineups": raw_dir / "projected_lineups.csv",
        "team_season_priors": raw_dir / "team_season_priors.csv",
        "player_season_priors": raw_dir / "player_season_priors.csv",
        "asa_match_xgoals": raw_dir / "asa_match_xgoals.csv",
        "asa_team_analytics": raw_dir / "asa_team_analytics.csv",
        "asa_player_analytics": raw_dir / "asa_player_analytics.csv",
        "odds": raw_dir / "odds.csv",
        "odds_quality_report": raw_dir / "odds_quality_report.json",
        "refresh_manifest": raw_dir / "refresh_manifest.json",
        "manifest": raw_dir / "dataset_manifest.json",
    }
    save_csv(outputs.matches, paths["matches"])
    save_csv(outputs.appearances, paths["appearances"])
    save_csv(outputs.projected_lineups, paths["projected_lineups"])
    save_csv(outputs.team_season_priors, paths["team_season_priors"])
    save_csv(outputs.player_season_priors, paths["player_season_priors"])
    write_asa_datasets(
        raw_dir,
        ASADatasets(
            match_xgoals=outputs.asa_match_xgoals,
            team_analytics=outputs.asa_team_analytics,
            player_analytics=outputs.asa_player_analytics,
        ),
    )
    save_csv(outputs.odds, paths["odds"])
    save_json(outputs.odds_quality_report, paths["odds_quality_report"])
    save_json(outputs.refresh_manifest, paths["refresh_manifest"])
    save_json(outputs.manifest, paths["manifest"])
    return paths
