"""Model calibration assessment and adjustment."""

from __future__ import annotations

import logging
import math
from typing import Any, Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from src.betting.market_derivation import MarketPrices
from src.utils.math_utils import decimal_from_probability

logger = logging.getLogger("nwsl_model.models.calibration")

DEFAULT_N_BINS = 12
DEFAULT_PRIOR_STRENGTH = 8.0


def compute_calibration_bins(
    predicted_probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    n_bins: int = 10,
) -> pd.DataFrame:
    """Compute calibration table: bin predicted probs, measure actual frequency.

    Args:
        predicted_probs: Array of predicted probabilities.
        outcomes: Binary array (0/1) of actual outcomes.
        n_bins: Number of calibration bins.

    Returns:
        DataFrame with columns: bin_lower, bin_upper, mean_predicted,
        mean_actual, count, calibration_error.
    """
    bins = np.linspace(0, 1, n_bins + 1)
    records = []

    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (predicted_probs >= lo) & (predicted_probs < hi)
        if i == n_bins - 1:
            mask = (predicted_probs >= lo) & (predicted_probs <= hi)

        n = mask.sum()
        if n == 0:
            records.append({
                "bin_lower": lo,
                "bin_upper": hi,
                "mean_predicted": (lo + hi) / 2,
                "mean_actual": np.nan,
                "count": 0,
                "calibration_error": np.nan,
            })
        else:
            mean_pred = predicted_probs[mask].mean()
            mean_actual = outcomes[mask].mean()
            records.append({
                "bin_lower": lo,
                "bin_upper": hi,
                "mean_predicted": mean_pred,
                "mean_actual": mean_actual,
                "count": int(n),
                "calibration_error": mean_actual - mean_pred,
            })

    return pd.DataFrame(records)


def expected_calibration_error(
    predicted_probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    n_bins: int = 10,
) -> float:
    """Compute Expected Calibration Error (ECE)."""
    cal = compute_calibration_bins(predicted_probs, outcomes, n_bins)
    cal = cal.dropna(subset=["mean_actual"])
    if cal.empty:
        return 0.0

    total = cal["count"].sum()
    ece = (cal["count"] * cal["calibration_error"].abs()).sum() / total
    return float(ece)


def plot_calibration(
    predicted_probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    n_bins: int = 10,
    title: str = "Calibration Plot",
    save_path: Optional[str] = None,
) -> None:
    """Generate and optionally save a calibration plot."""
    import matplotlib.pyplot as plt

    cal = compute_calibration_bins(predicted_probs, outcomes, n_bins)
    cal = cal.dropna(subset=["mean_actual"])

    fig, ax = plt.subplots(1, 1, figsize=(8, 6))
    ax.plot([0, 1], [0, 1], "k--", label="Perfect calibration")
    ax.bar(
        cal["mean_predicted"],
        cal["mean_actual"],
        width=1.0 / n_bins * 0.8,
        alpha=0.6,
        label="Model",
    )
    ax.set_xlabel("Predicted probability")
    ax.set_ylabel("Observed frequency")
    ax.set_title(title)
    ax.legend()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight")
        logger.info(f"Calibration plot saved to {save_path}")
    plt.close(fig)


def _pool_adjacent_violators(
    values: NDArray[np.float64],
    weights: NDArray[np.float64],
) -> NDArray[np.float64]:
    """Enforce a monotonic non-decreasing sequence with weighted PAV."""
    blocks: list[dict[str, float | int]] = []

    for idx, (value, weight) in enumerate(zip(values, weights, strict=False)):
        blocks.append({
            "start": idx,
            "end": idx,
            "weight": float(weight),
            "value": float(value),
        })
        while len(blocks) >= 2 and float(blocks[-2]["value"]) > float(blocks[-1]["value"]):
            right = blocks.pop()
            left = blocks.pop()
            merged_weight = float(left["weight"]) + float(right["weight"])
            merged_value = (
                float(left["value"]) * float(left["weight"])
                + float(right["value"]) * float(right["weight"])
            ) / max(merged_weight, 1e-9)
            blocks.append({
                "start": int(left["start"]),
                "end": int(right["end"]),
                "weight": merged_weight,
                "value": merged_value,
            })

    fitted = np.zeros_like(values, dtype=np.float64)
    for block in blocks:
        fitted[int(block["start"]): int(block["end"]) + 1] = float(block["value"])
    return np.clip(fitted, 0.0, 1.0)


