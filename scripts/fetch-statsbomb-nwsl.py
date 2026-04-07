#!/usr/bin/env python3
"""
Fetch NWSL data from StatsBomb Open Data and derive event-level summaries.

Usage:
    python3 scripts/fetch-statsbomb-nwsl.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd


BASE_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
COMPETITION_ID = 49
SEASON_ID = 3


def fetch_json(url: str):
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def write_csv(path: Path, frame: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False)


def flatten_matches(matches: list[dict]) -> pd.DataFrame:
    rows = []
    for match in matches:
        rows.append(
            {
                "match_id": match.get("match_id"),
                "match_date": match.get("match_date"),
                "kick_off": match.get("kick_off"),
                "match_week": match.get("match_week"),
                "competition_stage": (match.get("competition_stage") or {}).get("name"),
                "stadium": (match.get("stadium") or {}).get("name"),
                "referee": (match.get("referee") or {}).get("name"),
                "home_team": (match.get("home_team") or {}).get("home_team_name"),
                "away_team": (match.get("away_team") or {}).get("away_team_name"),
                "home_score": match.get("home_score"),
                "away_score": match.get("away_score"),
            }
        )
    return pd.DataFrame(rows).sort_values(["match_date", "match_id"]).reset_index(drop=True)


def flatten_shots(match_row: dict, events: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for event in events:
        if (event.get("type") or {}).get("name") != "Shot":
            continue

        shot = event.get("shot") or {}
        end_location = shot.get("end_location") or [None, None, None]
        location = event.get("location") or [None, None]
        outcome = (shot.get("outcome") or {}).get("name")
        rows.append(
            {
                "match_id": match_row["match_id"],
                "match_date": match_row["match_date"],
                "competition_stage": match_row["competition_stage"],
                "home_team": match_row["home_team"],
                "away_team": match_row["away_team"],
                "team": (event.get("team") or {}).get("name"),
                "player": (event.get("player") or {}).get("name"),
                "minute": event.get("minute"),
                "second": event.get("second"),
                "period": event.get("period"),
                "play_pattern": (event.get("play_pattern") or {}).get("name"),
                "shot_type": (shot.get("type") or {}).get("name"),
                "body_part": (shot.get("body_part") or {}).get("name"),
                "technique": (shot.get("technique") or {}).get("name"),
                "outcome": outcome,
                "statsbomb_xg": shot.get("statsbomb_xg"),
                "first_time": shot.get("first_time"),
                "one_on_one": shot.get("one_on_one"),
                "open_goal": shot.get("open_goal"),
                "deflected": shot.get("deflected"),
                "under_pressure": event.get("under_pressure"),
                "shot_key_pass_player": ((shot.get("key_pass") or {}).get("player") or {}).get("name"),
                "location_x": location[0],
                "location_y": location[1],
                "end_location_x": end_location[0],
                "end_location_y": end_location[1],
                "end_location_z": end_location[2] if len(end_location) > 2 else None,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch StatsBomb Open Data NWSL files.")
    parser.add_argument("--output", default="data/statsbomb", help="Output directory")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    competitions = fetch_json(f"{BASE_URL}/competitions.json")
    competition_row = next(
        row
        for row in competitions
        if row.get("competition_id") == COMPETITION_ID and row.get("season_id") == SEASON_ID
    )

    matches = fetch_json(f"{BASE_URL}/matches/{COMPETITION_ID}/{SEASON_ID}.json")
    matches_df = flatten_matches(matches)
    matches_df.insert(0, "season_name", competition_row.get("season_name"))
    matches_df.insert(0, "competition_name", competition_row.get("competition_name"))

    shot_rows: list[dict] = []
    for match_row in matches_df.to_dict(orient="records"):
        events = fetch_json(f"{BASE_URL}/events/{match_row['match_id']}.json")
        shot_rows.extend(flatten_shots(match_row, events))

    shots_df = pd.DataFrame(shot_rows).sort_values(["match_date", "match_id", "minute", "second"]).reset_index(drop=True)
    shots_df["is_goal"] = shots_df["outcome"].eq("Goal")
    shots_df["is_on_target"] = shots_df["outcome"].isin(["Goal", "Saved", "Saved To Post"])

    player_summary_df = (
        shots_df.groupby(["player", "team"], dropna=False)
        .agg(
            shots=("match_id", "count"),
            goals=("is_goal", "sum"),
            shots_on_target=("is_on_target", "sum"),
            total_xg=("statsbomb_xg", "sum"),
            avg_xg_per_shot=("statsbomb_xg", "mean"),
        )
        .reset_index()
        .sort_values(["total_xg", "goals", "shots"], ascending=[False, False, False])
        .reset_index(drop=True)
    )

    team_summary_df = (
        shots_df.groupby("team", dropna=False)
        .agg(
            shots=("match_id", "count"),
            goals=("is_goal", "sum"),
            shots_on_target=("is_on_target", "sum"),
            total_xg=("statsbomb_xg", "sum"),
            avg_xg_per_shot=("statsbomb_xg", "mean"),
        )
        .reset_index()
        .sort_values(["total_xg", "goals", "shots"], ascending=[False, False, False])
        .reset_index(drop=True)
    )

    match_team_xg_df = (
        shots_df.groupby(["match_id", "match_date", "home_team", "away_team", "team"], dropna=False)
        .agg(
            shots=("match_id", "count"),
            goals=("is_goal", "sum"),
            shots_on_target=("is_on_target", "sum"),
            total_xg=("statsbomb_xg", "sum"),
        )
        .reset_index()
    )

    match_xg_summary_df = (
        match_team_xg_df.pivot_table(
            index=["match_id", "match_date", "home_team", "away_team"],
            columns="team",
            values="total_xg",
            fill_value=0,
        )
        .reset_index()
    )

    write_csv(output_dir / "nwsl_2018_matches.csv", matches_df)
    write_csv(output_dir / "nwsl_2018_shots.csv", shots_df)
    write_csv(output_dir / "nwsl_2018_player_xg_summary.csv", player_summary_df)
    write_csv(output_dir / "nwsl_2018_team_xg_summary.csv", team_summary_df)
    write_csv(output_dir / "nwsl_2018_match_team_xg.csv", match_team_xg_df)
    write_csv(output_dir / "nwsl_2018_match_xg_summary.csv", match_xg_summary_df)


if __name__ == "__main__":
    main()
