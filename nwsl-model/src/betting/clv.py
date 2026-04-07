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


def _normalize_market_type(value: object) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("1x2"):
        return "1x2"
    if text.startswith("total") or "over" in text or "under" in text:
        return "total"
    return text


def _normalize_side(value: object) -> str:
    return str(value or "").strip().lower()


def _extract_line(row: pd.Series) -> float | None:
    line = row.get("line")
    if line is not None and not pd.isna(line):
        try:
            return float(line)
        except (TypeError, ValueError):
            return None

    market = str(row.get("market", "") or "")
    if "_" not in market:
        return None
    tail = market.rsplit("_", 1)[-1]
    try:
        return float(tail)
    except ValueError:
        return None


def _select_closing_row(
    row: pd.Series,
    closing_odds: pd.DataFrame,
) -> tuple[pd.Series | None, float | None]:
    match_rows = closing_odds[closing_odds["match_id"].astype(str) == str(row["match_id"])].copy()
    if match_rows.empty:
        return None, None

    if "source_type" in match_rows.columns:
        source_mask = match_rows["source_type"].astype(str).str.lower().eq("close")
        if source_mask.any():
            match_rows = match_rows[source_mask].copy()
        if match_rows.empty:
            return None, None

    if "sportsbook" in match_rows.columns:
        sportsbook = str(row.get("sportsbook", "") or "").strip()
        if sportsbook:
            exact_book = match_rows[match_rows["sportsbook"].astype(str) == sportsbook].copy()
            if not exact_book.empty:
                match_rows = exact_book

    market_type = _normalize_market_type(row.get("market"))
    if "market_type" in match_rows.columns:
        match_rows = match_rows[
            match_rows["market_type"].astype(str).str.lower().map(_normalize_market_type) == market_type
        ].copy()
    if match_rows.empty:
        return None, None

    target_line = _extract_line(row)
    if market_type == "total" and "line" in match_rows.columns:
        match_rows["line_numeric"] = pd.to_numeric(match_rows["line"], errors="coerce")
        if target_line is not None:
            exact_line = match_rows[(match_rows["line_numeric"] - target_line).abs() < 1e-9].copy()
            if exact_line.empty:
                match_rows = match_rows.assign(
                    _line_distance=(match_rows["line_numeric"] - target_line).abs()
                )
                sort_cols = ["_line_distance"]
                if "timestamp" in match_rows.columns:
                    sort_cols.append("timestamp")
                match_rows = match_rows.sort_values(sort_cols, na_position="last")
            else:
                match_rows = exact_line
        else:
            if "timestamp" in match_rows.columns:
                match_rows = match_rows.sort_values(["timestamp"], na_position="last")

    if "timestamp" in match_rows.columns:
        match_rows["timestamp"] = pd.to_datetime(match_rows["timestamp"], utc=True, errors="coerce")
        match_rows = match_rows.sort_values("timestamp", na_position="last")

    close_row = match_rows.iloc[-1]
    side = _normalize_side(row.get("side"))
    close_odds_val = np.nan

    if market_type == "1x2":
        if side == "home" and "home_odds" in close_row:
            close_odds_val = close_row["home_odds"]
        elif side == "draw" and "draw_odds" in close_row:
            close_odds_val = close_row["draw_odds"]
        elif side == "away" and "away_odds" in close_row:
            close_odds_val = close_row["away_odds"]
    elif market_type == "total":
        if side == "over" and "over_odds" in close_row:
            close_odds_val = close_row["over_odds"]
        elif side == "under" and "under_odds" in close_row:
            close_odds_val = close_row["under_odds"]

    if pd.isna(close_odds_val):
        return None, target_line
    return close_row, target_line


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

    df["closing_odds"] = np.nan
    df["closing_timestamp"] = None
    df["clv"] = np.nan
    df["clv_pct"] = np.nan
    df["bet_price"] = np.nan

    for idx, row in df.iterrows():
        close_row, _ = _select_closing_row(row, closing_odds)
        if close_row is None:
            continue

        bet_price = row.get("market_price")
        if bet_price is None or pd.isna(bet_price):
            bet_price = row.get("market_odds")
        if bet_price is None or pd.isna(bet_price):
            continue

        market_type = _normalize_market_type(row.get("market"))
        side = _normalize_side(row.get("side"))
        close_odds_val = np.nan
        if market_type == "1x2":
            if side == "home":
                close_odds_val = close_row.get("home_odds", np.nan)
            elif side == "draw":
                close_odds_val = close_row.get("draw_odds", np.nan)
            elif side == "away":
                close_odds_val = close_row.get("away_odds", np.nan)
        elif market_type == "total":
            if side == "over":
                close_odds_val = close_row.get("over_odds", np.nan)
            elif side == "under":
                close_odds_val = close_row.get("under_odds", np.nan)

        if pd.notna(close_odds_val):
            df.at[idx, "bet_price"] = float(bet_price)
            df.at[idx, "closing_odds"] = float(close_odds_val)
            df.at[idx, "closing_timestamp"] = close_row.get("timestamp")
            df.at[idx, "clv"] = compute_clv(float(bet_price), float(close_odds_val))
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
