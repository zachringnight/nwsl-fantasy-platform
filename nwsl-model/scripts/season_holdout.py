#!/usr/bin/env python3
"""Train on one NWSL season and evaluate on a later season."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.metrics import compute_all_metrics
from src.backtest.reports import generate_backtest_report, print_summary
from src.backtest.runner import BacktestRunner, resolve_models_to_run
from src.backtest.splitter import BacktestFold
from src.betting.staking import StakingConfig, StakingEngine
from src.data.loaders import NWSLDataset
from src.data.transforms import (
    add_npxg_fallback,
    add_result_columns,
    merge_odds_to_matches,
)
from src.data.validation import run_all_validations
from src.features.market_features import compute_market_probabilities, compute_totals_market_probabilities
from src.models.market_blend import MarketBlender
from src.utils.io import load_config, save_json


DEFAULT_MODELS = [
    "dixon_coles",
    "bivariate_poisson",
    "uniform_baseline",
    "home_field_baseline",
    "team_ratings_poisson",
    "rolling_npxg_poisson",
    "spi_lite_baseline",
]


def season_split(matches: pd.DataFrame, train_season: int, test_season: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return train/test frames for an explicit season holdout."""
    if matches.empty or "season" not in matches.columns:
        raise ValueError("matches must include season values")
    seasons = pd.to_numeric(matches["season"], errors="coerce")
    train = matches.loc[seasons.eq(int(train_season))].copy()
    test = matches.loc[seasons.eq(int(test_season))].copy()
    if train.empty:
        raise ValueError(f"No training matches found for season {train_season}")
    if test.empty:
        raise ValueError(f"No test matches found for season {test_season}")
    train = train.sort_values(["match_date", "match_id"]).reset_index(drop=True)
    test = test.sort_values(["match_date", "match_id"]).reset_index(drop=True)
    if train["match_date"].max() >= test["match_date"].min():
        raise ValueError(
            f"Season holdout would leak: train max date {train['match_date'].max()} "
            f">= test min date {test['match_date'].min()}"
        )
    return train, test


def _prepare_matches(matches: pd.DataFrame, odds: pd.DataFrame | None) -> pd.DataFrame:
    prepared = run_all_validations(matches)
    prepared = add_result_columns(prepared)
    prepared = add_npxg_fallback(prepared)
    if odds is not None and not odds.empty:
        prepared = merge_odds_to_matches(prepared, odds)
        prepared = merge_odds_to_matches(prepared, odds, market_type="total")
        prepared = compute_market_probabilities(prepared)
        prepared = compute_totals_market_probabilities(prepared)
    return prepared


def _staking_engine(config: dict[str, Any]) -> StakingEngine:
    bet_cfg = config.get("betting", {})
    return StakingEngine(
        StakingConfig(
            min_edge=bet_cfg.get("min_edge", 0.02),
            kelly_fraction=bet_cfg.get("kelly_fraction", 0.25),
            max_stake_pct=bet_cfg.get("max_stake_pct", 0.0025),
            max_slate_exposure_pct=bet_cfg.get("max_slate_exposure_pct", 0.01),
            bankroll=bet_cfg.get("starting_bankroll", 10000.0),
        )
    )


def _market_blender(config: dict[str, Any]) -> MarketBlender:
    blend_cfg = config.get("market_blend", {})
    return MarketBlender(
        alpha=blend_cfg.get("alpha", 0.5),
        alpha_schedule=blend_cfg.get("alpha_schedule"),
        alpha_schedule_enabled=blend_cfg.get("alpha_schedule_enabled", False),
        devig_method=blend_cfg.get("devig_method", "multiplicative"),
    )


def _holdout_config(config: dict[str, Any], train_season: int, test_season: int) -> dict[str, Any]:
    output = {**config}
    data_cfg = {**output.get("data", {})}
    data_cfg["history_start_season"] = int(train_season)
    data_cfg["history_end_season"] = int(test_season)
    data_cfg["prior_history_end_season"] = int(train_season)
    output["data"] = data_cfg
    backtest_cfg = {**output.get("backtest", {})}
    backtest_cfg["run_ablations"] = False
    output["backtest"] = backtest_cfg
    return output


