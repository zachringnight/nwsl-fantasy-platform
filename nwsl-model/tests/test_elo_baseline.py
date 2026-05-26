from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from src.backtest.runner import BASELINE_MODELS, resolve_models_to_run
from src.betting.score_matrix import derive_1x2
from src.models.elo_baseline import RegularizedEloBaseline


def test_regularized_elo_baseline_updates_home_and_away_ratings() -> None:
    model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)
    matches = pd.DataFrame(
        [
            {
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 2,
                "away_goals_90": 0,
            }
        ]
    )

    model.fit(matches)

    assert model.ratings["Orlando Pride"] > 1500.0
    assert model.ratings["Bay FC"] < 1500.0


def test_regularized_elo_baseline_predicts_valid_1x2_probs() -> None:
    model = RegularizedEloBaseline()

    probs = model.predict_1x2("Orlando Pride", "Bay FC")

    assert abs(sum(probs) - 1.0) < 1e-12
    assert all(0.0 < value < 1.0 for value in probs)


def test_regularized_elo_baseline_prediction_preserves_elo_expected_score() -> None:
    model = RegularizedEloBaseline()
    home_team = "Orlando Pride"
    away_team = "Bay FC"

    home_prob, draw_prob, _ = model.predict_1x2(home_team, away_team)
    expected_score_from_probs = home_prob + 0.5 * draw_prob
    expected_score_from_elo = model._expected_home_score(
        model._rating(home_team),
        model._rating(away_team),
    )

    assert abs(expected_score_from_probs - expected_score_from_elo) < 1e-12


def test_regularized_elo_baseline_updates_less_aggressively_on_draws() -> None:
    win_model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)
    draw_model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)

    win_model.fit(
        pd.DataFrame(
            [
                {
                    "home_team": "Orlando Pride",
                    "away_team": "Bay FC",
                    "home_goals_90": 2,
                    "away_goals_90": 0,
                }
            ]
        )
    )
    draw_model.fit(
        pd.DataFrame(
            [
                {
                    "home_team": "Orlando Pride",
                    "away_team": "Bay FC",
                    "home_goals_90": 1,
                    "away_goals_90": 1,
                }
            ]
        )
    )

    win_delta = abs(win_model.ratings["Orlando Pride"] - 1500.0)
    draw_delta = abs(draw_model.ratings["Orlando Pride"] - 1500.0)

    assert 0.0 < draw_delta < win_delta
    assert win_model.ratings["Orlando Pride"] > 1500.0
    assert draw_model.ratings["Orlando Pride"] < 1500.0


def test_regularized_elo_baseline_draw_update_is_smaller_than_either_decisive_result() -> None:
    home_win_model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)
    draw_model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)
    away_win_model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)
    base_match = {
        "home_team": "Orlando Pride",
        "away_team": "Bay FC",
    }

    home_win_model.fit(pd.DataFrame([{**base_match, "home_goals_90": 2, "away_goals_90": 0}]))
    draw_model.fit(pd.DataFrame([{**base_match, "home_goals_90": 1, "away_goals_90": 1}]))
    away_win_model.fit(pd.DataFrame([{**base_match, "home_goals_90": 0, "away_goals_90": 2}]))

    draw_delta = abs(draw_model.ratings["Orlando Pride"] - 1500.0)
    home_win_delta = abs(home_win_model.ratings["Orlando Pride"] - 1500.0)
    away_win_delta = abs(away_win_model.ratings["Orlando Pride"] - 1500.0)

    assert draw_model.ratings["Orlando Pride"] < 1500.0
    assert draw_delta < home_win_delta
    assert draw_delta < away_win_delta


def test_regularized_elo_baseline_fits_match_dates_chronologically() -> None:
    out_of_order_matches = pd.DataFrame(
        [
            {
                "match_date": "2026-03-09",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 0,
                "away_goals_90": 2,
            },
            {
                "match_date": "2026-03-02",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 2,
                "away_goals_90": 0,
            },
        ]
    )
    chronological_matches = out_of_order_matches.sort_values("match_date", kind="stable")

    out_of_order_model = RegularizedEloBaseline()
    chronological_model = RegularizedEloBaseline()

    out_of_order_model.fit(out_of_order_matches)
    chronological_model.fit(chronological_matches)

    assert out_of_order_model.ratings == chronological_model.ratings


