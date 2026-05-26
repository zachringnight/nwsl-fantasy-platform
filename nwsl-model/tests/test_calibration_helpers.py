from __future__ import annotations

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.models.calibration import (
    apply_market_calibration,
    apply_prediction_calibration,
    fit_prediction_calibrators,
    summarize_projection_quality,
)


def test_prediction_calibration_round_trips_required_columns() -> None:
    frame = pd.DataFrame(
        {
            "prob_home": [0.55, 0.30],
            "prob_draw": [0.25, 0.25],
            "prob_away": [0.20, 0.45],
            "home_goals_90": [2, 0],
            "away_goals_90": [1, 1],
            "prob_over_2.5": [0.60, 0.35],
        }
    )

    calibrators = fit_prediction_calibrators(frame)
    calibrated = apply_prediction_calibration(frame, calibrators)

    assert {"prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"}.issubset(calibrated.columns)
    assert calibrated[["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]].sum(axis=1).round(6).eq(1.0).all()


def test_market_calibration_preserves_probability_mass() -> None:
    markets = MarketPrices(match_id="1", home_prob=0.5, draw_prob=0.25, away_prob=0.25)
    artifact = {
        "1x2": {
            "home": {"bin_edges": [0, 1], "bin_values": [0.6]},
            "draw": {"bin_edges": [0, 1], "bin_values": [0.2]},
            "away": {"bin_edges": [0, 1], "bin_values": [0.2]},
        }
    }

    calibrated = apply_market_calibration(markets, artifact)

    assert round(calibrated.home_prob + calibrated.draw_prob + calibrated.away_prob, 6) == 1.0
    assert calibrated.home_prob == 0.6


def test_projection_quality_returns_prediction_fields() -> None:
    quality = summarize_projection_quality(0.5, 0.25, 0.25)

    assert {"confidence_score", "confidence_band", "data_quality_score", "data_quality_band", "uncertainty", "notes"}.issubset(quality)
