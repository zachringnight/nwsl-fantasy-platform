"""Schedule, rest, and travel features."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.features.schedule_features")


def compute_rest_days(matches: pd.DataFrame) -> pd.DataFrame:
    """Compute rest days for each team since their last match.

    Works on wide-format matches. Adds home_rest_days, away_rest_days, rest_diff.
    """
    df = matches.sort_values("match_date").copy()

    # Build a team-date index for all appearances
    home_dates = df[["home_team", "match_date", "match_id"]].rename(
        columns={"home_team": "team"}
    )
    away_dates = df[["away_team", "match_date", "match_id"]].rename(
        columns={"away_team": "team"}
    )
    all_dates = pd.concat([home_dates, away_dates]).sort_values(["team", "match_date"])

    # Previous match date per team
    all_dates["prev_date"] = all_dates.groupby("team")["match_date"].shift(1)
    all_dates["rest_days"] = all_dates.apply(
        lambda r: (r["match_date"] - r["prev_date"]).days
        if pd.notna(r["prev_date"]) else np.nan,
        axis=1,
    )

    rest_lookup = all_dates.set_index(["match_id", "team"])["rest_days"]

    # Map back
    df["home_rest_days"] = df.apply(
        lambda r: rest_lookup.get((r["match_id"], r["home_team"]), np.nan), axis=1
    )
    df["away_rest_days"] = df.apply(
        lambda r: rest_lookup.get((r["match_id"], r["away_team"]), np.nan), axis=1
    )
    df["rest_diff"] = df["home_rest_days"] - df["away_rest_days"]

    return df


def compute_schedule_density(
    matches: pd.DataFrame,
    windows_days: list[int] = (7, 14, 21),
) -> pd.DataFrame:
    """Count matches played in previous N days for each team."""
    df = matches.sort_values("match_date").copy()

    # Build team-date pairs
    home = df[["home_team", "match_date", "match_id"]].rename(columns={"home_team": "team"})
    away = df[["away_team", "match_date", "match_id"]].rename(columns={"away_team": "team"})
    all_matches = pd.concat([home, away]).sort_values(["team", "match_date"])

    for w in windows_days:
        col_name = f"matches_prev_{w}d"
        counts = {}
        for team, group in all_matches.groupby("team"):
            dates = group["match_date"].values
            match_ids = group["match_id"].values
            for idx in range(len(dates)):
                current = dates[idx]
                count = 0
                for prev_idx in range(idx - 1, -1, -1):
                    diff = (current - dates[prev_idx])
                    if hasattr(diff, "days"):
                        diff_days = diff.days
                    else:
                        diff_days = int(diff / np.timedelta64(1, "D"))
                    if diff_days <= w:
                        count += 1
                    else:
                        break
                counts[(match_ids[idx], team)] = count

        df[f"home_{col_name}"] = df.apply(
            lambda r: counts.get((r["match_id"], r["home_team"]), 0), axis=1
        )
        df[f"away_{col_name}"] = df.apply(
            lambda r: counts.get((r["match_id"], r["away_team"]), 0), axis=1
        )

    return df


def add_short_rest_flags(df: pd.DataFrame, threshold: int = 4) -> pd.DataFrame:
    """Flag teams on short rest."""
    df = df.copy()
    df["home_short_rest"] = (df["home_rest_days"] <= threshold).astype(int)
    df["away_short_rest"] = (df["away_rest_days"] <= threshold).astype(int)
    return df