def test_regularized_elo_baseline_extreme_rating_gaps_keep_nonzero_valid_probs() -> None:
    model = RegularizedEloBaseline()
    model.ratings = {"Orlando Pride": 2400.0, "Bay FC": 600.0}

    probs = model.predict_1x2("Orlando Pride", "Bay FC")

    assert abs(sum(probs) - 1.0) < 1e-12
    assert all(0.0 < value < 1.0 for value in probs)
    assert probs[0] > probs[1] > probs[2]


def test_regularized_elo_baseline_draw_probability_shrinks_observed_rate_to_prior() -> None:
    model = RegularizedEloBaseline(draw_prior=0.27, draw_prior_weight=4.0)
    matches = pd.DataFrame(
        [
            {
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 1,
                "away_goals_90": 1,
            },
            {
                "home_team": "Gotham FC",
                "away_team": "Seattle Reign",
                "home_goals_90": 0,
                "away_goals_90": 0,
            },
            {
                "home_team": "Angel City",
                "away_team": "Portland Thorns",
                "home_goals_90": 2,
                "away_goals_90": 2,
            },
            {
                "home_team": "San Diego Wave",
                "away_team": "Kansas City Current",
                "home_goals_90": 3,
                "away_goals_90": 3,
            },
        ]
    )

    model.fit(matches)

    _, draw_prob, _ = model.predict_1x2("Orlando Pride", "Bay FC")

    assert draw_prob == (4.0 + 0.27 * 4.0) / 8.0


def test_regularized_elo_baseline_score_matrix_is_normalized_and_matches_1x2() -> None:
    model = RegularizedEloBaseline(max_goals=8)

    pred = model.predict_score_matrix("Orlando Pride", "Bay FC")
    expected_probs = model.predict_1x2("Orlando Pride", "Bay FC")
    matrix_probs = derive_1x2(pred.score_matrix)

    assert pred.score_matrix.shape == (9, 9)
    assert abs(float(np.sum(pred.score_matrix)) - 1.0) < 1e-12
    assert all(abs(actual - expected) < 1e-12 for actual, expected in zip(matrix_probs, expected_probs))
    assert abs(pred.home_win_prob - expected_probs[0]) < 1e-12
    assert abs(pred.draw_prob - expected_probs[1]) < 1e-12
    assert abs(pred.away_win_prob - expected_probs[2]) < 1e-12


def test_regularized_elo_baseline_returns_lambdas_from_calibrated_matrix() -> None:
    model = RegularizedEloBaseline(max_goals=8)

    pred = model.predict_score_matrix("Orlando Pride", "Bay FC")
    goals = np.arange(pred.score_matrix.shape[0], dtype=np.float64)
    lambda_home = float((goals[:, None] * pred.score_matrix).sum())
    lambda_away = float((goals[None, :] * pred.score_matrix).sum())

    assert abs(pred.lambda_home - lambda_home) < 1e-12
    assert abs(pred.lambda_away - lambda_away) < 1e-12


def test_regularized_elo_baseline_can_run_when_listed_as_benchmark() -> None:
    models_to_run = resolve_models_to_run(
        ["dixon_coles"],
        {"benchmarks": ["regularized_elo_baseline"], "run_ablations": False},
    )

    assert "regularized_elo_baseline" in models_to_run
    assert "regularized_elo_baseline" in BASELINE_MODELS


def test_regularized_elo_baseline_is_not_in_default_benchmarks() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    with open(config_path, encoding="utf-8") as config_file:
        config = yaml.safe_load(config_file)

    assert "regularized_elo_baseline" not in config["backtest"]["benchmarks"]
    assert "regularized_elo_baseline" in BASELINE_MODELS
