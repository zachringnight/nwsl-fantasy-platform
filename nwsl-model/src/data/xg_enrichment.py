"""xG enrichment helpers for model match inputs."""

from __future__ import annotations

from typing import Any

import pandas as pd

from src.data.match_ids import model_team_key

XG_COLUMNS = ["home_npxg", "away_npxg", "home_xg", "away_xg"]


def enrich_matches_with_asa_xg(
    matches: pd.DataFrame,
    asa_match_xgoals: pd.DataFrame | None,
) -> pd.DataFrame:
    """Add ASA match-level xG columns to ESPN-keyed model matches when available."""
    output = matches.copy()
    for column in XG_COLUMNS:
        if column not in output.columns:
            output[column] = pd.NA
        output[column] = pd.to_numeric(output[column], errors="coerce")

    if asa_match_xgoals is None or asa_match_xgoals.empty or output.empty:
        return output

    required = {"season", "match_date", "home_team", "away_team"}
    if not required.issubset(asa_match_xgoals.columns):
        return output

    source = asa_match_xgoals.copy()
    source["season_key"] = pd.to_numeric(source["season"], errors="coerce").astype("Int64")
    source["match_date_key"] = pd.to_datetime(source["match_date"], errors="coerce").dt.date
    source["home_team_key"] = source["home_team"].map(model_team_key)
    source["away_team_key"] = source["away_team"].map(model_team_key)
    source = source.dropna(
        subset=["season_key", "match_date_key", "home_team_key", "away_team_key"]
    ).copy()

    for column in ["home_xg", "away_xg", "home_xg_players", "away_xg_players"]:
        if column not in source.columns:
            source[column] = pd.NA
        source[column] = pd.to_numeric(source[column], errors="coerce")

    source = (
        source.sort_values(["season_key", "match_date_key", "home_team_key", "away_team_key"])
        .drop_duplicates(
            ["season_key", "match_date_key", "home_team_key", "away_team_key"],
            keep="last",
        )
    )

    keyed = output.reset_index(names="_row_id")
    keyed["season_key"] = pd.to_numeric(keyed["season"], errors="coerce").astype("Int64")
    keyed["match_date_key"] = pd.to_datetime(keyed["match_date"], errors="coerce").dt.date
    keyed["home_team_key"] = keyed["home_team"].map(model_team_key)
    keyed["away_team_key"] = keyed["away_team"].map(model_team_key)

    enriched = keyed.merge(
        source[
            [
                "season_key",
                "match_date_key",
                "home_team_key",
                "away_team_key",
                "home_xg",
                "away_xg",
                "home_xg_players",
                "away_xg_players",
            ]
        ],
        on=["season_key", "match_date_key", "home_team_key", "away_team_key"],
        how="left",
        suffixes=("", "_asa"),
    )

    for side in ["home", "away"]:
        xg_col = f"{side}_xg"
        asa_col = f"{side}_xg_asa"
        player_col = f"{side}_xg_players"
        source_value = enriched[asa_col].combine_first(enriched[player_col])
        enriched[xg_col] = enriched[xg_col].combine_first(source_value)
        enriched[f"{side}_npxg"] = enriched[f"{side}_npxg"].combine_first(source_value)

    drop_cols: list[Any] = [
        "_row_id",
        "season_key",
        "match_date_key",
        "home_team_key",
        "away_team_key",
        "home_xg_asa",
        "away_xg_asa",
        "home_xg_players",
        "away_xg_players",
    ]
    return enriched.drop(columns=[column for column in drop_cols if column in enriched.columns])
