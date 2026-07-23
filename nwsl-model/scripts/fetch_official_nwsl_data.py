#!/usr/bin/env python3
"""Refresh official NWSL season matches, rosters, and aggregate stats."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.official_api import (
    fetch_paginated_stats,
    fetch_season_matches,
    fetch_season_teams,
    fetch_team_roster,
    flatten_matches,
    flatten_player_stats,
    flatten_profiles,
    flatten_team_stats,
    merge_category_frames,
)
from src.utils.io import save_csv, save_json


def _resolve_season_id(data_dir: Path, season: int, explicit: str | None) -> str:
    if explicit:
        return explicit
    seasons_path = data_dir / "nwsl_official_seasons.csv"
    seasons = pd.read_csv(seasons_path)
    row = seasons[pd.to_numeric(seasons["season"], errors="coerce") == int(season)]
    if row.empty:
        raise SystemExit(f"No season_id found for {season} in {seasons_path}")
    return str(row.iloc[0]["season_id"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch current official NWSL season data")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--season-id", default="")
    parser.add_argument("--data-dir", default="../data/nwsl-official")
    parser.add_argument(
        "--player-categories",
        nargs="+",
        default=["general", "passing", "defending", "goalkeeping"],
    )
    parser.add_argument(
        "--team-categories",
        nargs="+",
        default=["general", "attacking", "passing", "defending"],
    )
    parser.add_argument("--page-size", type=int, default=500)
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.is_absolute():
        data_dir = (Path.cwd() / data_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    season_id = _resolve_season_id(data_dir, args.season, args.season_id or None)

    matches = flatten_matches(
        fetch_season_matches(season_id=season_id),
        season=args.season,
        season_id=season_id,
    )
    save_csv(matches, data_dir / f"nwsl_{args.season}_official_matches.csv")

    teams = fetch_season_teams(season_id=season_id)
    rosters_by_team_id = {
        str(team.get("teamId")): fetch_team_roster(team_id=str(team.get("teamId")), season_id=season_id)
        for team in teams
        if team.get("teamId")
    }
    profiles = flatten_profiles(teams, rosters_by_team_id, season=args.season, season_id=season_id)
    save_csv(profiles, data_dir / f"nwsl_{args.season}_official_player_profiles.csv")

    player_frames = []
    for category in args.player_categories:
        player_records = fetch_paginated_stats(
            season_id=season_id,
            category=category,
            entity="players",
            page_size=args.page_size,
        )
        player_frames.append(
            flatten_player_stats(
                player_records,
                season=args.season,
                season_id=season_id,
                category=category,
            )
        )
    player_stats = merge_category_frames(player_frames, key="player_id")
    save_csv(player_stats, data_dir / f"nwsl_{args.season}_official_player_stats.csv")

    team_frames = []
    for category in args.team_categories:
        team_records = fetch_paginated_stats(
            season_id=season_id,
            category=category,
            entity="teams",
            page_size=args.page_size,
        )
        team_frames.append(
            flatten_team_stats(
                team_records,
                season=args.season,
                season_id=season_id,
                category=category,
            )
        )
    team_stats = merge_category_frames(team_frames, key="team_id")
    save_csv(team_stats, data_dir / f"nwsl_{args.season}_official_team_stats.csv")

    report = {
        "season": args.season,
        "season_id": season_id,
        "matches": {
            "rows": int(len(matches)),
            "status_counts": matches["status"].value_counts(dropna=False).to_dict() if not matches.empty else {},
        },
        "profiles": {"rows": int(len(profiles)), "teams": int(profiles["team_id"].nunique()) if not profiles.empty else 0},
        "player_stats": {
            "rows": int(len(player_stats)),
            "max_games_played": float(pd.to_numeric(player_stats.get("games_played"), errors="coerce").max())
            if not player_stats.empty and "games_played" in player_stats
            else None,
            "max_starts": float(pd.to_numeric(player_stats.get("starts"), errors="coerce").max())
            if not player_stats.empty and "starts" in player_stats
            else None,
        },
        "team_stats": {
            "rows": int(len(team_stats)),
            "max_games_played": float(pd.to_numeric(team_stats.get("games_played"), errors="coerce").max())
            if not team_stats.empty and "games_played" in team_stats
            else None,
        },
    }
    save_json(report, data_dir / f"nwsl_{args.season}_official_refresh_report.json")
    print(report)


if __name__ == "__main__":
    main()
