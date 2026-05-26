from __future__ import annotations

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
                "regularization": 0.1,
                "contextual_regularization": 0.2,
                "rho_regularization": 0.3,
            },
            "bivariate_poisson": {
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
    assert bivariate_poisson.bp_config.regularization == 0.7
    assert bivariate_poisson.bp_config.contextual_regularization == 0.5
    assert bivariate_poisson.bp_config.lambda3_regularization == 0.9