def fit_binary_calibrator(
    predicted_probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    n_bins: int = DEFAULT_N_BINS,
    prior_strength: float = DEFAULT_PRIOR_STRENGTH,
) -> dict[str, Any]:
    """Fit a monotonic binned-beta calibrator for one binary event."""
    probs = np.clip(np.asarray(predicted_probs, dtype=np.float64), 0.0, 1.0)
    actual = np.asarray(outcomes, dtype=np.int64)
    if probs.size == 0 or actual.size == 0:
        return {
            "method": "binned_beta_monotonic",
            "n_bins": int(n_bins),
            "prior_strength": float(prior_strength),
            "global_rate": 0.5,
            "bin_edges": np.linspace(0.0, 1.0, n_bins + 1).tolist(),
            "bin_values": [0.5] * n_bins,
            "bin_counts": [0] * n_bins,
            "n_samples": 0,
        }

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    bin_ids = np.digitize(probs, edges[1:-1], right=False)
    counts = np.bincount(bin_ids, minlength=n_bins).astype(np.float64)
    positives = np.bincount(bin_ids, weights=actual.astype(np.float64), minlength=n_bins)
    global_rate = float(actual.mean()) if actual.size else 0.5

    values = np.full(n_bins, global_rate, dtype=np.float64)
    populated = counts > 0
    if populated.any():
        values[populated] = (
            positives[populated] + prior_strength * global_rate
        ) / (counts[populated] + prior_strength)
        missing = ~populated
        if missing.any():
            known_idx = np.flatnonzero(populated)
            missing_idx = np.flatnonzero(missing)
            values[missing_idx] = np.interp(
                missing_idx,
                known_idx,
                values[known_idx],
                left=values[known_idx[0]],
                right=values[known_idx[-1]],
            )
    values = _pool_adjacent_violators(values, np.where(counts > 0, counts, 1e-3))

    return {
        "method": "binned_beta_monotonic",
        "n_bins": int(n_bins),
        "prior_strength": float(prior_strength),
        "global_rate": global_rate,
        "bin_edges": edges.tolist(),
        "bin_values": values.tolist(),
        "bin_counts": counts.astype(int).tolist(),
        "n_samples": int(actual.size),
    }


def apply_binary_calibrator(
    predicted_probs: NDArray[np.float64],
    calibrator: dict[str, Any] | None,
) -> NDArray[np.float64]:
    """Apply a monotonic binned calibrator to probabilities."""
    probs = np.clip(np.asarray(predicted_probs, dtype=np.float64), 0.0, 1.0)
    if not calibrator:
        return probs

    edges = np.asarray(calibrator.get("bin_edges", np.linspace(0.0, 1.0, DEFAULT_N_BINS + 1)), dtype=np.float64)
    values = np.asarray(calibrator.get("bin_values", []), dtype=np.float64)
    if values.size == 0:
        return probs
    centers = (edges[:-1] + edges[1:]) / 2.0
    xp = np.concatenate(([0.0], centers, [1.0]))
    fp = np.concatenate(([values[0]], values, [values[-1]]))
    return np.clip(np.interp(probs, xp, fp), 0.0, 1.0)


