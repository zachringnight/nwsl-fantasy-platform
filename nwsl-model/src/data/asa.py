"""American Soccer Analysis ingestion helpers for nwsl-model."""

from __future__ import annotations

import ast
import logging
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from src.data.team_names import canonicalize_team_name
from src.utils.io import load_csv, save_csv

try:  # pragma: no cover - exercised through integration tests and local runs
    from itscalledsoccer.client import AmericanSoccerAnalysis
except ImportError:  # pragma: no cover - handled gracefully when dependency missing
    AmericanSoccerAnalysis = None

logger = logging.getLogger("nwsl_model.data.asa")

ASA_GAME_PATH = "asa_match_xgoals.csv"
ASA_TEAM_PATH = "asa_team_analytics.csv"
ASA_PLAYER_PATH = "asa_player_analytics.csv"

TEAM_ACTIONS = ("shooting", "passing", "dribbling", "receiving", "interrupting", "fouling", "claiming")
PLAYER_ACTIONS = ("shooting", "passing", "dribbling", "receiving", "interrupting", "fouling", "claiming")


@dataclass
class ASADatasets:
    match_xgoals: pd.DataFrame
    team_analytics: pd.DataFrame
    player_analytics: pd.DataFrame


def normalize_person_key(value: Any) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    return normalized


def _empty_match_xgoals() -> pd.DataFrame:
    return pd.DataFrame(
        columns=[
            "season",
            "match_date",
            "home_team",
            "away_team",
            "home_xg",
            "away_xg",
            "home_xg_players",
            "away_xg_players",
            "home_xpoints",
            "away_xpoints",
            "asa_game_id",
        ]
    )


def _empty_team_analytics() -> pd.DataFrame:
    columns = [
        "season",
        "team",
        "games_played",
        "xg_per_match",
        "xg_against_per_match",
        "xpoints_per_match",
        "gplus_for_per90",
        "gplus_against_per90",
        "gplus_net_per90",
    ]
    for action in TEAM_ACTIONS:
        columns.append(f"gplus_{action}_net_per90")
    return pd.DataFrame(columns=columns)


def _empty_player_analytics() -> pd.DataFrame:
    columns = [
        "season",
        "team",
        "player_name",
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
    for action in PLAYER_ACTIONS:
        columns.append(f"asa_gplus_{action}_above_avg")
    return pd.DataFrame(columns=columns)


def _parse_action_data(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, tuple):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, str) and value.strip():
        try:
            parsed = ast.literal_eval(value)
        except Exception:
            return []
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
    return []


def _season_iterable(seasons: Iterable[int] | None) -> list[int]:
    unique = sorted({int(season) for season in seasons or []})
    return unique


def _team_lookup(client: AmericanSoccerAnalysis) -> dict[str, str]:
    teams = client.get_teams(leagues="nwsl")
    if teams.empty:
        return {}
    return {
        str(row["team_id"]): canonicalize_team_name(str(row["team_name"]))
        for _, row in teams.iterrows()
    }


def _player_lookup(client: AmericanSoccerAnalysis) -> pd.DataFrame:
    players = client.get_players(leagues="nwsl")
    if players.empty:
        return pd.DataFrame(columns=["player_id", "player_name", "player_name_key", "primary_general_position"])
    output = players.copy()
    output["player_id"] = output["player_id"].astype(str)
    output["player_name_key"] = output["player_name"].map(normalize_person_key)
    return output[["player_id", "player_name", "player_name_key", "primary_general_position"]].drop_duplicates("player_id")


