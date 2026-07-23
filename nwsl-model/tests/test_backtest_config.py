from __future__ import annotations

import pandas as pd

from src.backtest.runner import BacktestRunner


def test_backtest_fit_overrides_score_model_optimizer_settings() -> None:
    runner = BacktestRunner(
        {
            "model": {"max_goals": 8},
            "dixon_coles": {"max_iter": 2000, "tol": 1e-8},
            "bivariate_poisson": {"max_iter": 2000, "tol": 1e-8},
            "backtest": {
                "fit": {
                    "common": {"max_iter": 25, "tol": 1e-5},
                    "bivariate_poisson": {"max_iter": 15},
                }
            },
        }
    )

    dixon_coles = runner._create_model("dixon_coles")
    bivariate_poisson = runner._create_model("bivariate_poisson")

    assert dixon_coles.config.max_iter == 25
    assert dixon_coles.config.tol == 1e-5
    assert bivariate_poisson.config.max_iter == 15
    assert bivariate_poisson.config.tol == 1e-5


def test_backtest_fit_overrides_score_model_regularization_settings() -> None:
    runner = BacktestRunner(
        {
            "model": {"max_goals": 8},
            "dixon_coles": {
                "home_advantage_scale": 0.8,
                "home_advantage_cap": 0.12,
                "regularization": 0.1,
                "contextual_regularization": 0.2,
                "rho_regularization": 0.3,
            },
            "bivariate_poisson": {
                "home_advantage_scale": 0.7,
                "home_advantage_cap": 0.11,
                "regularization": 0.4,
                "contextual_regularization": 0.5,
                "lambda3_regularization": 0.6,
            },
            "backtest": {
                "fit": {
                    "common": {"regularization": 0.7},
                    "dixon_coles": {"rho_regularization": 0.8},
                    "bivariate_poisson": {"lambda3_regularization": 0.9},
                }
            },
        }
    )

    dixon_coles = runner._create_model("dixon_coles")
    bivariate_poisson = runner._create_model("bivariate_poisson")

    assert dixon_coles.dc_config.regularization == 0.7
    assert dixon_coles.dc_config.contextual_regularization == 0.2
    assert dixon_coles.dc_config.rho_regularization == 0.8
    assert dixon_coles.dc_config.home_advantage_scale == 0.8
    assert dixon_coles.dc_config.home_advantage_cap == 0.12
    assert bivariate_poisson.bp_config.regularization == 0.7
    assert bivariate_poisson.bp_config.contextual_regularization == 0.5
    assert bivariate_poisson.bp_config.lambda3_regularization == 0.9
    assert bivariate_poisson.bp_config.home_advantage_scale == 0.7
    assert bivariate_poisson.bp_config.home_advantage_cap == 0.11


def test_backtest_uses_historical_quote_time_for_stale_check() -> None:
    odds_rows = pd.DataFrame(
        [
            {"timestamp": "2025-04-01T20:00:00+00:00"},
            {"timestamp": "2025-04-01T21:00:00+00:00"},
        ]
    )

    evaluation_time = BacktestRunner._historical_odds_evaluation_time(odds_rows)

    assert evaluation_time.isoformat() == "2025-04-01T21:00:00+00:00"
