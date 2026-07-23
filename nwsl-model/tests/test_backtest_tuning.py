import pandas as pd

from scripts.tune_backtest import build_candidate_config
from src.backtest.runner import BacktestRunner
from src.backtest.tuning import candidate_id, rank_tuning_results


def test_rank_tuning_results_prefers_lower_log_loss_then_lower_brier() -> None:
    results = pd.DataFrame(
        [
            {"candidate": "reg_1000", "log_loss_1x2": 1.09, "brier_score_1x2": 0.66},
            {"candidate": "reg_2000", "log_loss_1x2": 1.08, "brier_score_1x2": 0.655},
            {"candidate": "reg_3000", "log_loss_1x2": 1.08, "brier_score_1x2": 0.650},
        ]
    )

    ranked = rank_tuning_results(results)

    assert ranked["candidate"].tolist() == ["reg_3000", "reg_2000", "reg_1000"]


def test_rank_tuning_results_uses_expected_total_goals_mae_as_third_tiebreaker() -> None:
    results = pd.DataFrame(
        [
            {
                "candidate": "reg_2000",
                "log_loss_1x2": 1.08,
                "brier_score_1x2": 0.650,
                "expected_total_goals_mae": 1.20,
            },
            {
                "candidate": "reg_3000",
                "log_loss_1x2": 1.08,
                "brier_score_1x2": 0.650,
                "expected_total_goals_mae": 1.10,
            },
        ]
    )

    ranked = rank_tuning_results(results)

    assert ranked["candidate"].tolist() == ["reg_3000", "reg_2000"]


def test_candidate_id_is_stable_for_reordered_params() -> None:
    first = {"regularization": 2000.0, "step_size": 56, "max_iter": 150}
    second = {"max_iter": 150, "regularization": 2000.0, "step_size": 56}

    assert candidate_id(first) == candidate_id(second)


def test_build_candidate_config_sets_regularization_and_fit_overrides() -> None:
    base_config = {
        "model": {"primary_model": "dixon_coles", "max_goals": 8},
        "dixon_coles": {"tol": 1e-8},
        "bivariate_poisson": {"tol": 1e-8},
        "backtest": {
            "step_size": 28,
            "run_ablations": True,
            "benchmarks": ["uniform_baseline"],
            "fit": {"common": {"tol": 1e-6}},
        },
    }

    candidate_config = build_candidate_config(
        base_config=base_config,
        regularization=3000.0,
        step_size=56,
        max_iter=150,
    )

    assert base_config["backtest"]["step_size"] == 28
    assert candidate_config["backtest"]["step_size"] == 56
    assert candidate_config["backtest"]["run_ablations"] is False
    assert candidate_config["backtest"]["benchmarks"] == []
    assert candidate_config["backtest"]["fit"]["common"]["max_iter"] == 150
    assert candidate_config["backtest"]["fit"]["common"]["tol"] == 1e-6
    assert candidate_config["dixon_coles"]["regularization"] == 3000.0
    assert candidate_config["dixon_coles"]["contextual_regularization"] == 3000.0
    assert candidate_config["dixon_coles"]["rho_regularization"] == 3000.0
    assert candidate_config["bivariate_poisson"]["regularization"] == 3000.0
    assert candidate_config["bivariate_poisson"]["contextual_regularization"] == 3000.0
    assert candidate_config["bivariate_poisson"]["lambda3_regularization"] == 3000.0


def test_build_candidate_config_can_separate_team_and_contextual_regularization() -> None:
    candidate_config = build_candidate_config(
        base_config={"backtest": {}},
        regularization=250.0,
        contextual_regularization=3000.0,
        score_shape_regularization=1500.0,
        step_size=28,
        max_iter=125,
    )

    assert candidate_config["dixon_coles"]["regularization"] == 250.0
    assert candidate_config["dixon_coles"]["contextual_regularization"] == 3000.0
    assert candidate_config["dixon_coles"]["rho_regularization"] == 1500.0
    assert candidate_config["bivariate_poisson"]["regularization"] == 250.0
    assert candidate_config["bivariate_poisson"]["contextual_regularization"] == 3000.0
    assert candidate_config["bivariate_poisson"]["lambda3_regularization"] == 1500.0


def test_backtest_runner_consumes_candidate_dixon_coles_regularization_and_fit() -> None:
    candidate_config = build_candidate_config(
        base_config={"model": {"max_goals": 8}, "backtest": {"fit": {"common": {"tol": 1e-6}}}},
        regularization=2000.0,
        step_size=56,
        max_iter=150,
    )
    candidate_config["backtest"]["fit"]["dixon_coles"] = {"max_iter": 125}

    model = BacktestRunner(candidate_config)._create_model("dixon_coles")

    assert model.config.max_iter == 125
    assert model.config.tol == 1e-6
    assert model.dc_config.regularization == 2000.0
    assert model.dc_config.contextual_regularization == 2000.0
    assert model.dc_config.rho_regularization == 2000.0


def test_backtest_runner_consumes_candidate_bivariate_regularization_and_fit() -> None:
    candidate_config = build_candidate_config(
        base_config={"model": {"max_goals": 8}, "backtest": {"fit": {"common": {"tol": 1e-6}}}},
        regularization=5000.0,
        step_size=56,
        max_iter=150,
    )
    candidate_config["backtest"]["fit"]["bivariate_poisson"] = {"max_iter": 115, "tol": 1e-5}

    model = BacktestRunner(candidate_config)._create_model("bivariate_poisson")

    assert model.config.max_iter == 115
    assert model.config.tol == 1e-5
    assert model.bp_config.regularization == 5000.0
    assert model.bp_config.contextual_regularization == 5000.0
    assert model.bp_config.lambda3_regularization == 5000.0
