from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scripts.evaluate_totals_model import build_totals_model_report
from src.models.totals_market_model import TotalsMarketModel


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _synthetic_frame(n: int = 140, seed: int = 7) -> pd.DataFrame:
    """Rows where the market is well calibrated and the model's own raw
    prob_over_main_total is deliberately biased (mirrors the launch diagnostics
    finding: independent-Poisson totals underprice overs)."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-01", periods=n, freq="D").strftime("%Y-%m-%d")

    lambda_home = rng.uniform(0.7, 1.8, size=n)
    lambda_away = rng.uniform(0.6, 1.6, size=n)
    total_lambda = lambda_home + lambda_away

    raw_line = total_lambda + rng.normal(0.0, 0.3, size=n)
    main_total_line = np.round(raw_line * 2) / 2.0

    diff = total_lambda - main_total_line
    p_true = _sigmoid(1.6 * diff + rng.normal(0.0, 0.15, size=n))
    p_true = np.clip(p_true, 0.03, 0.97)
    outcome = (rng.uniform(size=n) < p_true).astype(int)

    # total_goals only needs to be consistent with outcome relative to the line
    # (no-push, correct side); the exact goal count is not otherwise used.
    total_goals = np.where(outcome == 1, main_total_line + 0.5, main_total_line - 0.5)

    # Deliberately biased raw model probability (systematically underprices overs).
    prob_over_main_total = np.clip(p_true - 0.20, 0.02, 0.98)

    # Well-calibrated market with a small overround.
    implied_over = np.clip(p_true * 1.02, 0.01, 0.99)
    implied_under = np.clip((1.0 - p_true) * 1.02, 0.01, 0.99)
    main_total_over_market_odds = 1.0 / implied_over
    main_total_under_market_odds = 1.0 / implied_under

    return pd.DataFrame(
        {
            "match_id": [f"m{i}" for i in range(n)],
            "match_date": dates,
            "lambda_home": lambda_home,
            "lambda_away": lambda_away,
            "main_total_line": main_total_line,
            "prob_over_main_total": prob_over_main_total,
            "main_total_over_market_odds": main_total_over_market_odds,
            "main_total_under_market_odds": main_total_under_market_odds,
            "total_goals": total_goals,
        }
    )


def _binary_log_loss(probs: np.ndarray, outcomes: np.ndarray, eps: float = 1e-15) -> float:
    clipped = np.clip(probs, eps, 1.0 - eps)
    actual = outcomes.astype(float)
    return float(-np.mean(actual * np.log(clipped) + (1.0 - actual) * np.log(1.0 - clipped)))


def test_walk_forward_model_beats_biased_base_on_log_loss() -> None:
    frame = _synthetic_frame(n=140, seed=7)
    model = TotalsMarketModel(regularization_c=1.0, min_train_matches=20)

    evaluated = model.walk_forward_evaluate(frame, block="match_date")

    assert len(evaluated) == 140
    outcome = evaluated["outcome"].to_numpy()
    model_ll = _binary_log_loss(evaluated["prob_model"].to_numpy(), outcome)
    base_ll = _binary_log_loss(evaluated["prob_base"].to_numpy(), outcome)

    assert model_ll < base_ll - 0.03


def test_push_rows_excluded_from_fit_and_metrics() -> None:
    frame = _synthetic_frame(n=80, seed=11)
    push_rows = pd.DataFrame(
        {
            "match_id": ["push1", "push2"],
            "match_date": ["2024-04-01", "2024-04-02"],
            "lambda_home": [1.1, 1.2],
            "lambda_away": [1.1, 1.0],
            "main_total_line": [2.5, 2.5],
            "prob_over_main_total": [0.5, 0.5],
            "main_total_over_market_odds": [1.9, 1.9],
            "main_total_under_market_odds": [1.9, 1.9],
            "total_goals": [2.5, 2.5],  # push: total_goals == line
        }
    )
    combined = pd.concat([frame, push_rows], ignore_index=True)

    model = TotalsMarketModel(regularization_c=1.0, min_train_matches=20)
    evaluated = model.walk_forward_evaluate(combined, block="match_date")

    assert "push1" not in evaluated["match_id"].tolist()
    assert "push2" not in evaluated["match_id"].tolist()
    assert len(evaluated) == 80

    # fit() directly should also drop push rows regardless of min_train_matches.
    fit_only_model = TotalsMarketModel(regularization_c=1.0, min_train_matches=5)
    usable_mask = fit_only_model._usable_mask(combined)
    assert not usable_mask.loc[combined["match_id"] == "push1"].any()
    assert not usable_mask.loc[combined["match_id"] == "push2"].any()


def test_no_lookahead_prediction_unchanged_by_future_mutation() -> None:
    frame = _synthetic_frame(n=60, seed=3)
    model = TotalsMarketModel(regularization_c=1.0, min_train_matches=15)

    baseline_result = model.walk_forward_evaluate(frame, block="match_date")
    target_date = frame.loc[40, "match_date"]
    baseline_row = baseline_result.loc[baseline_result["match_date"] == target_date].iloc[0]

    mutated = frame.copy()
    future_mask = mutated["match_date"] > target_date
    rng = np.random.default_rng(999)
    n_future = int(future_mask.sum())
    mutated.loc[future_mask, "lambda_home"] = rng.uniform(3.0, 5.0, size=n_future)
    mutated.loc[future_mask, "lambda_away"] = rng.uniform(3.0, 5.0, size=n_future)
    mutated.loc[future_mask, "main_total_line"] = rng.uniform(5.0, 7.0, size=n_future)
    mutated.loc[future_mask, "prob_over_main_total"] = rng.uniform(0.01, 0.99, size=n_future)
    mutated.loc[future_mask, "total_goals"] = mutated.loc[future_mask, "main_total_line"] + 0.5

    mutated_result = model.walk_forward_evaluate(mutated, block="match_date")
    mutated_row = mutated_result.loc[mutated_result["match_date"] == target_date].iloc[0]

    assert mutated_row["prob_model"] == pytest.approx(baseline_row["prob_model"], abs=1e-9)
    assert mutated_row["prob_base"] == pytest.approx(baseline_row["prob_base"], abs=1e-9)


def test_predict_prob_over_falls_back_to_base_under_min_train_matches() -> None:
    frame = _synthetic_frame(n=30, seed=5)
    model = TotalsMarketModel(regularization_c=1.0, min_train_matches=100)
    model.fit(frame)

    assert model.fitted_ is False

    predicted = model.predict_prob_over(frame)
    pd.testing.assert_series_equal(
        predicted, frame["prob_over_main_total"].astype(float), check_names=False
    )

    # Rows without a line should be NaN, not the base value.
    frame_missing_line = frame.copy()
    frame_missing_line.loc[0, "main_total_line"] = np.nan
    predicted_missing = model.predict_prob_over(frame_missing_line)
    assert pd.isna(predicted_missing.loc[0])


def test_report_recommendation_hits_both_branches() -> None:
    # A larger sample keeps the expanding-window warmup rows (which fall back to
    # the deliberately biased base prob before min_train_matches is reached) a
    # small enough share of the pool for the model's pooled ECE to clear 0.06.
    good_frame = _synthetic_frame(n=600, seed=7)
    good_report = build_totals_model_report(
        good_frame,
        version="v-good",
        model_name="spi_lite_baseline",
        regularization_c=1.0,
        min_train_matches=20,
    )
    assert good_report["n_evaluated"] == 600
    assert good_report["recommendation"] == "candidate_for_recalibrated_leans"
    assert good_report["metrics"]["model"] is not None
    assert good_report["bias"]["base_bias_direction"] == "underprices_overs"

    # Too few rows to ever clear the n_evaluated >= 60 gate.
    small_frame = _synthetic_frame(n=25, seed=7)
    small_report = build_totals_model_report(
        small_frame,
        version="v-small",
        model_name="spi_lite_baseline",
        regularization_c=1.0,
        min_train_matches=20,
    )
    assert small_report["recommendation"] == "keep_suppressed"


def test_missing_main_total_line_column_reports_zero_without_raising() -> None:
    frame_no_column = pd.DataFrame(
        {
            "match_id": ["m1", "m2"],
            "match_date": ["2024-01-01", "2024-01-02"],
            "lambda_home": [1.0, 1.1],
            "lambda_away": [1.0, 1.0],
            "total_goals": [2, 3],
        }
    )
    report = build_totals_model_report(
        frame_no_column, version="v1", model_name="spi_lite_baseline"
    )
    assert report["n_evaluated"] == 0
    assert report["recommendation"] == "keep_suppressed"

    frame_all_null = _synthetic_frame(n=40, seed=2)
    frame_all_null["main_total_line"] = np.nan
    report_null = build_totals_model_report(
        frame_all_null, version="v2", model_name="spi_lite_baseline"
    )
    assert report_null["n_evaluated"] == 0
    assert report_null["recommendation"] == "keep_suppressed"

    report_empty = build_totals_model_report(
        pd.DataFrame(), version="v3", model_name="spi_lite_baseline"
    )
    assert report_empty["n_evaluated"] == 0
    assert report_empty["recommendation"] == "keep_suppressed"
