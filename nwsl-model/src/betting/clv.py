"""Closing Line Value (CLV) computation.

Measures the quality of bet timing by comparing the odds at bet placement
to the closing line (last available odds before match start).
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

from src.utils.dates import parse_mixed_utc_datetime

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
    if "clv" in df.columns:
        df["clv"] = pd.to_numeric(df["clv"], errors="coerce")
        df["clv_pct"] = df["clv"] * 100
        if "closing_odds" not in df.columns and "closing_market_odds" in df.columns:
            df["closing_odds"] = pd.to_numeric(df["closing_market_odds"], errors="coerce")

    if closing_odds is None or closing_odds.empty:
        logger.warning("No closing odds available for CLV computation.")
        if "closing_odds" not in df.columns:
            df["closing_odds"] = np.nan
        if "clv" not in df.columns:
            df["clv"] = np.nan
            df["clv_pct"] = np.nan
        return df

    # Attempt to merge closing odds
    # This is a simplified merge; real implementation would match on market/side/line
    if "closing_odds" not in df.columns:
        df["closing_odds"] = np.nan
    if "clv" not in df.columns:
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


_SIDE_ODDS_COLUMNS = {
    "home": "home_odds",
    "draw": "draw_odds",
    "away": "away_odds",
    "over": "over_odds",
    "under": "under_odds",
}

_OPEN_CLOSE_COLUMNS = [
    "match_id",
    "sportsbook",
    "market_type",
    "line",
    "side",
    "open_timestamp",
    "close_timestamp",
    "open_odds",
    "close_odds",
    "clv",
    "clv_pct",
]


def open_close_clv_report(snapshots: pd.DataFrame) -> pd.DataFrame:
    """Measure CLV from accumulated odds snapshots: earliest line vs the close.

    For each (match_id, sportsbook, market_type, line) group with at least two
    distinct timestamps, compares the first observed price (open proxy) to the
    last observed price (close) for every priced side. Positive CLV means the
    early line was better than the close, the core signal for a line-timing edge.
    Groups with a single timestamp carry no open/close pair and are skipped.
    """
    if snapshots is None or snapshots.empty:
        return pd.DataFrame(columns=_OPEN_CLOSE_COLUMNS)

    snap = snapshots.copy()
    snap["timestamp_dt"] = parse_mixed_utc_datetime(snap["timestamp"])
    snap = snap[snap["timestamp_dt"].notna()]
    group_keys = ["match_id", "sportsbook", "market_type", "line"]
    snap["line"] = snap["line"].where(snap["line"].notna(), "")

    rows = []
    for keys, group in snap.groupby(group_keys, dropna=False):
        if group["timestamp_dt"].nunique() < 2:
            continue
        ordered = group.sort_values("timestamp_dt")
        open_row = ordered.iloc[0]
        close_row = ordered.iloc[-1]
        match_id, sportsbook, market_type, line = keys
        for side, column in _SIDE_ODDS_COLUMNS.items():
            if column not in ordered.columns:
                continue
            open_odds = pd.to_numeric(open_row.get(column), errors="coerce")
            close_odds = pd.to_numeric(close_row.get(column), errors="coerce")
            if pd.isna(open_odds) or pd.isna(close_odds):
                continue
            clv = compute_clv(float(open_odds), float(close_odds))
            rows.append(
                {
                    "match_id": match_id,
                    "sportsbook": sportsbook,
                    "market_type": market_type,
                    "line": line,
                    "side": side,
                    "open_timestamp": open_row["timestamp"],
                    "close_timestamp": close_row["timestamp"],
                    "open_odds": float(open_odds),
                    "close_odds": float(close_odds),
                    "clv": clv,
                    "clv_pct": clv * 100,
                }
            )

    if not rows:
        return pd.DataFrame(columns=_OPEN_CLOSE_COLUMNS)
    return pd.DataFrame(rows, columns=_OPEN_CLOSE_COLUMNS)


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
