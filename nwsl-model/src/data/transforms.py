"""Data transformation utilities to prepare model-ready features."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.data.transforms")


def add_result_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived result columns."""
    df = df.copy()
    df["total_goals"] = df["home_goals_90"] + df["away_goals_90"]
    df["goal_diff"] = df["home_goals_90"] - df["away_goals_90"]
    df["result"] = np.where(
        df["goal_diff"] > 0, "H",
        np.where(df["goal_diff"] < 0, "A", "D")
    )
    df["home_win"] = (df["result"] == "H").astype(int)
    df["draw"] = (df["result"] == "D").astype(int)
    df["away_win"] = (df["result"] == "A").astype(int)
    df["btts"] = ((df["home_goals_90"] > 0) & (df["away_goals_90"] > 0)).astype(int)
    return df


def add_npxg_fallback(df: pd.DataFrame) -> pd.DataFrame:
    """If npxG is missing, fall back to xG, then to goals. Log warnings."""
    df = df.copy()

    for side in ["home", "away"]:
        npxg_col = f"{side}_npxg"
        xg_col = f"{side}_xg"
        goals_col = f"{side}_goals_90"
        pen_col = f"{side}_penalties"

        if npxg_col not in df.columns or df[npxg_col].isna().all():
            if xg_col in df.columns and not df[xg_col].isna().all():
                # Approximate npxG = xG - 0.76 * penalties
                if pen_col in df.columns:
                    df[npxg_col] = df[xg_col] - 0.76 * df[pen_col].fillna(0)
                else:
                    df[npxg_col] = df[xg_col]
                logger.warning(f"Using {xg_col} as fallback for {npxg_col}")
            else:
                df[npxg_col] = df[goals_col].astype(float)
                logger.warning(f"Using {goals_col} as fallback for {npxg_col} (no xG data)")

        # Fill remaining NAs with goals
        still_na = df[npxg_col].isna()
        if still_na.any():
            df.loc[still_na, npxg_col] = df.loc[still_na, goals_col].astype(float)

    return df


def encode_teams(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Create team ID mapping. Does not hardcode teams."""
    all_teams = sorted(set(df["home_team"].unique()) | set(df["away_team"].unique()))
    team_map = {team: i for i, team in enumerate(all_teams)}
    df = df.copy()
    df["home_team_id"] = df["home_team"].map(team_map)
    df["away_team_id"] = df["away_team"].map(team_map)
    logger.info(f"Encoded {len(team_map)} teams")
    return df, team_map


def melt_to_team_match(df: pd.DataFrame) -> pd.DataFrame:
    """Convert wide match format to long team-match format for rating computation.

    Each match generates two rows: one for the home team, one for the away team.
    """
    home = df.rename(columns={
        "home_team": "team",
        "away_team": "opponent",
        "home_goals_90": "goals_for",
        "away_goals_90": "goals_against",
        "home_npxg": "npxg_for",
        "away_npxg": "npxg_against",
    })[["match_id", "match_date", "season", "team", "opponent",
        "goals_for", "goals_against", "npxg_for", "npxg_against"]].copy()
    home["is_home"] = True

    away = df.rename(columns={
        "away_team": "team",
        "home_team": "opponent",
        "away_goals_90": "goals_for",
        "home_goals_90": "goals_against",
        "away_npxg": "npxg_for",
        "home_npxg": "npxg_against",
    })[["match_id", "match_date", "season", "team", "opponent",
        "goals_for", "goals_against", "npxg_for", "npxg_against"]].copy()
    away["is_home"] = False

    result = pd.concat([home, away], ignore_index=True)
    return result.sort_values("match_date").reset_index(drop=True)


def merge_odds_to_matches(
    matches: pd.DataFrame,
    odds: Optional[pd.DataFrame],
    source_type: str = "close",
    market_type: str = "1x2",
) -> pd.DataFrame:
    """Merge odds into matches for a given source_type and market_type."""
    if odds is None or odds.empty:
        for col in ["home_odds", "draw_odds", "away_odds"]:
            if col not in matches.columns:
                matches[col] = np.nan
        return matches

    mask = odds["market_type"].str.lower() == market_type.lower()
    if "source_type" in odds.columns:
        mask &= odds["source_type"].str.lower() == source_type.lower()
    filtered = odds[mask].copy()

    if filtered.empty:
        logger.warning(f"No odds found for {market_type}/{source_type}")
        return matches

    # If multiple sportsbooks, average them
    agg_cols = {}
    for col in ["home_odds", "draw_odds", "away_odds", "over_odds", "under_odds"]:
        if col in filtered.columns:
            agg_cols[col] = "mean"
    if "line" in filtered.columns:
        agg_cols["line"] = "first"

    odds_agg = filtered.groupby("match_id").agg(agg_cols).reset_index()

    result = matches.merge(odds_agg, on="match_id", how="left", suffixes=("", "_mkt"))
    return result
