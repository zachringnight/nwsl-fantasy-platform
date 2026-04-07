from __future__ import annotations

import numpy as np
import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.models.calibration import (
    apply_market_calibration,
    apply_prediction_calibration,
    fit_binary_calibrator,
    fit_prediction_calibrators,
    summarize_projection_quality,
)


def test_fit_binary_calibrator_is_monotonic() -> None:
    probs = np.array([0.05, 0.10, 0.15, 0.40, 0.45, 0.50, 0.75, 0.80, 0.85, 0.90])
    actual = np.array([0, 0, 0, 0, 1, 0, 1, 1, 1, 1])

    calibrator = fit_binary_calibrator(probs, actual, n_bins=5)
    values = np.array(calibrator["bin_values"], dtype=float)

    assert calibrator["method"] == "binned_beta_monotonic"
    assert np.all(np.diff(values) >= -1e-9)


def test_apply_prediction_calibration_renormalizes_1x2_and_totals() -> None:
    preds = pd.DataFrame(
        [
            {
                "prob_home": 0.62,
                "prob_draw": 0.18,
                "prob_away": 0.20,
                "prob_over_2.5": 0.71,
                "prob_over_3.5": 0.45,
                "home_goals_90": 2,
                "away_goals_90": 0,
            },
            {
                "prob_home": 0.25,
                "prob_draw": 0.30,
                "prob_away": 0.45,
                "prob_over_2.5": 0.38,
                "prob_over_3.5": 0.17,
                "home_goals_90": 1,
                "away_goals_90": 2,
            },
        ]
    )

    calibrators = fit_prediction_calibrators(preds)
    calibrated = apply_prediction_calibration(preds, calibrators)

    assert {"prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"}.issubset(calibrated.columns)
    row_sums = calibrated[["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]].sum(axis=1)
    assert np.allclose(row_sums.to_numpy(), 1.0)
    assert "prob_over_2.5_calibrated" in calibrated.columns
    assert "prob_over_3.5_calibrated" in calibrated.columns


def test_apply_market_calibration_updates_prices() -> None:
    markets = MarketPrices(
        home_prob=0.50,
        draw_prob=0.24,
        away_prob=0.26,
        home_fair_odds=2.0,
        draw_fair_odds=4.17,
        away_fair_odds=3.85,
        over_probs={2.5: 0.60},
        under_probs={2.5: 0.40},
        over_fair_odds={2.5: 1.67},
        under_fair_odds={2.5: 2.5},
    )
    calibrators = {
        "1x2": {
            "home": fit_binary_calibrator(np.array([0.50, 0.55, 0.60]), np.array([0, 1, 1]), n_bins=3),
            "draw": fit_binary_calibrator(np.array([0.20, 0.24, 0.28]), np.array([0, 0, 1]), n_bins=3),
            "away": fit_binary_calibrator(np.array([0.22, 0.26, 0.30]), np.array([1, 0, 0]), n_bins=3),
        },
        "totals": {
            "2.5": fit_binary_calibrator(np.array([0.55, 0.60, 0.65]), np.array([0, 1, 1]), n_bins=3),
        },
    }

    calibrated = apply_market_calibration(markets, calibrators)

    assert abs(calibrated.home_prob + calibrated.draw_prob + calibrated.away_prob - 1.0) < 1e-9
    assert calibrated.over_probs[2.5] != 0.60
    assert calibrated.over_fair_odds[2.5] > 1.0


def test_summarize_projection_quality_flags_thin_context() -> None:
    quality = summarize_projection_quality(
        0.41,
        0.29,
        0.30,
        contextual_features={
            "home_season_matches_played": 2,
            "away_season_matches_played": 2,
            "home_n_starters": 5,
            "away_n_starters": 6,
        },
        calibration_applied=True,
    )

    assert quality["confidence_band"] in {"low", "medium", "high"}
    assert quality["data_quality_band"] == "low"
    assert quality["calibration_applied"] is True
    assert any("thin" in note.lower() or "role priors" in note.lower() for note in quality["notes"])