def fit_prediction_calibrators(predictions: pd.DataFrame) -> dict[str, Any]:
    """Fit 1X2 and totals calibrators from out-of-fold predictions."""
    if predictions.empty or not {"prob_home", "prob_draw", "prob_away", "home_goals_90", "away_goals_90"}.issubset(predictions.columns):
        return {}

    home_actual = (predictions["home_goals_90"] > predictions["away_goals_90"]).astype(int).to_numpy()
    draw_actual = (predictions["home_goals_90"] == predictions["away_goals_90"]).astype(int).to_numpy()
    away_actual = (predictions["home_goals_90"] < predictions["away_goals_90"]).astype(int).to_numpy()

    payload: dict[str, Any] = {
        "method": "binned_beta_monotonic",
        "1x2": {
            "home": fit_binary_calibrator(predictions["prob_home"].to_numpy(), home_actual),
            "draw": fit_binary_calibrator(predictions["prob_draw"].to_numpy(), draw_actual),
            "away": fit_binary_calibrator(predictions["prob_away"].to_numpy(), away_actual),
        },
        "totals": {},
    }

    total_goals = predictions["home_goals_90"] + predictions["away_goals_90"]
    for line in (1.5, 2.5, 3.5, 4.5):
        column = f"prob_over_{line}"
        if column not in predictions.columns:
            continue
        mask = predictions[column].notna()
        if not mask.any():
            continue
        payload["totals"][str(line)] = fit_binary_calibrator(
            predictions.loc[mask, column].to_numpy(),
            (total_goals.loc[mask] > line).astype(int).to_numpy(),
        )

    return payload


def apply_prediction_calibration(
    predictions: pd.DataFrame,
    calibrators: dict[str, Any] | None,
) -> pd.DataFrame:
    """Apply stored calibrators to a prediction frame and append calibrated columns."""
    calibrated = predictions.copy()
    if not calibrators:
        return calibrated

    classwise = calibrators.get("1x2", {})
    if {"prob_home", "prob_draw", "prob_away"}.issubset(calibrated.columns) and classwise:
        matrix = np.column_stack(
            [
                apply_binary_calibrator(calibrated["prob_home"].to_numpy(), classwise.get("home")),
                apply_binary_calibrator(calibrated["prob_draw"].to_numpy(), classwise.get("draw")),
                apply_binary_calibrator(calibrated["prob_away"].to_numpy(), classwise.get("away")),
            ]
        )
        row_sums = matrix.sum(axis=1, keepdims=True)
        row_sums[row_sums <= 0] = 1.0
        matrix = matrix / row_sums
        calibrated["prob_home_calibrated"] = matrix[:, 0]
        calibrated["prob_draw_calibrated"] = matrix[:, 1]
        calibrated["prob_away_calibrated"] = matrix[:, 2]

    for line_str, payload in calibrators.get("totals", {}).items():
        line = float(line_str)
        column = f"prob_over_{line}"
        if column not in calibrated.columns:
            continue
        mask = calibrated[column].notna()
        if not mask.any():
            continue
        over_probs = apply_binary_calibrator(calibrated.loc[mask, column].to_numpy(), payload)
        calibrated.loc[mask, f"prob_over_{line}_calibrated"] = over_probs
        calibrated.loc[mask, f"prob_under_{line}_calibrated"] = 1.0 - over_probs

    return calibrated


