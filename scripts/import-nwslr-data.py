#!/usr/bin/env python3
"""
Import public nwslR archive datasets into local CSVs.

Usage:
    python3 scripts/import-nwslr-data.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


BASE_RAW_URL = "https://raw.githubusercontent.com/adror1/nwslR/master/data-raw"


def normalize_dataframe(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.rename(columns=lambda value: str(value).strip())


def read_csv(path: str) -> pd.DataFrame:
    return normalize_dataframe(pd.read_csv(path, low_memory=False))


def read_excel(path: str, season: int | None = None) -> pd.DataFrame:
    frame = normalize_dataframe(pd.read_excel(path))
    if season is not None and "season" not in frame.columns:
        frame.insert(0, "season", season)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Import nwslR public archive files into local CSVs.")
    parser.add_argument("--output", default="data/nwslr", help="Output directory")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    adv_player_stats = read_csv(f"{BASE_RAW_URL}/adv_player_stats.csv")
    adv_team_stats = read_csv(f"{BASE_RAW_URL}/adv_team_stats.csv")
    franchise = read_csv(f"{BASE_RAW_URL}/franchise.csv")
    stadium = read_csv(f"{BASE_RAW_URL}/stadium.csv")
    awards = read_excel(f"{BASE_RAW_URL}/player_awards.xlsx")

    fieldplayer_frames = [
        read_excel(f"{BASE_RAW_URL}/fieldplayers_overall_season_{season}.xlsx", season=season)
        for season in range(2013, 2020)
    ]
    goalkeeper_frames = [
        read_excel(f"{BASE_RAW_URL}/goalkeepers_season_{season}.xlsx", season=season)
        for season in range(2013, 2020)
    ]

    fieldplayer_stats = pd.concat(fieldplayer_frames, ignore_index=True)
    goalkeeper_stats = pd.concat(goalkeeper_frames, ignore_index=True)

    adv_player_stats.to_csv(output_dir / "nwslr_adv_player_stats_2016_2019.csv", index=False)
    adv_team_stats.to_csv(output_dir / "nwslr_adv_team_stats_2016_2019.csv", index=False)
    franchise.to_csv(output_dir / "nwslr_franchise_history.csv", index=False)
    stadium.to_csv(output_dir / "nwslr_stadiums.csv", index=False)
    awards.to_csv(output_dir / "nwslr_awards.csv", index=False)
    fieldplayer_stats.to_csv(output_dir / "nwslr_fieldplayer_season_stats_2013_2019.csv", index=False)
    goalkeeper_stats.to_csv(output_dir / "nwslr_goalkeeper_season_stats_2013_2019.csv", index=False)


if __name__ == "__main__":
    main()
