"""Backtest evaluation metrics.

Computes log loss, Brier score, CRPS, calibration, ROI, hit rate, and more.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from numpy.typing import NDArray

logger = logging.getLogger("nwsl_model.backtest.metrics")


def log_loss_1x2(
    probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    eps: float = 1e-15,
) -> float:
    """Compute multiclass log loss for 1X2 predictions.

    Args:
        probs: (N, 3) array of [p_home, p_draw, p_away].
        outcomes: (N,) array of outcome indices (0=home, 1=draw, 2=away).
    """
    probs = np.clip(probs, eps, 1.0 - eps)
    n = len(outcomes)
    ll = -sum(np.log(probs[i, outcomes[i]]) for i in range(n)) / n
    return float(ll)


def brier_score(
    predicted: NDArray[np.float64],
    actual: NDArray[np.int64],
) -> float:
    """Compute Brier score for binary predictions."""
    return float(np.mean((predicted - actual) ** 2))


def brier_score_multiclass(
    probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    n_classes: int = 3,
) -> float:
    """Compute multiclass Brier score."""
    n = len(outcomes)
    one_hot = np.zeros((n, n_classes))
    for i in range(n):
        one_hot[i, outcomes[i]] = 1.0
    return float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))


def root_mean_squared_error(
    predicted: NDArray[np.float64],
    actual: NDArray[np.float64],
) -> float:
    return float(np.sqrt(np.mean((predicted - actual) ** 2)))


def crps_scoreline(
    score_matrices: list[NDArray[np.float64]],
    actual_home: NDArray[np.int64],
    actual_away: NDArray[np.int64],
) -> float:
    """Compute CRPS for scoreline distributions.

    Uses the ranked probability score approach: compare CDF of predicted
    total goals distribution against actual.
    """
    crps_values = []

    for idx in range(len(score_matrices)):
        mat = score_matrices[idx]
        ah, aa = actual_home[idx], actual_away[idx]
        n = mat.shape[0]

        # Total goals CDF
        max_total = 2 * (n - 1)
        pred_pmf = np.zeros(max_total + 1)
        for i in range(n):
            for j in range(n):
                t = i + j
                if t <= max_total:
                    pred_pmf[t] += mat[i, j]

        actual_total = ah + aa
        pred_cdf = np.cumsum(pred_pmf)
        actual_cdf = np.zeros(max_total + 1)
        actual_cdf[actual_total:] = 1.0

        crps_val = np.sum((pred_cdf - actual_cdf) ** 2)
        crps_values.append(crps_val)

    return float(np.mean(crps_values))


def roi(total_pnl: float, total_staked: float) -> float:
    """Return on investment."""
    if total_staked <= 0:
        return 0.0
    return total_pnl / total_staked


def hit_rate(n_wins: int, n_bets: int) -> float:
    """Win rate."""
    if n_bets <= 0:
        return 0.0
    return n_wins / n_bets


def mean_edge(edges: NDArray[np.float64]) -> float:
    """Average edge of placed bets."""
    if len(edges) == 0:
        return 0.0
    return float(np.mean(edges))


def compute_all_metrics(
    predictions: pd.DataFrame,
    bet_log: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """Compute all backtest metrics.

    Args:
        predictions: Must have columns:
            - prob_home, prob_draw, prob_away (model 1X2 probs)
            - home_goals_90, away_goals_90 (actual results)
            - total_goals (actual total)
            Optionally: score_matrix (list of matrices), market odds columns.
        bet_log: Optional bet log with pnl, stake, edge columns.

    Returns:
        Dictionary of metric name -> value.
    """
    metrics = {}
    df = predictions

    # 1X2 log loss
    if all(c in df.columns for c in ["prob_home", "prob_draw", "prob_away"]):
        probs = df[["prob_home", "prob_draw", "prob_away"]].values
        # Encode outcomes
        outcomes = np.where(
            df["home_goals_90"] > df["away_goals_90"], 0,
            np.where(df["home_goals_90"] < df["away_goals_90"], 2, 1)
        )
        metrics["log_loss_1x2"] = log_loss_1x2(probs, outcomes)
        metrics["brier_score_1x2"] = brier_score_multiclass(probs, outcomes)
        metrics["top1_accuracy_1x2"] = float((np.argmax(probs, axis=1) == outcomes).mean())
        metrics["forecast_entropy_1x2"] = float(
            np.mean(-np.sum(np.clip(probs, 1e-15, 1.0) * np.log(np.clip(probs, 1e-15, 1.0)), axis=1))
        )

    # Binary Brier scores for specific markets
    for prob_col, actual_col, name in [("prob_home", "home_win", "brier_home_win")]:
        if prob_col in df.columns and actual_col in df.columns:
            metrics[name] = brier_score(
                df[prob_col].values, df[actual_col].values.astype(int)
            )

    total_goals_actual = (df["home_goals_90"] + df["away_goals_90"]).astype(float).values
    if "lambda_home" in df.columns and "lambda_away" in df.columns:
        expected_total_goals = df["lambda_home"].astype(float).values + df["lambda_away"].astype(float).values
        metrics["expected_total_goals_mae"] = float(np.mean(np.abs(expected_total_goals - total_goals_actual)))
        metrics["expected_total_goals_rmse"] = root_mean_squared_error(expected_total_goals, total_goals_actual)
    if "lambda_home" in df.columns:
        metrics["expected_home_goals_mae"] = float(np.mean(np.abs(df["lambda_home"].astype(float).values - df["home_goals_90"].astype(float).values)))
        metrics["expected_home_goals_rmse"] = root_mean_squared_error(
            df["lambda_home"].astype(float).values,
            df["home_goals_90"].astype(float).values,
        )
    if "lambda_away" in df.columns:
        metrics["expected_away_goals_mae"] = float(np.mean(np.abs(df["lambda_away"].astype(float).values - df["away_goals_90"].astype(float).values)))
        metrics["expected_away_goals_rmse"] = root_mean_squared_error(
            df["lambda_away"].astype(float).values,
            df["away_goals_90"].astype(float).values,
        )

    for line in (1.5, 2.5, 3.5, 4.5):
        prob_col = f"prob_over_{line}"
        if prob_col in df.columns:
            actual = (total_goals_actual > line).astype(int)
            metrics[f"brier_over_{line}"] = brier_score(df[prob_col].astype(float).values, actual)

    # CRPS if score matrices available
    if "score_matrix" in df.columns:
        matrices = df["score_matrix"].tolist()
        metrics["crps_scoreline"] = crps_scoreline(
            matrices,
            df["home_goals_90"].values.astype(int),
            df["away_goals_90"].values.astype(int),
        )
        metrics["rps_scoreline"] = metrics["crps_scoreline"]

    # Betting metrics
    if bet_log is not None and len(bet_log) > 0:
        total_staked = bet_log["stake"].sum()
        total_pnl = bet_log["pnl"].sum()
        n_bets = len(bet_log)
        n_wins = (bet_log["pnl"] > 0).sum()

        metrics["n_bets"] = n_bets
        metrics["total_staked"] = total_staked
        metrics["total_pnl"] = total_pnl
        metrics["roi"] = roi(total_pnl, total_staked)
        metrics["hit_rate"] = hit_rate(n_wins, n_bets)

        if "edge" in bet_log.columns:
            metrics["mean_edge"] = mean_edge(bet_log["edge"].values)

        # Sides vs totals breakdown
        for market_type, label in [("1x2", "sides"), ("total", "totals"), ("ah", "ah")]:
            mask = bet_log["market"].str.contains(market_type, case=False, na=False)
            sub = bet_log[mask]
            if len(sub) > 0:
                metrics[f"{label}_n_bets"] = len(sub)
                metrics[f"{label}_pnl"] = sub["pnl"].sum()
                metrics[f"{label}_roi"] = roi(sub["pnl"].sum(), sub["stake"].sum())
                metrics[f"{label}_hit_rate"] = hit_rate(
                    (sub["pnl"] > 0).sum(), len(sub)
                )

    return metrics
