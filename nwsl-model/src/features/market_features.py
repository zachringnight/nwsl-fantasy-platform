"""Market/odds-based features."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.features.market_features")


def devig_multiplicative(probs: list[float]) -> list[float]:
    """Remove overround using multiplicative (proportional) method.

    Given implied probabilities that sum > 1, scale them down proportionally.
    """
    total = sum(probs)
    if total <= 0:
        return probs
    return [p / total for p in probs]


def devig_power(odds: list[float], tol: float = 1e-8, max_iter: int = 100) -> list[float]:
    """Remove overround using the power method (Shin-like iterative).

    Finds exponent k such that sum(p_i^k) = 1 where p_i are implied probs.
    """
    implied = [1.0 / o for o in odds if o > 1.0]
    if not implied:
        return implied

    # Binary search for k
    lo, hi = 0.0, 5.0
    for _ in range(max_iter):
        k = (lo + hi) / 2
        total = sum(p ** k for p in implied)
        if abs(total - 1.0) < tol:
            break
        if total > 1.0:
            lo = k
        else:
            hi = k

    return [p ** k for p in implied]


def compute_market_probabilities(
    matches: pd.DataFrame,
    method: str = "multiplicative",
) -> pd.DataFrame:
    """Compute no-vig market probabilities from odds columns.

    Expects home_odds, draw_odds, away_odds columns.
    """
    df = matches.copy()

    has_1x2 = all(
        col in df.columns and df[col].notna().any()
        for col in ["home_odds", "draw_odds", "away_odds"]
    )

    if not has_1x2:
        logger.warning("1X2 odds not available. Market probabilities will be null.")
        df["mkt_prob_home"] = np.nan
        df["mkt_prob_draw"] = np.nan
        df["mkt_prob_away"] = np.nan
        return df

    probs_list = []
    for _, row in df.iterrows():
        h, d, a = row.get("home_odds"), row.get("draw_odds"), row.get("away_odds")
        if pd.isna(h) or pd.isna(d) or pd.isna(a):
            probs_list.append((np.nan, np.nan, np.nan))
            continue

        implied = [1.0 / h, 1.0 / d, 1.0 / a]

        if method == "power":
            fair = devig_power([h, d, a])
        else:
            fair = devig_multiplicative(implied)

        probs_list.append(tuple(fair))

    df["mkt_prob_home"] = [p[0] for p in probs_list]
    df["mkt_prob_draw"] = [p[1] for p in probs_list]
    df["mkt_prob_away"] = [p[2] for p in probs_list]

    return df


def compute_totals_market_probabilities(
    matches: pd.DataFrame,
    method: str = "multiplicative",
) -> pd.DataFrame:
    """Compute no-vig implied over/under probabilities."""
    df = matches.copy()

    has_totals = all(
        col in df.columns and df[col].notna().any()
        for col in ["over_odds", "under_odds"]
    )

    if not has_totals:
        df["mkt_prob_over"] = np.nan
        df["mkt_prob_under"] = np.nan
        return df

    over_probs = []
    under_probs = []
    for _, row in df.iterrows():
        ov, un = row.get("over_odds"), row.get("under_odds")
        if pd.isna(ov) or pd.isna(un):
            over_probs.append(np.nan)
            under_probs.append(np.nan)
            continue

        implied = [1.0 / ov, 1.0 / un]
        fair = devig_multiplicative(implied)
        over_probs.append(fair[0])
        under_probs.append(fair[1])

    df["mkt_prob_over"] = over_probs
    df["mkt_prob_under"] = under_probs

    return df
