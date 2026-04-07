from __future__ import annotations

from src.backtest.runner import resolve_models_to_run


def test_resolve_models_to_run_skips_ablations_when_disabled() -> None:
    backtest_config = {
        "run_ablations": False,
        "benchmarks": [
            "uniform_baseline",
            "home_field_baseline",
        ],
    }

    resolved = resolve_models_to_run(
        ["dixon_coles", "bivariate_poisson"],
        backtest_config,
    )

    assert resolved == [
        "dixon_coles",
        "bivariate_poisson",
        "uniform_baseline",
        "home_field_baseline",
    ]


def test_resolve_models_to_run_adds_ablations_when_enabled() -> None:
    backtest_config = {
        "run_ablations": True,
        "benchmarks": ["uniform_baseline"],
    }

    resolved = resolve_models_to_run(["dixon_coles"], backtest_config)

    assert resolved == [
        "dixon_coles",
        "uniform_baseline",
        "dixon_coles__no_asa",
        "dixon_coles__no_lineup",
        "dixon_coles__no_priors",
        "dixon_coles__no_rest",
    ]