def run_season_holdout(
    *,
    config: dict[str, Any],
    train_season: int,
    test_season: int,
    models_to_run: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fit requested models on train_season and evaluate on test_season."""
    dataset = NWSLDataset.from_config(_holdout_config(config, train_season, test_season))
    matches = _prepare_matches(dataset.matches, dataset.odds)
    train, test = season_split(matches, train_season, test_season)
    fold = BacktestFold(
        fold_id=0,
        train_matches=train,
        test_matches=test,
        train_end_date=train["match_date"].max(),
        test_start_date=test["match_date"].min(),
        test_end_date=test["match_date"].max(),
    )
    runner = BacktestRunner(config)
    if not runner.config.get("backtest"):
        runner.config["backtest"] = {}
    all_results: dict[str, Any] = {}

    for model_name in models_to_run:
        staker = _staking_engine(config)
        predictions = runner._evaluate_fold(
            fold,
            model_name,
            staker,
            _market_blender(config),
            dataset.odds,
            appearances=dataset.appearances,
            projected_lineups=dataset.projected_lineups,
            team_season_priors=dataset.team_season_priors,
            player_season_priors=dataset.player_season_priors,
        )
        bet_log = staker.get_bet_log_df()
        decision_log = staker.get_decision_log_df()
        metrics = compute_all_metrics(predictions, bet_log)
        metrics.update(runner._market_betting_diagnostics(predictions, dataset.odds, bet_log, decision_log))
        metrics["model"] = model_name
        metrics["staking_summary"] = staker.summary()
        fit_runs = runner.fit_diagnostics.get(model_name, [])
        if fit_runs:
            metrics["fit_diagnostics"] = {
                "n_folds": len(fit_runs),
                "converged_rate": float(sum(bool(run.get("success", False)) for run in fit_runs) / len(fit_runs)),
                "iterations": float(fit_runs[-1].get("nit", 0.0)),
                "nfev": float(fit_runs[-1].get("nfev", 0.0)),
                "grad_norm": float(fit_runs[-1].get("grad_norm", 0.0)),
            }
        all_results[model_name] = {
            "metrics": metrics,
            "predictions": predictions,
            "bet_log": bet_log,
            "decision_log": decision_log,
        }

    metadata = {
        "train_season": int(train_season),
        "test_season": int(test_season),
        "train_match_count": int(len(train)),
        "test_match_count": int(len(test)),
        "train_date_range": [str(train["match_date"].min()), str(train["match_date"].max())],
        "test_date_range": [str(test["match_date"].min()), str(test["match_date"].max())],
        "models": models_to_run,
    }
    return all_results, metadata


def _summary_payload(results: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        **metadata,
        "model_metrics": {
            model_name: {
                key: value
                for key, value in result["metrics"].items()
                if key not in {"staking_summary", "model"}
            }
            for model_name, result in results.items()
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train on one season and test on another")
    parser.add_argument("--config", default="configs/default.yaml")
    parser.add_argument("--train-season", type=int, default=2025)
    parser.add_argument("--test-season", type=int, default=2026)
    parser.add_argument("--models", nargs="+", default=None)
    parser.add_argument("--output-dir", default="")
    args = parser.parse_args()

    config = load_config(args.config)
    requested_models = args.models or DEFAULT_MODELS
    models_to_run = resolve_models_to_run(requested_models, {**config.get("backtest", {}), "benchmarks": []})
    output_dir = Path(args.output_dir) if args.output_dir else Path(
        f"data/processed/season_holdout/{args.train_season}_to_{args.test_season}"
    )

    results, metadata = run_season_holdout(
        config=config,
        train_season=args.train_season,
        test_season=args.test_season,
        models_to_run=models_to_run,
    )
    report_summary = generate_backtest_report(results, str(output_dir), closing_odds=None)
    save_json(_summary_payload(results, metadata), output_dir / "season_holdout_summary.json")
    save_json(metadata, output_dir / "season_holdout_metadata.json")
    print_summary(results)
    print(f"\nSeason holdout saved to {output_dir}")
    print(f"Train matches: {metadata['train_match_count']} ({metadata['train_date_range'][0]} to {metadata['train_date_range'][1]})")
    print(f"Test matches: {metadata['test_match_count']} ({metadata['test_date_range'][0]} to {metadata['test_date_range'][1]})")
    print(f"Report keys: {sorted(report_summary.keys())}")


if __name__ == "__main__":
    main()
