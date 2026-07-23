"""Model calibration assessment and adjustment."""

from __future__ import annotations

import copy
import logging
from typing import Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from src.betting.market_derivation import MarketPrices
from src.utils.math_utils import decimal_from_probability

logger = logging.getLogger("nwsl_model.models.calibration")


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


def _fit_binary_calibrator(
    predicted_probs: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    n_bins: int = 12,
    prior_strength: float = 8.0,
) -> dict:
    probs = np.clip(np.asarray(predicted_probs, dtype=float), 0.0, 1.0)
    actual = np.asarray(outcomes, dtype=int)
    valid = np.isfinite(probs)
    probs = probs[valid]
    actual = actual[valid]
    global_rate = float(actual.mean()) if len(actual) else 0.5
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    bin_values: list[float] = []
    bin_counts: list[int] = []

    for index in range(n_bins):
        lo, hi = bin_edges[index], bin_edges[index + 1]
        mask = (probs >= lo) & (probs < hi)
        if index == n_bins - 1:
            mask = (probs >= lo) & (probs <= hi)
        count = int(mask.sum())
        bin_counts.append(count)
        observed = float(actual[mask].sum()) if count else 0.0
        calibrated = (observed + prior_strength * global_rate) / (count + prior_strength)
        bin_values.append(float(np.clip(calibrated, 0.001, 0.999)))

    bin_values = np.maximum.accumulate(np.asarray(bin_values, dtype=float)).tolist()
    return {
        "method": "binned_beta_monotonic",
        "n_bins": n_bins,
        "prior_strength": prior_strength,
        "global_rate": global_rate,
        "bin_edges": bin_edges.tolist(),
        "bin_values": bin_values,
        "bin_counts": bin_counts,
        "n_samples": int(len(actual)),
    }


def _apply_binned_calibrator(probability: float, calibrator: dict | None) -> float:
    if not calibrator:
        return float(np.clip(probability, 0.001, 0.999))
    edges = calibrator.get("bin_edges") or []
    values = calibrator.get("bin_values") or []
    if len(edges) < 2 or not values:
        return float(np.clip(probability, 0.001, 0.999))
    probability = float(np.clip(probability, 0.0, 1.0))
    index = int(np.searchsorted(np.asarray(edges, dtype=float), probability, side="right") - 1)
    index = max(0, min(index, len(values) - 1))
    return float(np.clip(values[index], 0.001, 0.999))


def fit_prediction_calibrators(predictions: pd.DataFrame) -> dict[str, object]:
    """Fit simple binned calibrators from backtest predictions."""
    required = {"prob_home", "prob_draw", "prob_away", "home_goals_90", "away_goals_90"}
    if predictions.empty or not required.issubset(predictions.columns):
        return {}

    home_actual = (predictions["home_goals_90"] > predictions["away_goals_90"]).astype(int).to_numpy()
    draw_actual = (predictions["home_goals_90"] == predictions["away_goals_90"]).astype(int).to_numpy()
    away_actual = (predictions["home_goals_90"] < predictions["away_goals_90"]).astype(int).to_numpy()

    calibrators: dict[str, object] = {
        "method": "binned_beta_monotonic",
        "1x2": {
            "home": _fit_binary_calibrator(predictions["prob_home"].to_numpy(dtype=float), home_actual),
            "draw": _fit_binary_calibrator(predictions["prob_draw"].to_numpy(dtype=float), draw_actual),
            "away": _fit_binary_calibrator(predictions["prob_away"].to_numpy(dtype=float), away_actual),
        },
        "totals": {},
    }

    total_goals = predictions["home_goals_90"].astype(float) + predictions["away_goals_90"].astype(float)
    for line in (1.5, 2.5, 3.5, 4.5):
        column = f"prob_over_{line}"
        if column not in predictions.columns:
            continue
        mask = predictions[column].notna()
        if not mask.any():
            continue
        calibrators["totals"][str(line)] = _fit_binary_calibrator(
            predictions.loc[mask, column].to_numpy(dtype=float),
            (total_goals.loc[mask] > line).astype(int).to_numpy(),
        )
    return calibrators


def apply_prediction_calibration(predictions: pd.DataFrame, calibrators: dict[str, object]) -> pd.DataFrame:
    """Apply fitted calibrators to a prediction DataFrame."""
    if predictions.empty or not calibrators:
        return pd.DataFrame(index=predictions.index)

    output = predictions.copy()
    one_x_two = calibrators.get("1x2", {}) if isinstance(calibrators, dict) else {}
    if one_x_two and {"prob_home", "prob_draw", "prob_away"}.issubset(output.columns):
        raw = np.column_stack([
            output["prob_home"].map(lambda value: _apply_binned_calibrator(value, one_x_two.get("home"))),
            output["prob_draw"].map(lambda value: _apply_binned_calibrator(value, one_x_two.get("draw"))),
            output["prob_away"].map(lambda value: _apply_binned_calibrator(value, one_x_two.get("away"))),
        ]).astype(float)
        row_sums = raw.sum(axis=1)
        row_sums[row_sums == 0] = 1.0
        normalized = raw / row_sums[:, None]
        output["prob_home_calibrated"] = normalized[:, 0]
        output["prob_draw_calibrated"] = normalized[:, 1]
        output["prob_away_calibrated"] = normalized[:, 2]

    totals = calibrators.get("totals", {}) if isinstance(calibrators, dict) else {}
    for line, calibrator in totals.items():
        column = f"prob_over_{line}"
        if column not in output.columns:
            continue
        output[f"{column}_calibrated"] = output[column].map(
            lambda value: _apply_binned_calibrator(value, calibrator) if pd.notna(value) else np.nan
        )
    return output


