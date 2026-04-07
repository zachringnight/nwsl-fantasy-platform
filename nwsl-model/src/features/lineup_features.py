"""Lineup and personnel features."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.features.lineup_features")


def compute_availability_features(
    matches: pd.DataFrame,
    appearances: Optional[pd.DataFrame],
) -> pd.DataFrame:
    """Compute lineup-related features from appearance data.

    If appearances data is not available, returns matches with null lineup features.
    """
    df = matches.copy()

    if appearances is None or appearances.empty:
        logger.warning("No appearance data. Lineup features will be null.")
        for prefix in ["home", "away"]:
            df[f"{prefix}_n_starters"] = np.nan
            df[f"{prefix}_n_injured"] = np.nan
            df[f"{prefix}_n_suspended"] = np.nan
            df[f"{prefix}_n_national_team"] = np.nan
        return df

    # Count starters per team per match
    starters = appearances[appearances["started_flag"]].groupby(
        ["match_id", "team"]
    ).size().reset_index(name="n_starters")

    injured = appearances[appearances["injury_flag"]].groupby(
        ["match_id", "team"]
    ).size().reset_index(name="n_injured")

    suspended = appearances[appearances["suspension_flag"]].groupby(
        ["match_id", "team"]
    ).size().reset_index(name="n_suspended")

    national = appearances[appearances["national_team_absence_flag"]].groupby(
        ["match_id", "team"]
    ).size().reset_index(name="n_national_team")

    for prefix, team_col in [("home", "home_team"), ("away", "away_team")]:
        for stat_df, stat_name in [
            (starters, "n_starters"),
            (injured, "n_injured"),
            (suspended, "n_suspended"),
            (national, "n_national_team"),
        ]:
            merged = df[["match_id", team_col]].merge(
                stat_df,
                left_on=["match_id", team_col],
                right_on=["match_id", "team"],
                how="left",
            )
            df[f"{prefix}_{stat_name}"] = merged[stat_name].fillna(0).values

    return df


def compute_projected_lineup_delta(
    matches: pd.DataFrame,
    projected: Optional[pd.DataFrame],
    player_ratings: Optional[dict[str, float]] = None,
) -> pd.DataFrame:
    """Compute expected lineup strength delta from projected lineups.

    If player_ratings are available, computes the sum of projected starter ratings
    vs a baseline. Otherwise, just counts available/unavailable players.
    """
    df = matches.copy()

    if projected is None or projected.empty:
        logger.warning("No projected lineup data. Lineup delta features will be null.")
        for prefix in ["home", "away"]:
            df[f"{prefix}_lineup_strength"] = 0.0
        return df

    for prefix, team_col in [("home", "home_team"), ("away", "away_team")]:
        strengths = []
        for _, row in df.iterrows():
            team_proj = projected[
                (projected["match_id"] == row["match_id"])
                & (projected["team"] == row[team_col])
                & (projected["projected_start"])
            ]
            if player_ratings and not team_proj.empty:
                total = sum(
                    player_ratings.get(pid, 0.0)
                    for pid in team_proj["player_id"]
                )
                strengths.append(total)
            else:
                strengths.append(0.0)
        df[f"{prefix}_lineup_strength"] = strengths

    return df
