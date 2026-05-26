from __future__ import annotations

from pathlib import Path

import yaml

from src.backtest.runner import BASELINE_MODELS


def test_default_backtest_benchmarks_are_supported() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    benchmarks = set(config["backtest"]["benchmarks"])

    assert benchmarks
    assert benchmarks.issubset(BASELINE_MODELS)


def test_default_backtest_runtime_settings_are_operational() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert config["backtest"]["step_size"] >= 5
    assert config["backtest"]["run_ablations"] is False


def test_default_score_models_use_strong_small_sample_shrinkage() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert config["dixon_coles"]["regularization"] >= 1000
    assert config["dixon_coles"]["contextual_regularization"] >= 1000
    assert config["dixon_coles"]["rho_regularization"] >= 1000
    assert config["bivariate_poisson"]["regularization"] >= 1000
    assert config["bivariate_poisson"]["contextual_regularization"] >= 1000
    assert config["bivariate_poisson"]["lambda3_regularization"] >= 1000
