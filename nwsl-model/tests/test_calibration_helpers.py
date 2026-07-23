from __future__ import annotations

import numpy as np
import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.models.calibration import (
    apply_market_calibration,
    apply_prediction_calibration,
    compute_oof_calibrated_predictions,
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


def _synthetic_predictions(n: int = 60, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    raw = rng.dirichlet([3.0, 2.0, 2.5], size=n)
    home_goals = rng.poisson(1.4, size=n)
    away_goals = rng.poisson(1.1, size=n)
    return pd.DataFrame(
        {
            "match_date": pd.date_range("2026-05-01", periods=n, freq="D").astype(str),
            "match_id": [f"m{i}" for i in range(n)],
            "prob_home": raw[:, 0],
            "prob_draw": raw[:, 1],
            "prob_away": raw[:, 2],
            "home_goals_90": home_goals,
            "away_goals_90": away_goals,
            "prob_over_2.5": rng.uniform(0.3, 0.7, size=n),
        }
    )


def test_oof_calibration_returns_normalized_calibrated_columns() -> None:
    frame = _synthetic_predictions()

    calibrated = compute_oof_calibrated_predictions(frame, n_folds=5, seed=0)

    required = {"prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"}
    assert required.issubset(calibrated.columns)
    assert len(calibrated) == len(frame)
    sums = calibrated[list(required)].sum(axis=1)
    assert np.allclose(sums.to_numpy(), 1.0, atol=1e-6)


def test_oof_calibration_is_out_of_fold_not_in_sample() -> None:
    # An out-of-fold scheme must differ from fitting and applying on the same
    # rows; otherwise it would leak each row's own outcome into its calibrator.
    frame = _synthetic_predictions(seed=7)

    oof = compute_oof_calibrated_predictions(frame, n_folds=5, seed=0)
    in_sample = apply_prediction_calibration(frame, fit_prediction_calibrators(frame))

    cols = ["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]
    assert not np.allclose(
        oof[cols].to_numpy(dtype=float),
        in_sample[cols].to_numpy(dtype=float),
    )


def test_oof_calibration_is_deterministic_for_a_seed() -> None:
    frame = _synthetic_predictions(seed=3)

    first = compute_oof_calibrated_predictions(frame, n_folds=5, seed=11)
    second = compute_oof_calibrated_predictions(frame, n_folds=5, seed=11)

    cols = ["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]
    assert np.array_equal(first[cols].to_numpy(dtype=float), second[cols].to_numpy(dtype=float))


def test_projection_quality_returns_prediction_fields() -> None:
    quality = summarize_projection_quality(0.5, 0.25, 0.25)

    assert {"confidence_score", "confidence_band", "data_quality_score", "data_quality_band", "uncertainty", "notes"}.issubset(quality)
