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


def test_default_odds_provider_stale_line_minutes_is_pinned() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert config["odds_provider"]["stale_line_minutes"] == 180


def test_default_spi_lite_league_rates_default_to_null() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    assert config["spi_lite"]["league_home_rate"] is None
    assert config["spi_lite"]["league_away_rate"] is None
    # Existing spi_lite keys must still be present alongside the new ones.
    assert config["spi_lite"]["rating_weight"] == 0.55
    assert config["spi_lite"]["current_full_weight_matches"] == 10.0


def test_default_threshold_tuning_config_is_present() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    tt = config["threshold_tuning"]
    assert tt["edge_grid"] == [0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.10]
    assert tt["confidence_grid"] == [0.0, 0.03, 0.05, 0.08, 0.10, 0.15]
    assert tt["min_bets_per_cell"] == 8
    assert tt["min_history_bets"] == 30
    assert tt["rank_metric"] == "roi_units"


def test_default_market_residual_config_is_present() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    mr = config["market_residual"]
    assert mr["enabled"] is True
    assert mr["regularization_c"] == 1.0
    assert mr["min_train_matches"] == 60


def test_default_totals_model_config_is_present() -> None:
    config_path = Path(__file__).resolve().parents[1] / "configs" / "default.yaml"
    config = yaml.safe_load(config_path.read_text())

    tm = config["totals_model"]
    assert tm["enabled"] is True
    assert tm["regularization_c"] == 1.0
    assert tm["min_train_matches"] == 60
