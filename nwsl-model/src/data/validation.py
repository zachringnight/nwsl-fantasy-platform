"""Data validation and filtering for clean model input."""

from __future__ import annotations

import logging
from datetime import date

import pandas as pd

logger = logging.getLogger("nwsl_model.data.validation")


def filter_regulation_matches(df: pd.DataFrame) -> pd.DataFrame:
    """Filter to only completed, regular-season, 90-minute regulation matches.

    Excludes: playoffs, extra time, penalties, suspended, incomplete, resumed.
    """
    n_start = len(df)
    mask = pd.Series(True, index=df.index)

    # Must be regular season
    if "regular_season_flag" in df.columns:
        mask &= df["regular_season_flag"].astype(bool)

    # Must be completed
    if "match_status" in df.columns:
        mask &= df["match_status"].str.lower() == "completed"

    # Not resumed or incomplete
    if "resumed_flag" in df.columns:
        mask &= ~df["resumed_flag"].astype(bool)
    if "incomplete_flag" in df.columns:
        mask &= ~df["incomplete_flag"].astype(bool)

    result = df[mask].copy()
    n_removed = n_start - len(result)
    if n_removed > 0:
        logger.info(f"Filtered out {n_removed} non-regulation matches ({len(result)} remaining)")

    return result


def validate_no_duplicates(df: pd.DataFrame, key_col: str = "match_id") -> pd.DataFrame:
    """Remove duplicate match IDs, keeping first occurrence."""
    n_dups = df[key_col].duplicated().sum()
    if n_dups > 0:
        logger.warning(f"Found {n_dups} duplicate {key_col} entries. Keeping first occurrence.")
        df = df.drop_duplicates(subset=[key_col], keep="first")
    return df


def validate_goals_non_negative(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure goals are non-negative integers."""
    for col in ["home_goals_90", "away_goals_90"]:
        if col in df.columns:
            bad = df[col] < 0
            if bad.any():
                logger.warning(f"Found {bad.sum()} negative values in {col}. Setting to 0.")
                df.loc[bad, col] = 0
    return df


def validate_xg_reasonable(df: pd.DataFrame, max_xg: float = 10.0) -> pd.DataFrame:
    """Warn about unreasonable xG values."""
    for col in ["home_npxg", "away_npxg", "home_xg", "away_xg"]:
        if col in df.columns:
            bad = df[col].dropna() > max_xg
            if bad.any():
                logger.warning(f"Found {bad.sum()} rows with {col} > {max_xg}")
    return df


def validate_date_ordering(df: pd.DataFrame) -> pd.DataFrame:
    """Sort by date and warn about future dates."""
    df = df.sort_values("match_date").reset_index(drop=True)
    today = date.today()
    future = df["match_date"].apply(lambda d: d > today)
    if future.any():
        logger.warning(f"Found {future.sum()} matches with future dates. These will be excluded from training.")
    return df


def run_all_validations(df: pd.DataFrame) -> pd.DataFrame:
    """Run all validation steps on a matches DataFrame."""
    df = validate_no_duplicates(df)
    df = filter_regulation_matches(df)
    df = validate_goals_non_negative(df)
    df = validate_xg_reasonable(df)
    df = validate_date_ordering(df)
    return df
