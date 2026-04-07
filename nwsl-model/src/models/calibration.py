"""Model calibration assessment and adjustment."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray

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
