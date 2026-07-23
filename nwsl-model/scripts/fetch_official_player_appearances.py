#!/usr/bin/env python3
"""Fetch historical per-match player appearances from the official NWSL API.

The official season stats endpoints only expose season-aggregated player rows.
Per-match appearances (who started, who came on, minutes) live on the match
``lineups`` endpoint. This script walks every finished match in a season,
derives appearance rows from the lineup payload, and writes them in the
``player_match_logs`` schema that ``build_appearances`` consumes.

Match ids are crosswalked to the ids used in ``data/raw/matches.csv`` via
(date, canonical home, canonical away) so the resulting appearances join the
rest of the pipeline.
"""

from __future__ import annotations

import argparse
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODEL_ROOT))

from src.data.official_api import (
    API_ROOT,
    fetch_json,
    fetch_match_lineup,
    flatten_match_lineup,
)
from src.data.team_names import canonicalize_team_name
from src.utils.io import save_csv

COMPETITION_ID = "nwsl::Football_Competition::3293333447504e83986ec13e794b68ea"


def resolve_season_ids() -> dict[int, str]:
    """Map calendar year -> NWSL season_id using the competition seasons feed."""
    encoded = urllib.parse.quote(COMPETITION_ID, safe=":")
    data = fetch_json(f"{API_ROOT}/competitions/{encoded}/seasons?locale=en-US")
    year_to_id: dict[int, str] = {}
    for season in data.get("seasons") or []:
        season_id = season["seasonId"]
        encoded_season = urllib.parse.quote(season_id, safe=":")
        try:
            matches = fetch_json(
                f"{API_ROOT}/seasons/{encoded_season}/matches?locale=en-US&page=1&pageNumElement=500"
            ).get("matches") or []
        except Exception:
            continue
        dates = sorted(m.get("matchDateUtc") or "" for m in matches if m.get("matchDateUtc"))
        if not dates:
            continue
        year = int(dates[0][:4])
        year_to_id.setdefault(year, season_id)
    return year_to_id


def build_match_crosswalk(season_matches: list[dict], matches_csv: pd.DataFrame, season: int) -> dict[str, str]:
    """Map API matchId -> matches.csv match_id via (date, home, away)."""
    ref = matches_csv[matches_csv["season"].astype(str) == str(season)].copy()
    ref["date"] = ref["match_date"].astype(str).str[:10]
    ref["home"] = ref["home_team"].map(canonicalize_team_name)
    ref["away"] = ref["away_team"].map(canonicalize_team_name)
    lookup = {
        (r["date"], r["home"], r["away"]): str(r["match_id"]) for _, r in ref.iterrows()
    }
    crosswalk: dict[str, str] = {}
    for match in season_matches:
        api_id = match.get("matchId")
        date = (match.get("matchDateUtc") or "")[:10]
        home = canonicalize_team_name((match.get("home") or {}).get("officialName", ""))
        away = canonicalize_team_name((match.get("away") or {}).get("officialName", ""))
        target = lookup.get((date, home, away))
        if target is not None:
            crosswalk[api_id] = target
    return crosswalk


def build_appearance_rows(
    match: dict,
    lineup_payload: dict,
    *,
    target_id: str,
    season: int,
    regulation_minutes: int = 90,
) -> pd.DataFrame:
    """Flatten one match's lineup payload into appearance rows carrying ``match_date_utc``.

    The season-matches payload already carries the match UTC datetime (that is
    what the API-id-to-``matches.csv`` crosswalk keys on), so it can be stamped
    onto every output row here with no extra API calls. Downstream,
    ``dataset_builder.build_projected_lineups`` reads this column back out of
    the written CSV via ``pd.to_datetime(logs['match_date_utc'])``.
    """
    rows = flatten_match_lineup(
        lineup_payload,
        match_id=target_id,
        season=season,
        regulation_minutes=regulation_minutes,
    )
    rows["match_date_utc"] = match.get("matchDateUtc")
    return rows


def fetch_season_appearances(season: int, season_id: str, matches_csv: pd.DataFrame, workers: int) -> tuple[pd.DataFrame, dict]:
    encoded_season = urllib.parse.quote(season_id, safe=":")
    season_matches = fetch_json(
        f"{API_ROOT}/seasons/{encoded_season}/matches?locale=en-US&page=1&pageNumElement=500"
    ).get("matches") or []
    finished = [m for m in season_matches if str(m.get("status", "")).upper() == "FINISHED"]
    crosswalk = build_match_crosswalk(finished, matches_csv, season)

    def worker(match: dict) -> pd.DataFrame:
        api_id = match.get("matchId")
        target_id = crosswalk.get(api_id)
        if target_id is None:
            return pd.DataFrame()
        try:
            payload = fetch_match_lineup(season_id=season_id, match_id=api_id)
        except Exception:
            return pd.DataFrame()
        return build_appearance_rows(match, payload, target_id=target_id, season=season)

    frames: list[pd.DataFrame] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(worker, m) for m in finished]
        for fut in as_completed(futures):
            frame = fut.result()
            if not frame.empty:
                frames.append(frame)

    appearances = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    report = {
        "season": season,
        "season_id": season_id,
        "finished_matches": len(finished),
        "crosswalked_matches": len(crosswalk),
        "matches_with_lineups": int(appearances["match_id"].nunique()) if not appearances.empty else 0,
        "appearance_rows": int(len(appearances)),
        "unmatched_api_matches": len(finished) - len(crosswalk),
    }
    return appearances, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch historical per-match player appearances")
    parser.add_argument("--seasons", nargs="+", type=int, default=[2025, 2026])
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument("--data-dir", default="data/nwsl-official")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    matches_path = Path(args.matches)
    if not matches_path.is_absolute():
        matches_path = MODEL_ROOT / matches_path
    matches_csv = pd.read_csv(matches_path, dtype={"match_id": str})

    data_dir = Path(args.data_dir)
    if not data_dir.is_absolute():
        data_dir = MODEL_ROOT / data_dir
    data_dir.mkdir(parents=True, exist_ok=True)

    year_to_id = resolve_season_ids()
    reports = []
    for season in args.seasons:
        season_id = year_to_id.get(season)
        if season_id is None:
            print(f"No season_id resolved for {season}; skipping.", file=sys.stderr)
            continue
        appearances, report = fetch_season_appearances(season, season_id, matches_csv, args.workers)
        out_path = data_dir / f"nwsl_{season}_official_player_match_logs.csv"
        save_csv(appearances, out_path)
        report["output"] = str(out_path)
        reports.append(report)
        print(report)


if __name__ == "__main__":
    main()