def compute_oof_calibrated_predictions(
    predictions: pd.DataFrame,
    n_folds: int = 5,
    seed: int = 0,
) -> pd.DataFrame:
    """Cross-fit calibration so no row is calibrated by a map fit on itself.

    The base backtest predictions are already walk-forward out-of-fold, but the
    calibration overlay must also be out-of-fold or its measured benefit is an
    in-sample artifact. Each row is assigned to one of ``n_folds`` folds; for
    each fold the calibrator is fit on the *other* folds and applied to the
    held-out fold. The assembled frame is an honest generalization estimate.
    """
    if predictions.empty:
        return pd.DataFrame(index=predictions.index)

    n = len(predictions)
    effective_folds = max(2, min(n_folds, n))
    rng = np.random.default_rng(seed)
    shuffled = rng.permutation(n)
    fold_of_position = np.empty(n, dtype=int)
    fold_of_position[shuffled] = np.arange(n) % effective_folds

    reset = predictions.reset_index(drop=True)
    calibrated_parts: list[pd.DataFrame] = []
    for fold in range(effective_folds):
        train_mask = fold_of_position != fold
        test_mask = fold_of_position == fold
        if not test_mask.any():
            continue
        train_frame = reset.loc[train_mask]
        test_frame = reset.loc[test_mask]
        calibrators = fit_prediction_calibrators(train_frame) if not train_frame.empty else {}
        if calibrators:
            calibrated_parts.append(apply_prediction_calibration(test_frame, calibrators))
        else:
            calibrated_parts.append(apply_prediction_calibration(test_frame, fit_prediction_calibrators(test_frame)))

    calibrated = pd.concat(calibrated_parts).sort_index()
    calibrated.index = predictions.index
    return calibrated


def apply_market_calibration(markets: MarketPrices, calibration_artifact: dict[str, object]) -> MarketPrices:
    """Apply post-hoc calibration artifacts to derived market probabilities."""
    calibrated = copy.deepcopy(markets)
    one_x_two = calibration_artifact.get("1x2", {}) if calibration_artifact else {}
    if one_x_two:
        probs = np.asarray([
            _apply_binned_calibrator(calibrated.home_prob, one_x_two.get("home")),
            _apply_binned_calibrator(calibrated.draw_prob, one_x_two.get("draw")),
            _apply_binned_calibrator(calibrated.away_prob, one_x_two.get("away")),
        ], dtype=float)
        total = float(probs.sum()) or 1.0
        probs = probs / total
        calibrated.home_prob, calibrated.draw_prob, calibrated.away_prob = map(float, probs)
        calibrated.home_fair_odds = decimal_from_probability(calibrated.home_prob)
        calibrated.draw_fair_odds = decimal_from_probability(calibrated.draw_prob)
        calibrated.away_fair_odds = decimal_from_probability(calibrated.away_prob)

    totals = calibration_artifact.get("totals", {}) if calibration_artifact else {}
    for line_text, calibrator in totals.items():
        line = float(line_text)
        if line not in calibrated.over_probs:
            continue
        over = _apply_binned_calibrator(calibrated.over_probs[line], calibrator)
        calibrated.over_probs[line] = over
        calibrated.under_probs[line] = 1.0 - over
        calibrated.over_fair_odds[line] = decimal_from_probability(over)
        calibrated.under_fair_odds[line] = decimal_from_probability(1.0 - over)
    return calibrated


def summarize_projection_quality(
    home_probability: float,
    draw_probability: float,
    away_probability: float,
    *,
    contextual_features: dict | None = None,
    calibration_applied: bool = False,
) -> dict[str, object]:
    """Summarize how sharp and data-supported a projection is."""
    probs = np.asarray([home_probability, draw_probability, away_probability], dtype=float)
    probs = np.clip(probs, 1e-9, 1.0)
    probs = probs / probs.sum()
    entropy = float(-np.sum(probs * np.log(probs)) / np.log(3.0))
    confidence_score = float(np.clip(1.0 - entropy, 0.0, 1.0))
    data_quality_score = 0.8 if contextual_features else 0.65
    if calibration_applied:
        data_quality_score += 0.1
    data_quality_score = float(np.clip(data_quality_score, 0.0, 1.0))
    notes: list[str] = []
    if contextual_features:
        notes.append("contextual_features_available")
    else:
        notes.append("team_strength_only")
    if calibration_applied:
        notes.append("posthoc_calibration_applied")
    return {
        "confidence_score": confidence_score,
        "confidence_band": "high" if confidence_score >= 0.35 else ("medium" if confidence_score >= 0.18 else "low"),
        "data_quality_score": data_quality_score,
        "data_quality_band": "high" if data_quality_score >= 0.8 else ("medium" if data_quality_score >= 0.6 else "low"),
        "uncertainty": entropy,
        "calibration_applied": calibration_applied,
        "notes": notes,
    }


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
