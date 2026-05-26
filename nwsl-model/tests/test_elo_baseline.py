import numpy as np
import pandas as pd

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
    assert all(abs(actual - expected) < 0.06 for actual, expected in zip(matrix_probs, expected_probs))
    assert abs(pred.home_win_prob - expected_probs[0]) < 1e-12
    assert abs(pred.draw_prob - expected_probs[1]) < 1e-12
    assert abs(pred.away_win_prob - expected_probs[2]) < 1e-12


def test_regularized_elo_baseline_can_run_when_listed_as_benchmark() -> None:
    models_to_run = resolve_models_to_run(
        ["dixon_coles"],
        {"benchmarks": ["regularized_elo_baseline"], "run_ablations": False},
    )

    assert "regularized_elo_baseline" in models_to_run
    assert "regularized_elo_baseline" in BASELINE_MODELS
