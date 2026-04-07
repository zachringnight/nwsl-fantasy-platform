"""Closing Line Value (CLV) computation.

Measures the quality of bet timing by comparing the odds at bet placement
to the closing line (last available odds before match start).
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.betting.clv")


def compute_clv(
    bet_odds: float,
    closing_odds: float,
) -> float:
    """Compute CLV for a single bet.

    CLV = (1/closing_odds) / (1/bet_odds) - 1
        = bet_odds / closing_odds - 1

    Positive CLV means the bet was placed at better odds than closing.
    """
    if closing_odds <= 1.0 or bet_odds <= 1.0:
        return 0.0
    return bet_odds / closing_odds - 1.0


def compute_clv_implied(
    bet_odds: float,
    closing_no_vig_prob: float,
) -> float:
    """Compute CLV using no-vig closing probability.

    CLV = model_edge_at_close = bet_implied_prob_of_winning - closing_no_vig_prob
    Alternative: CLV = (closing_no_vig_prob * bet_odds) - 1
    """
    if bet_odds <= 1.0:
        return 0.0
    return closing_no_vig_prob * bet_odds - 1.0


def compute_clv_report(
    bet_log: pd.DataFrame,
    closing_odds: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """Compute CLV metrics for a bet log.

    Args:
        bet_log: DataFrame with columns: match_id, market, side, line,
                 market_odds (bet placement odds), model_prob, edge, pnl.
        closing_odds: DataFrame with match_id, market_type, line,
                      closing home/away/over/under odds.

    Returns:
        bet_log with CLV columns appended.
    """
    df = bet_log.copy()

    if closing_odds is None or closing_odds.empty:
        logger.warning("No closing odds available for CLV computation.")
        df["closing_odds"] = np.nan
        df["clv"] = np.nan
        df["clv_pct"] = np.nan
        return df

    # Attempt to merge closing odds
    # This is a simplified merge; real implementation would match on market/side/line
    df["closing_odds"] = np.nan
    df["clv"] = np.nan
    df["clv_pct"] = np.nan

    for idx, row in df.iterrows():
        match_close = closing_odds[closing_odds["match_id"] == row["match_id"]]
        if match_close.empty:
            continue

        # Try to find matching closing odds
        close_row = match_close.iloc[0]
        close_odds_val = np.nan

        market = row.get("market", "")
        side = row.get("side", "")

        if "1x2" in market:
            if side == "home" and "home_odds" in close_row:
                close_odds_val = close_row["home_odds"]
            elif side == "draw" and "draw_odds" in close_row:
                close_odds_val = close_row["draw_odds"]
            elif side == "away" and "away_odds" in close_row:
                close_odds_val = close_row["away_odds"]
        elif "total" in market or "over" in market or "under" in market:
            if "over" in side and "over_odds" in close_row:
                close_odds_val = close_row["over_odds"]
            elif "under" in side and "under_odds" in close_row:
                close_odds_val = close_row["under_odds"]

        if not np.isnan(close_odds_val):
            df.at[idx, "closing_odds"] = close_odds_val
            df.at[idx, "clv"] = compute_clv(row["market_odds"], close_odds_val)
            df.at[idx, "clv_pct"] = df.at[idx, "clv"] * 100

    return df


def clv_summary(clv_report: pd.DataFrame) -> dict:
    """Summarize CLV statistics."""
    valid = clv_report.dropna(subset=["clv"])
    if valid.empty:
        return {"n_bets_with_clv": 0, "mean_clv": 0.0}

    return {
        "n_bets_with_clv": len(valid),
        "mean_clv": float(valid["clv"].mean()),
        "median_clv": float(valid["clv"].median()),
        "pct_positive_clv": float((valid["clv"] > 0).mean()),
        "mean_clv_pct": float(valid["clv_pct"].mean()),
    }
