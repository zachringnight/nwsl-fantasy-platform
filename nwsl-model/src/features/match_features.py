"""Match-level feature engineering."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.features.match_features")


def compute_rolling_form(
    team_matches: pd.DataFrame,
    windows: list[int] = (3, 5, 10),
) -> pd.DataFrame:
    """Compute rolling form features for each team-match observation.

    Args:
        team_matches: Long-format team-match data (from melt_to_team_match).
        windows: Rolling window sizes in number of matches.

    Returns:
        DataFrame with rolling columns appended.
    """
    df = team_matches.sort_values(["team", "match_date"]).copy()

    for w in windows:
        # Rolling npxG for / against
        df[f"roll_{w}_npxg_for"] = (
            df.groupby("team")["npxg_for"]
            .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
        )
        df[f"roll_{w}_npxg_against"] = (
            df.groupby("team")["npxg_against"]
            .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
        )
        # Rolling goals for / against
        df[f"roll_{w}_goals_for"] = (
            df.groupby("team")["goals_for"]
            .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
        )
        df[f"roll_{w}_goals_against"] = (
            df.groupby("team")["goals_against"]
            .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
        )

    return df


def compute_season_stats(team_matches: pd.DataFrame) -> pd.DataFrame:
    """Compute expanding (in-season, causal) averages per team per season."""
    df = team_matches.sort_values(["team", "season", "match_date"]).copy()

    # Expanding mean of npxG within each season (shifted to avoid leakage)
    for col in ["npxg_for", "npxg_against", "goals_for", "goals_against"]:
        df[f"season_avg_{col}"] = (
            df.groupby(["team", "season"])[col]
            .transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
        )

    # Matches played in season so far
    df["season_matches_played"] = (
        df.groupby(["team", "season"]).cumcount()
    )

    return df


def build_match_features(
    matches: pd.DataFrame,
    team_form: pd.DataFrame,
    windows: list[int] = (3, 5, 10),
) -> pd.DataFrame:
    """Merge team-level rolling form back into match-level features.

    Args:
        matches: Original wide-format match data.
        team_form: Output of compute_rolling_form + compute_season_stats.
        windows: Same windows used in rolling form.
    """
    home_form = team_form[team_form["is_home"]].copy()
    away_form = team_form[~team_form["is_home"]].copy()

    # Build rename maps
    home_rename = {"team": "home_team"}
    away_rename = {"team": "away_team"}

    form_cols = ["season_matches_played"]
    for w in windows:
        for metric in ["npxg_for", "npxg_against", "goals_for", "goals_against"]:
            form_cols.append(f"roll_{w}_{metric}")
    for metric in ["npxg_for", "npxg_against", "goals_for", "goals_against"]:
        form_cols.append(f"season_avg_{metric}")

    # Merge home form
    home_merge = home_form[["match_id"] + form_cols].copy()
    home_merge = home_merge.rename(columns={c: f"home_{c}" for c in form_cols})

    # Merge away form
    away_merge = away_form[["match_id"] + form_cols].copy()
    away_merge = away_merge.rename(columns={c: f"away_{c}" for c in form_cols})

    result = matches.merge(home_merge, on="match_id", how="left")
    result = result.merge(away_merge, on="match_id", how="left")

    return result