def _fetch_match_xgoals(
    client: AmericanSoccerAnalysis,
    seasons: list[int],
    team_lookup: dict[str, str],
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for season in seasons:
        game_xgoals = client.get_game_xgoals(leagues="nwsl", season_name=str(season))
        if game_xgoals.empty:
            continue
        frame = game_xgoals.copy()
        frame["season"] = season
        frame["match_date"] = pd.to_datetime(frame["date_time_utc"], errors="coerce", utc=True).dt.date
        frame["home_team"] = frame["home_team_id"].astype(str).map(team_lookup)
        frame["away_team"] = frame["away_team_id"].astype(str).map(team_lookup)
        frame = frame.rename(
            columns={
                "home_team_xgoals": "home_xg",
                "away_team_xgoals": "away_xg",
                "home_player_xgoals": "home_xg_players",
                "away_player_xgoals": "away_xg_players",
                "home_xpoints": "home_xpoints",
                "away_xpoints": "away_xpoints",
                "game_id": "asa_game_id",
            }
        )
        frames.append(
            frame[
                [
                    "season",
                    "match_date",
                    "home_team",
                    "away_team",
                    "home_xg",
                    "away_xg",
                    "home_xg_players",
                    "away_xg_players",
                    "home_xpoints",
                    "away_xpoints",
                    "asa_game_id",
                ]
            ]
        )
    if not frames:
        return _empty_match_xgoals()
    return pd.concat(frames, ignore_index=True).dropna(subset=["match_date", "home_team", "away_team"])


def _fetch_team_analytics(
    client: AmericanSoccerAnalysis,
    seasons: list[int],
    team_lookup: dict[str, str],
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for season in seasons:
        xgoals = client.get_team_xgoals(leagues="nwsl", season_name=str(season))
        goals_added = client.get_team_goals_added(leagues="nwsl", season_name=str(season))
        if xgoals.empty and goals_added.empty:
            continue

        xgoals_frame = xgoals.copy()
        if not xgoals_frame.empty:
            xgoals_frame["season"] = season
            xgoals_frame["team"] = xgoals_frame["team_id"].astype(str).map(team_lookup)
            games = pd.to_numeric(xgoals_frame["count_games"], errors="coerce").replace(0, pd.NA)
            xgoals_frame["games_played"] = pd.to_numeric(xgoals_frame["count_games"], errors="coerce").fillna(0.0)
            xgoals_frame["xg_per_match"] = (pd.to_numeric(xgoals_frame["xgoals_for"], errors="coerce") / games).fillna(0.0)
            xgoals_frame["xg_against_per_match"] = (pd.to_numeric(xgoals_frame["xgoals_against"], errors="coerce") / games).fillna(0.0)
            xgoals_frame["xpoints_per_match"] = (pd.to_numeric(xgoals_frame["xpoints"], errors="coerce") / games).fillna(0.0)
            base = xgoals_frame[["season", "team", "games_played", "xg_per_match", "xg_against_per_match", "xpoints_per_match"]]
        else:
            base = pd.DataFrame(columns=["season", "team", "games_played", "xg_per_match", "xg_against_per_match", "xpoints_per_match"])

        goal_rows: list[dict[str, Any]] = []
        if not goals_added.empty:
            for _, row in goals_added.iterrows():
                minutes = float(pd.to_numeric(row.get("minutes"), errors="coerce") or 0.0)
                minutes_scale = minutes / 90.0 if minutes > 0 else 0.0
                payload = {
                    "season": season,
                    "team": team_lookup.get(str(row.get("team_id", ""))),
                    "gplus_for_per90": 0.0,
                    "gplus_against_per90": 0.0,
                    "gplus_net_per90": 0.0,
                }
                action_map = {action: 0.0 for action in TEAM_ACTIONS}
                total_for = 0.0
                total_against = 0.0
                for item in _parse_action_data(row.get("data")):
                    action = str(item.get("action_type", "")).strip().lower()
                    g_for = float(pd.to_numeric(item.get("goals_added_for"), errors="coerce") or 0.0)
                    g_against = float(pd.to_numeric(item.get("goals_added_against"), errors="coerce") or 0.0)
                    total_for += g_for
                    total_against += g_against
                    if action in action_map:
                        action_map[action] += g_for - g_against
                if minutes_scale > 0:
                    payload["gplus_for_per90"] = total_for / minutes_scale
                    payload["gplus_against_per90"] = total_against / minutes_scale
                    payload["gplus_net_per90"] = (total_for - total_against) / minutes_scale
                    for action, value in action_map.items():
                        payload[f"gplus_{action}_net_per90"] = value / minutes_scale
                else:
                    for action in TEAM_ACTIONS:
                        payload[f"gplus_{action}_net_per90"] = 0.0
                goal_rows.append(payload)
        goal_frame = pd.DataFrame(goal_rows) if goal_rows else _empty_team_analytics().iloc[0:0]

        merged = base.merge(goal_frame, on=["season", "team"], how="outer")
        for column in _empty_team_analytics().columns:
            if column not in merged.columns:
                merged[column] = 0.0 if column not in {"season", "team"} else None
        frames.append(merged[_empty_team_analytics().columns])

    if not frames:
        return _empty_team_analytics()
    return pd.concat(frames, ignore_index=True).dropna(subset=["team"]).reset_index(drop=True)


def _fetch_player_analytics(
    client: AmericanSoccerAnalysis,
    seasons: list[int],
    team_lookup: dict[str, str],
    player_lookup: pd.DataFrame,
) -> pd.DataFrame:
    player_rows: list[pd.DataFrame] = []
    for season in seasons:
        xgoals = client.get_player_xgoals(leagues="nwsl", season_name=str(season))
        goals_added = client.get_player_goals_added(leagues="nwsl", season_name=str(season))
        if xgoals.empty and goals_added.empty:
            continue

        xgoals_frame = xgoals.copy()
        if not xgoals_frame.empty:
            xgoals_frame["season"] = season
            xgoals_frame["player_id"] = xgoals_frame["player_id"].astype(str)
            xgoals_frame["team"] = xgoals_frame["team_id"].astype(str).map(team_lookup)
            xgoals_frame = xgoals_frame.merge(player_lookup, on="player_id", how="left")
            minutes_90 = pd.to_numeric(xgoals_frame["minutes_played"], errors="coerce").replace(0, pd.NA) / 90.0
            xgoals_frame["asa_xgoals"] = pd.to_numeric(xgoals_frame["xgoals"], errors="coerce").fillna(0.0)
            xgoals_frame["asa_xassists"] = pd.to_numeric(xgoals_frame["xassists"], errors="coerce").fillna(0.0)
            xgoals_frame["asa_points_added"] = pd.to_numeric(xgoals_frame["points_added"], errors="coerce").fillna(0.0)
            xgoals_frame["asa_xpoints_added"] = pd.to_numeric(xgoals_frame["xpoints_added"], errors="coerce").fillna(0.0)
            xgoals_frame["asa_xg_plus_xa_per90"] = (
                (xgoals_frame["asa_xgoals"] + xgoals_frame["asa_xassists"]) / minutes_90
            ).fillna(0.0)
            base = xgoals_frame[
                [
                    "season",
                    "team",
                    "player_name",
                    "player_name_key",
                    "primary_general_position",
                    "minutes_played",
                    "asa_xgoals",
                    "asa_xassists",
                    "asa_points_added",
                    "asa_xpoints_added",
                    "asa_xg_plus_xa_per90",
                ]
            ].rename(columns={"primary_general_position": "position"})
        else:
            base = pd.DataFrame(columns=["season", "team", "player_name", "player_name_key", "position", "minutes_played", "asa_xgoals", "asa_xassists", "asa_points_added", "asa_xpoints_added", "asa_xg_plus_xa_per90"])

        goal_rows: list[dict[str, Any]] = []
        if not goals_added.empty:
            goals_added = goals_added.copy()
            goals_added["player_id"] = goals_added["player_id"].astype(str)
            goals_added = goals_added.merge(player_lookup, on="player_id", how="left")
            goals_added["team"] = goals_added["team_id"].astype(str).map(team_lookup)
            for _, row in goals_added.iterrows():
                minutes = float(pd.to_numeric(row.get("minutes_played"), errors="coerce") or 0.0)
                minutes_scale = minutes / 90.0 if minutes > 0 else 0.0
                payload = {
                    "season": season,
                    "team": row.get("team"),
                    "player_name": row.get("player_name"),
                    "player_name_key": row.get("player_name_key"),
                    "asa_gplus_raw_total": 0.0,
                    "asa_gplus_above_avg_total": 0.0,
                    "asa_gplus_above_avg_per90": 0.0,
                }
                for action in PLAYER_ACTIONS:
                    payload[f"asa_gplus_{action}_above_avg"] = 0.0

                total_raw = 0.0
                total_above = 0.0
                for item in _parse_action_data(row.get("data")):
                    action = str(item.get("action_type", "")).strip().lower()
                    raw_value = float(pd.to_numeric(item.get("goals_added_raw"), errors="coerce") or 0.0)
                    above_value = float(pd.to_numeric(item.get("goals_added_above_avg"), errors="coerce") or 0.0)
                    total_raw += raw_value
                    total_above += above_value
                    if action in PLAYER_ACTIONS:
                        payload[f"asa_gplus_{action}_above_avg"] += above_value
                payload["asa_gplus_raw_total"] = total_raw
                payload["asa_gplus_above_avg_total"] = total_above
                payload["asa_gplus_above_avg_per90"] = (total_above / minutes_scale) if minutes_scale > 0 else 0.0
                goal_rows.append(payload)
        goal_frame = pd.DataFrame(goal_rows) if goal_rows else _empty_player_analytics().iloc[0:0]

        merged = base.merge(goal_frame, on=["season", "team", "player_name", "player_name_key"], how="outer")
        for column in _empty_player_analytics().columns:
            if column not in merged.columns:
                merged[column] = 0.0 if column not in {"season", "team", "player_name", "player_name_key", "position"} else None
        player_rows.append(merged[_empty_player_analytics().columns])

    if not player_rows:
        return _empty_player_analytics()
    return pd.concat(player_rows, ignore_index=True).dropna(subset=["player_name_key", "team"]).reset_index(drop=True)


def fetch_asa_datasets(seasons: Iterable[int]) -> ASADatasets:
    if AmericanSoccerAnalysis is None:
        raise RuntimeError("itscalledsoccer is not installed. Add it to the environment before fetching ASA data.")

    season_list = _season_iterable(seasons)
    if not season_list:
        return ASADatasets(
            match_xgoals=_empty_match_xgoals(),
            team_analytics=_empty_team_analytics(),
            player_analytics=_empty_player_analytics(),
        )

    client = AmericanSoccerAnalysis()
    team_lookup = _team_lookup(client)
    player_lookup = _player_lookup(client)

    return ASADatasets(
        match_xgoals=_fetch_match_xgoals(client, season_list, team_lookup),
        team_analytics=_fetch_team_analytics(client, season_list, team_lookup),
        player_analytics=_fetch_player_analytics(client, season_list, team_lookup, player_lookup),
    )


def load_asa_datasets(raw_dir: Path) -> ASADatasets:
    match_path = raw_dir / ASA_GAME_PATH
    team_path = raw_dir / ASA_TEAM_PATH
    player_path = raw_dir / ASA_PLAYER_PATH
    return ASADatasets(
        match_xgoals=load_csv(match_path) if match_path.exists() else _empty_match_xgoals(),
        team_analytics=load_csv(team_path) if team_path.exists() else _empty_team_analytics(),
        player_analytics=load_csv(player_path) if player_path.exists() else _empty_player_analytics(),
    )


def write_asa_datasets(raw_dir: Path, datasets: ASADatasets) -> dict[str, Path]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "asa_match_xgoals": raw_dir / ASA_GAME_PATH,
        "asa_team_analytics": raw_dir / ASA_TEAM_PATH,
        "asa_player_analytics": raw_dir / ASA_PLAYER_PATH,
    }
    save_csv(datasets.match_xgoals, paths["asa_match_xgoals"])
    save_csv(datasets.team_analytics, paths["asa_team_analytics"])
    save_csv(datasets.player_analytics, paths["asa_player_analytics"])
    return paths
