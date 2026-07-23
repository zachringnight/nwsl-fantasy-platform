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
    assert "spi_lite_baseline" in config["backtest"]["benchmarks"]


def test_default_score_models_use_split_small_sample_shrinkage() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert 1 <= config["dixon_coles"]["regularization"] <= 5
    assert config["dixon_coles"]["contextual_regularization"] >= 3000
    assert config["dixon_coles"]["rho_regularization"] >= 3000
    assert config["dixon_coles"]["home_advantage_cap"] <= 0.10
    assert 1 <= config["bivariate_poisson"]["regularization"] <= 5
    assert config["bivariate_poisson"]["contextual_regularization"] >= 3000
    assert config["bivariate_poisson"]["lambda3_regularization"] >= 3000
    assert config["bivariate_poisson"]["home_advantage_cap"] <= 0.10


def test_default_training_window_is_current_season_with_prior_lookback() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert config["data"]["history_start_season"] == 2025
    assert config["data"]["prior_history_start_season"] == 2025
    assert config["data"]["upcoming_path"] == "data/raw/upcoming.csv"
    assert config["data"]["asa_match_xgoals_path"] == "data/raw/asa_match_xgoals.csv"
    assert config["team_ratings"]["half_life_days"] <= 60
    assert config["team_ratings"]["season_carryover"] <= 0.3
    assert config["spi_lite"]["current_full_weight_matches"] <= 12
    assert config["spi_lite"]["lineup_log_scale"] > 0


def test_default_betting_markets_cover_moneyline_and_totals_only() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert config["betting"]["markets"] == ["1x2", "total"]
    assert config["betting"]["market_rules"]["moneyline"]["max_market_price"] == 4.0
    assert config["betting"]["market_rules"]["moneyline"]["min_confidence"] <= config["betting"]["min_confidence"]
    assert config["betting"]["market_rules"]["moneyline"]["side_rules"]["draw"]["min_confidence"] == 0.0
    assert config["betting"]["market_rules"]["moneyline"]["side_rules"]["draw"]["min_probability_edge"] >= 0.10
    assert config["betting"]["market_rules"]["moneyline"]["side_rules"]["draw"]["min_market_price"] >= 3.0
    assert config["betting"]["market_rules"]["totals"]["min_edge"] > config["betting"]["min_edge"]
    # Totals are enabled for LEANS only: actionable at the lean tier, but
    # official picks stay disabled until calibration is independently validated.
    assert config["betting"]["market_rules"]["totals"]["enabled"] is True
    assert config["betting"]["market_rules"]["totals"]["official_picks_enabled"] is False
    assert config["betting"]["market_rules"]["totals"]["allowed_sides"] == ["over"]