def apply_market_calibration(
    markets: MarketPrices,
    calibrators: dict[str, Any] | None,
) -> MarketPrices:
    """Apply stored calibrators directly to derived market probabilities."""
    if not calibrators:
        return markets

    classwise = calibrators.get("1x2", {})
    if classwise:
        probs = np.array([[markets.home_prob, markets.draw_prob, markets.away_prob]], dtype=np.float64)
        calibrated = np.column_stack(
            [
                apply_binary_calibrator(probs[:, 0], classwise.get("home")),
                apply_binary_calibrator(probs[:, 1], classwise.get("draw")),
                apply_binary_calibrator(probs[:, 2], classwise.get("away")),
            ]
        )
        calibrated = calibrated / np.clip(calibrated.sum(axis=1, keepdims=True), 1e-9, None)
        markets.home_prob = float(calibrated[0, 0])
        markets.draw_prob = float(calibrated[0, 1])
        markets.away_prob = float(calibrated[0, 2])
        markets.home_fair_odds = decimal_from_probability(markets.home_prob)
        markets.draw_fair_odds = decimal_from_probability(markets.draw_prob)
        markets.away_fair_odds = decimal_from_probability(markets.away_prob)

    for line_str, payload in calibrators.get("totals", {}).items():
        line = float(line_str)
        if line not in markets.over_probs:
            continue
        over_prob = float(apply_binary_calibrator(np.array([markets.over_probs[line]]), payload)[0])
        markets.over_probs[line] = over_prob
        markets.under_probs[line] = 1.0 - over_prob
        markets.over_fair_odds[line] = decimal_from_probability(over_prob)
        markets.under_fair_odds[line] = decimal_from_probability(1.0 - over_prob)

    return markets


def summarize_projection_quality(
    home_prob: float,
    draw_prob: float,
    away_prob: float,
    contextual_features: dict[str, float] | None = None,
    calibration_applied: bool = False,
) -> dict[str, Any]:
    """Summarize trustworthiness and sharpness of a match projection."""
    probs = np.clip(np.array([home_prob, draw_prob, away_prob], dtype=np.float64), 1e-9, 1.0)
    probs = probs / probs.sum()
    entropy = float(-(probs * np.log(probs)).sum() / math.log(3.0))
    certainty = 1.0 - entropy
    ordered = np.sort(probs)[::-1]
    margin = float(ordered[0] - ordered[1]) if ordered.size >= 2 else 0.0

    ctx = contextual_features or {}
    season_matches = min(
        float(ctx.get("home_season_matches_played", 0.0) or 0.0),
        float(ctx.get("away_season_matches_played", 0.0) or 0.0),
    )
    sample_score = float(np.clip(season_matches / 8.0, 0.0, 1.0))
    starters_known = min(
        float(ctx.get("home_n_starters", 0.0) or 0.0),
        float(ctx.get("away_n_starters", 0.0) or 0.0),
    )
    lineup_score = float(np.clip(starters_known / 9.0, 0.0, 1.0))
    priors_present = any(
        abs(float(ctx.get(key, 0.0) or 0.0)) > 1e-9
        for key in ("home_team_xg_per_match", "away_team_xg_per_match", "home_team_points_per_match", "away_team_points_per_match")
    )
    prior_score = 1.0 if priors_present else 0.0

    confidence_score = float(np.clip(certainty * 0.55 + min(margin * 2.0, 1.0) * 0.25 + sample_score * 0.10 + lineup_score * 0.10, 0.0, 1.0))
    data_quality_score = float(np.clip(sample_score * 0.55 + lineup_score * 0.30 + prior_score * 0.15, 0.0, 1.0))

    def _band(score: float) -> str:
        if score >= 0.8:
            return "high"
        if score >= 0.55:
            return "medium"
        return "low"

    notes: list[str] = []
    if margin >= 0.15:
        notes.append("The model has a clear 1X2 lean.")
    elif margin <= 0.07:
        notes.append("The 1X2 distribution is flat, so variance is higher.")
    if season_matches < 5:
        notes.append("Current-season sample size is still thin.")
    if starters_known < 7:
        notes.append("Projected lineups still lean on role priors more than confirmed roles.")
    if calibration_applied:
        notes.append("Historical out-of-fold calibration was applied to sharpen probability estimates.")

    return {
        "confidence_score": round(confidence_score, 4),
        "confidence_band": _band(confidence_score),
        "data_quality_score": round(data_quality_score, 4),
        "data_quality_band": _band(data_quality_score),
        "uncertainty": round(entropy, 4),
        "calibration_applied": bool(calibration_applied),
        "notes": notes,
    }
