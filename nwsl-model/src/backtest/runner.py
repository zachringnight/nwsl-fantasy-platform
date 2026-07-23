"""Backtest runner: orchestrates expanding-window evaluation.

Trains models on each fold, generates predictions, evaluates bets,
and aggregates metrics across all folds.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from scipy.stats import poisson

from src.backtest.metrics import compute_all_metrics
from src.backtest.splitter import BacktestFold, ExpandingWindowSplitter
from src.betting.market_derivation import derive_all_markets
from src.betting.recommendations import evaluate_market_candidates, load_bet_selection_config
from src.betting.score_matrix import build_full_result, derive_1x2
from src.betting.settlement import settle_1x2, settle_total
from src.betting.staking import BetRecommendation, StakingConfig, StakingEngine
from src.data.transforms import (
    add_npxg_fallback,
    add_result_columns,
    encode_teams,
    melt_to_team_match,
    merge_odds_to_matches,
)
from src.data.validation import run_all_validations
from src.features.context import (
    ContextualFeatureProvider,
    build_contextual_training_frame,
    select_model_contextual_columns,
)
from src.features.market_features import compute_market_probabilities, compute_totals_market_probabilities
from src.features.match_features import (
    compute_rolling_form,
    compute_season_stats,
)
from src.models.base import BaseScoreModel, PredictionResult
from src.models.bivariate_poisson import BivariatePoissonConfig, BivariatePoissonModel
from src.models.dixon_coles import DixonColesConfig, DixonColesModel
from src.models.elo_baseline import RegularizedEloBaseline
from src.models.market_blend import MarketBlender
from src.models.spi_lite import SpiLiteBaseline
from src.models.team_ratings import TeamRatingsConfig, TeamRatingsModel
from src.utils.dates import parse_mixed_utc_datetime

logger = logging.getLogger("nwsl_model.backtest.runner")

PURE_MODELS = {"dixon_coles", "bivariate_poisson"}
BASELINE_MODELS = {
    "uniform_baseline",
    "home_field_baseline",
    "team_ratings_poisson",
    "rolling_npxg_poisson",
    "spi_lite_baseline",
    "regularized_elo_baseline",
}
ABLATION_SUFFIXES = ("no_asa", "no_lineup", "no_priors", "no_rest")


def _unique_in_order(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _parse_model_spec(model_name: str) -> tuple[str, str | None]:
    if "__" not in model_name:
        return model_name, None
    base_model, ablation = model_name.split("__", 1)
    return base_model, ablation


def resolve_models_to_run(
    requested_models: Optional[list[str]],
    backtest_config: dict[str, Any],
) -> list[str]:
    """Resolve the exact model list for a backtest run."""
    benchmark_models = list(backtest_config.get("benchmarks", []))
    if requested_models is None:
        requested_models = ["dixon_coles", "bivariate_poisson"]

    requested = list(requested_models)
    pure_requested = [model for model in requested if _parse_model_spec(model)[0] in PURE_MODELS]
    ablation_models: list[str] = []
    if backtest_config.get("run_ablations", True):
        ablation_models = [
            f"{model}__{suffix}"
            for model in pure_requested
            for suffix in ABLATION_SUFFIXES
        ]

    return _unique_in_order(requested + benchmark_models + ablation_models)


class BacktestRunner:
    """Run expanding-window backtest across multiple model configurations."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.results: list[dict[str, Any]] = []
        self.predictions: list[pd.DataFrame] = []
        self.bet_logs: list[pd.DataFrame] = []
        self.fit_diagnostics: dict[str, list[dict[str, Any]]] = {}
        self.selection_config = load_bet_selection_config(config)

    def run(
        self,
        matches: pd.DataFrame,
        odds: Optional[pd.DataFrame] = None,
        appearances: Optional[pd.DataFrame] = None,
        projected_lineups: Optional[pd.DataFrame] = None,
        team_season_priors: Optional[pd.DataFrame] = None,
        player_season_priors: Optional[pd.DataFrame] = None,
        models_to_run: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Run the full backtest.

        Args:
            matches: Validated match data.
            odds: Optional odds data.
            models_to_run: List of model names to evaluate.
                Options: pure candidates, configured baselines, and ablation variants.
        """
        bt_cfg = self.config.get("backtest", {})
        models_to_run = resolve_models_to_run(models_to_run, bt_cfg)

        # Prepare data
        matches = run_all_validations(matches)
        matches = add_result_columns(matches)
        matches = add_npxg_fallback(matches)
        if odds is not None:
            matches = merge_odds_to_matches(matches, odds)
            matches = merge_odds_to_matches(matches, odds, market_type="total")
            matches = compute_market_probabilities(matches)
            matches = compute_totals_market_probabilities(matches)

        # Splitter
        splitter = ExpandingWindowSplitter(
            min_train_matches=bt_cfg.get("min_train_matches", 50),
            step_size=bt_cfg.get("step_size", 1),
        )

        # Staking engine
        bet_cfg = self.config.get("betting", {})
        staking_config = StakingConfig(
            min_edge=bet_cfg.get("min_edge", 0.02),
            kelly_fraction=bet_cfg.get("kelly_fraction", 0.25),
            max_stake_pct=bet_cfg.get("max_stake_pct", 0.0025),
            max_slate_exposure_pct=bet_cfg.get("max_slate_exposure_pct", 0.01),
            bankroll=bet_cfg.get("starting_bankroll", 10000.0),
        )

        # Market blender
        blend_cfg = self.config.get("market_blend", {})
        blender = MarketBlender(
            alpha=blend_cfg.get("alpha", 0.5),
            alpha_schedule=blend_cfg.get("alpha_schedule"),
            alpha_schedule_enabled=blend_cfg.get("alpha_schedule_enabled", False),
            devig_method=blend_cfg.get("devig_method", "multiplicative"),
        )

        all_model_results = {}

        for model_name in models_to_run:
            logger.info(f"Running backtest for model: {model_name}")
            staker = StakingEngine(staking_config)
            fold_predictions = []

            for fold in splitter.split(matches):
                if not splitter.validate_no_leakage(fold):
                    logger.error(f"Leakage detected in fold {fold.fold_id}! Skipping.")
                    continue

                try:
                    fold_preds = self._evaluate_fold(
                        fold,
                        model_name,
                        staker,
                        blender,
                        odds,
                        appearances=appearances,
                        projected_lineups=projected_lineups,
                        team_season_priors=team_season_priors,
                        player_season_priors=player_season_priors,
                    )
                    fold_predictions.append(fold_preds)
                except Exception as e:
                    logger.error(f"Fold {fold.fold_id} failed for {model_name}: {e}")
                    continue

            if fold_predictions:
                all_preds = pd.concat(fold_predictions, ignore_index=True)
                bet_log = staker.get_bet_log_df()
                decision_log = staker.get_decision_log_df()

                metrics = compute_all_metrics(all_preds, bet_log)
                metrics.update(self._market_betting_diagnostics(all_preds, odds, bet_log, decision_log))
                metrics["model"] = model_name
                metrics["staking_summary"] = staker.summary()
                fit_runs = self.fit_diagnostics.get(model_name, [])
                if fit_runs:
                    fit_summary: dict[str, Any] = {
                        "n_folds": len(fit_runs),
                        "converged_rate": float(np.mean([float(run.get("success", False)) for run in fit_runs])),
                        "median_iterations": float(np.median([float(run.get("nit", 0.0)) for run in fit_runs])),
                        "median_nfev": float(np.median([float(run.get("nfev", 0.0)) for run in fit_runs])),
                        "median_gradient_norm": float(
                            np.median(
                                [
                                    float(run.get("grad_norm", np.nan))
                                    for run in fit_runs
                                    if np.isfinite(float(run.get("grad_norm", np.nan)))
                                ]
                            )
                        )
                        if any(np.isfinite(float(run.get("grad_norm", np.nan))) for run in fit_runs)
                        else float("nan"),
                    }
                    metrics["fit_diagnostics"] = fit_summary

                all_model_results[model_name] = {
                    "metrics": metrics,
                    "predictions": all_preds,
                    "bet_log": bet_log,
                    "decision_log": decision_log,
                }

                logger.info(
                    f"{model_name}: log_loss={metrics.get('log_loss_1x2', 'N/A'):.4f}, "
                    f"ROI={metrics.get('roi', 0):.4f}, "
                    f"n_bets={metrics.get('n_bets', 0)}"
                )

        return all_model_results

    def _evaluate_fold(
        self,
        fold: BacktestFold,
        model_name: str,
        staker: StakingEngine,
        blender: MarketBlender,
        odds: Optional[pd.DataFrame],
        appearances: Optional[pd.DataFrame] = None,
        projected_lineups: Optional[pd.DataFrame] = None,
        team_season_priors: Optional[pd.DataFrame] = None,
        player_season_priors: Optional[pd.DataFrame] = None,
    ) -> pd.DataFrame:
        """Evaluate a single fold for a given model."""
        train = fold.train_matches
        test = fold.test_matches
        base_model, ablation = _parse_model_spec(model_name)
        feature_flags = {
            "include_team_priors": ablation != "no_priors",
            "include_lineup_features": ablation != "no_lineup",
            "include_schedule_features": ablation != "no_rest",
            "include_asa_features": ablation != "no_asa",
        }

        train_match_ids = set(train["match_id"].astype(str))
        train_appearances = None
        if appearances is not None and not appearances.empty:
            train_appearances = appearances[appearances["match_id"].astype(str).isin(train_match_ids)].copy()

        prepared_train, contextual_cols = build_contextual_training_frame(
            train,
            appearances=train_appearances,
            projected_lineups=None,
            team_season_priors=team_season_priors,
            player_season_priors=player_season_priors,
            lineup_model=None,
            rolling_windows=self.config.get("features", {}).get("rolling_windows", [3, 5, 10]),
            short_rest_days=self.config.get("features", {}).get("short_rest_days", 4),
            **feature_flags,
        )
        model_contextual_cols = select_model_contextual_columns(contextual_cols)

        # Build team ratings from training data
        team_matches = melt_to_team_match(prepared_train)
        team_matches = compute_rolling_form(team_matches)
        team_matches = compute_season_stats(team_matches)

        ratings_cfg = self.config.get("team_ratings", {})
        ratings_model = TeamRatingsModel(TeamRatingsConfig(
            half_life_days=ratings_cfg.get("half_life_days", 90),
            prior_weight=ratings_cfg.get("prior_weight", 5.0),
            season_carryover=ratings_cfg.get("season_carryover", 0.6),
        ))

        reference_date = fold.train_end_date
        ratings_model.fit(team_matches, reference_date=reference_date)

        context_provider = ContextualFeatureProvider.from_training_frame(
            prepared_train,
            short_rest_days=self.config.get("features", {}).get("short_rest_days", 4),
        )

        if base_model in BASELINE_MODELS:
            return self._evaluate_baseline_fold(
                base_model=base_model,
                train=train,
                test=test,
                context_provider=context_provider,
                ratings_model=ratings_model,
                model_name=model_name,
            )

        # Compute recency weights for training
        days_since = np.array([
            (reference_date - d).days for d in prepared_train["match_date"]
        ], dtype=np.float64)
        weights = np.exp(-days_since * math.log(2) / ratings_cfg.get("half_life_days", 90))

        # Fit score model
        model = self._create_model(base_model)
        fit_result = model.fit(prepared_train, weights=weights, contextual_cols=model_contextual_cols)
        self.fit_diagnostics.setdefault(model_name, []).append(fit_result.diagnostics)

        # Predict test matches
        results = []
        for _, row in test.iterrows():
            contextual_features = context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row.get("match_date"),
                match_id=str(row["match_id"]),
            )
            pred = model.predict_score_matrix(
                home_team=row["home_team"],
                away_team=row["away_team"],
                contextual_features=contextual_features,
            )

            # Derive markets
            markets = derive_all_markets(pred.score_matrix, match_id=str(row["match_id"]))

            # Generate bet recommendations and settle
            self._generate_and_settle_bets(
                row,
                pred,
                markets,
                odds_rows=(
                    odds[
                        (odds["match_id"].astype(str) == str(row["match_id"]))
                        & (odds["source_type"].astype(str).str.lower() == "close")
                    ].copy()
                    if odds is not None and not odds.empty
                    else pd.DataFrame()
                ),
                staker=staker,
                model_name=base_model,
            )

            result_row = {
                "match_id": row["match_id"],
                "match_date": row["match_date"],
                "season": row.get("season"),
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "home_goals_90": row["home_goals_90"],
                "away_goals_90": row["away_goals_90"],
                "prob_home": pred.home_win_prob,
                "prob_draw": pred.draw_prob,
                "prob_away": pred.away_win_prob,
                "lambda_home": pred.lambda_home,
                "lambda_away": pred.lambda_away,
                "score_matrix": pred.score_matrix,
                "model": model_name,
                "confidence_score": max(pred.home_win_prob, pred.draw_prob, pred.away_win_prob),
                "fit_converged": float(fit_result.converged),
                "fit_iterations": float(fit_result.diagnostics.get("nit", 0.0)),
                "fit_nfev": float(fit_result.diagnostics.get("nfev", 0.0)),
                "fit_grad_norm": float(fit_result.diagnostics.get("grad_norm", np.nan)),
                "fit_n_params": float(fit_result.diagnostics.get("n_params", 0.0)),
            }
            if contextual_features:
                for column in (
                    "home_season_matches_played",
                    "away_season_matches_played",
                    "home_rest_days",
                    "away_rest_days",
                    "home_short_rest",
                    "away_short_rest",
                    "home_n_starters",
                    "away_n_starters",
                    "home_n_injured",
                    "away_n_injured",
                    "home_lineup_strength",
                    "away_lineup_strength",
                ):
                    if column in contextual_features:
                        result_row[column] = contextual_features[column]
                result_row["lineup_quality_score"] = float(
                    contextual_features.get("home_lineup_strength", 0.0)
                    + contextual_features.get("away_lineup_strength", 0.0)
                    - contextual_features.get("home_n_injured", 0.0)
                    - contextual_features.get("away_n_injured", 0.0)
                )

            # Add derived binary columns
            result_row["total_goals"] = row["home_goals_90"] + row["away_goals_90"]
            result_row["home_win"] = int(row["home_goals_90"] > row["away_goals_90"])
            result_row["over_2_5"] = int(result_row["total_goals"] > 2.5)

            for total_line in (1.5, 2.5, 3.5, 4.5):
                if total_line in markets.over_probs:
                    result_row[f"prob_over_{total_line}"] = markets.over_probs[total_line]
                    result_row[f"fair_over_{total_line}"] = markets.over_fair_odds[total_line]
                    result_row[f"fair_under_{total_line}"] = markets.under_fair_odds[total_line]
            total_line = row.get("total_line", row.get("line"))
            if pd.notna(total_line):
                total_line = float(total_line)
                result_row["main_total_line"] = total_line
                result_row["main_total_over_market_odds"] = row.get("over_odds")
                result_row["main_total_under_market_odds"] = row.get("under_odds")
                if total_line in markets.over_probs:
                    result_row["prob_over_main_total"] = markets.over_probs[total_line]
                    result_row["fair_over_main_total"] = markets.over_fair_odds[total_line]
                    result_row["fair_under_main_total"] = markets.under_fair_odds[total_line]
                    result_row["main_total_over_actual"] = int(result_row["total_goals"] > total_line)

            results.append(result_row)

        return pd.DataFrame(results)

    def _build_independent_score_matrix(self, lambda_home: float, lambda_away: float) -> NDArray[np.float64]:
        n = self.config.get("model", {}).get("max_goals", 8) + 1
        goals = np.arange(n, dtype=np.float64)
        home_pmf = poisson.pmf(goals, max(lambda_home, 0.05))
        away_pmf = poisson.pmf(goals, max(lambda_away, 0.05))
        matrix = np.outer(home_pmf, away_pmf)
        total = matrix.sum()
        if total > 0:
            matrix /= total
        return matrix

    def _prediction_row_from_markets(
        self,
        row: pd.Series,
        model_name: str,
        matrix: NDArray[np.float64],
        lambda_home: float,
        lambda_away: float,
        contextual_features: dict[str, float] | None = None,
        probs_override: tuple[float, float, float] | None = None,
    ) -> dict[str, Any]:
        markets = derive_all_markets(matrix, match_id=str(row["match_id"]))
        prob_home, prob_draw, prob_away = probs_override or (
            float(markets.home_prob),
            float(markets.draw_prob),
            float(markets.away_prob),
        )
        result_row = {
            "match_id": row["match_id"],
            "match_date": row["match_date"],
            "season": row.get("season"),
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "home_goals_90": row["home_goals_90"],
            "away_goals_90": row["away_goals_90"],
            "prob_home": prob_home,
            "prob_draw": prob_draw,
            "prob_away": prob_away,
            "lambda_home": float(lambda_home),
            "lambda_away": float(lambda_away),
            "score_matrix": matrix,
            "model": model_name,
            "total_goals": row["home_goals_90"] + row["away_goals_90"],
            "home_win": int(row["home_goals_90"] > row["away_goals_90"]),
            "over_2_5": int((row["home_goals_90"] + row["away_goals_90"]) > 2.5),
            "confidence_score": max(prob_home, prob_draw, prob_away),
        }
        if contextual_features:
            for column in (
                "home_season_matches_played",
                "away_season_matches_played",
                "home_rest_days",
                "away_rest_days",
                "home_short_rest",
                "away_short_rest",
                "home_n_starters",
                "away_n_starters",
                "home_n_injured",
                "away_n_injured",
                "home_lineup_strength",
                "away_lineup_strength",
            ):
                if column in contextual_features:
                    result_row[column] = contextual_features[column]
            result_row["lineup_quality_score"] = float(
                contextual_features.get("home_lineup_strength", 0.0)
                + contextual_features.get("away_lineup_strength", 0.0)
                - contextual_features.get("home_n_injured", 0.0)
                - contextual_features.get("away_n_injured", 0.0)
            )
        for total_line in (1.5, 2.5, 3.5, 4.5):
            if total_line in markets.over_probs:
                result_row[f"prob_over_{total_line}"] = markets.over_probs[total_line]
                result_row[f"fair_over_{total_line}"] = markets.over_fair_odds[total_line]
                result_row[f"fair_under_{total_line}"] = markets.under_fair_odds[total_line]
        return result_row

    def _evaluate_baseline_fold(
        self,
        base_model: str,
        train: pd.DataFrame,
        test: pd.DataFrame,
        context_provider: ContextualFeatureProvider,
        ratings_model: TeamRatingsModel,
        model_name: str,
    ) -> pd.DataFrame:
        train_home_rate = float((train["home_goals_90"] > train["away_goals_90"]).mean())
        train_draw_rate = float((train["home_goals_90"] == train["away_goals_90"]).mean())
        train_away_rate = float((train["home_goals_90"] < train["away_goals_90"]).mean())
        train_home_npxg = float(pd.to_numeric(train["home_npxg"], errors="coerce").mean())
        train_away_npxg = float(pd.to_numeric(train["away_npxg"], errors="coerce").mean())
        league_total_npxg = max(train_home_npxg + train_away_npxg, 0.2)
        league_goal_rate = max(float(pd.to_numeric(train["total_goals"], errors="coerce").mean()), league_total_npxg)
        league_side_rate = max(league_goal_rate / 2.0, 0.1)
        base_home_probs = (
            train_home_rate if train_home_rate > 0 else 1 / 3,
            train_draw_rate if train_draw_rate > 0 else 1 / 3,
            train_away_rate if train_away_rate > 0 else 1 / 3,
        )
        elo_model = None
        if base_model == "regularized_elo_baseline":
            elo_cfg = self.config.get("elo_baseline", {})
            elo_model = RegularizedEloBaseline(
                k_factor=elo_cfg.get("k_factor", 20.0),
                home_advantage_elo=elo_cfg.get("home_advantage_elo", 45.0),
                draw_prior=elo_cfg.get("draw_prior", 0.27),
                draw_prior_weight=elo_cfg.get("draw_prior_weight", 50.0),
                max_goals=self.config.get("model", {}).get("max_goals", 8),
            ).fit(train)
        spi_model = None
        if base_model == "spi_lite_baseline":
            spi_cfg = self.config.get("spi_lite", {})
            spi_model = SpiLiteBaseline(
                ratings_model=ratings_model,
                max_goals=self.config.get("model", {}).get("max_goals", 8),
                league_home_rate=max(train_home_npxg, 0.1),
                league_away_rate=max(train_away_npxg, 0.1),
                rating_weight=spi_cfg.get("rating_weight", 0.55),
                current_full_weight_matches=spi_cfg.get("current_full_weight_matches", 10.0),
                max_rating_log_adjustment=spi_cfg.get("max_rating_log_adjustment", 0.70),
                lineup_log_scale=spi_cfg.get("lineup_log_scale", 0.035),
                rest_log_scale=spi_cfg.get("rest_log_scale", 0.012),
                pace_weight=spi_cfg.get("pace_weight", 0.20),
                min_lambda=spi_cfg.get("min_lambda", 0.20),
                max_lambda=spi_cfg.get("max_lambda", 3.75),
            )

        rows: list[dict[str, Any]] = []
        for _, row in test.iterrows():
            contextual_features = context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row.get("match_date"),
                match_id=str(row["match_id"]),
            )
            if base_model == "uniform_baseline":
                lambda_home = league_side_rate
                lambda_away = league_side_rate
                probs_override = (1 / 3, 1 / 3, 1 / 3)
            elif base_model == "home_field_baseline":
                lambda_home = max(train_home_npxg, 0.1)
                lambda_away = max(train_away_npxg, 0.1)
                probs_override = base_home_probs
            elif base_model == "team_ratings_poisson":
                home_rating = ratings_model.get_rating(row["home_team"])
                away_rating = ratings_model.get_rating(row["away_team"])
                home_adv = math.log(max(train_home_npxg, 0.1) / max(league_side_rate, 0.1))
                lambda_home = league_side_rate * math.exp(home_adv + home_rating.attack + away_rating.defense)
                lambda_away = league_side_rate * math.exp(away_rating.attack + home_rating.defense)
                probs_override = None
            elif base_model == "rolling_npxg_poisson":
                home_for = float(contextual_features.get("home_roll_5_npxg_for", contextual_features.get("home_season_avg_npxg_for", train_home_npxg)))
                away_against = float(contextual_features.get("away_roll_5_npxg_against", contextual_features.get("away_season_avg_npxg_against", train_away_npxg)))
                away_for = float(contextual_features.get("away_roll_5_npxg_for", contextual_features.get("away_season_avg_npxg_for", train_away_npxg)))
                home_against = float(contextual_features.get("home_roll_5_npxg_against", contextual_features.get("home_season_avg_npxg_against", train_home_npxg)))
                lambda_home = max((home_for + away_against) / 2.0, 0.1)
                lambda_away = max((away_for + home_against) / 2.0, 0.1)
                probs_override = None
            elif base_model == "regularized_elo_baseline":
                if elo_model is None:
                    raise ValueError("Regularized Elo baseline was not initialized")
                elo_pred = elo_model.predict_score_matrix(
                    home_team=row["home_team"],
                    away_team=row["away_team"],
                )
                lambda_home = elo_pred.lambda_home
                lambda_away = elo_pred.lambda_away
                matrix = elo_pred.score_matrix
                probs_override = (
                    elo_pred.home_win_prob,
                    elo_pred.draw_prob,
                    elo_pred.away_win_prob,
                )
            elif base_model == "spi_lite_baseline":
                if spi_model is None:
                    raise ValueError("SPI-lite baseline was not initialized")
                spi_pred = spi_model.predict_score_matrix(
                    home_team=row["home_team"],
                    away_team=row["away_team"],
                    contextual_features=contextual_features,
                )
                lambda_home = spi_pred.lambda_home
                lambda_away = spi_pred.lambda_away
                matrix = spi_pred.score_matrix
                probs_override = (
                    spi_pred.home_win_prob,
                    spi_pred.draw_prob,
                    spi_pred.away_win_prob,
                )
            else:
                raise ValueError(f"Unknown baseline model: {base_model}")

            if base_model not in {"regularized_elo_baseline", "spi_lite_baseline"}:
                matrix = self._build_independent_score_matrix(lambda_home, lambda_away)
            rows.append(
                self._prediction_row_from_markets(
                    row=row,
                    model_name=model_name,
                    matrix=matrix,
                    lambda_home=lambda_home,
                    lambda_away=lambda_away,
                    contextual_features=contextual_features,
                    probs_override=probs_override,
                )
            )
        return pd.DataFrame(rows)

    def _create_model(self, model_name: str) -> BaseScoreModel:
        """Create model instance from name."""
        model_cfg = self.config.get("model", {})
        max_goals = model_cfg.get("max_goals", 8)
        bt_fit_cfg = self.config.get("backtest", {}).get("fit", {})

        def _fit_overrides(base_cfg: dict[str, Any], model_key: str) -> dict[str, Any]:
            overrides = {
                **bt_fit_cfg.get("common", {}),
                **bt_fit_cfg.get(model_key, {}),
            }
            return {**base_cfg, **overrides}

        if model_name == "dixon_coles":
            dc_cfg = _fit_overrides(self.config.get("dixon_coles", {}), "dixon_coles")
            return DixonColesModel(DixonColesConfig(
                max_goals=max_goals,
                home_advantage_init=dc_cfg.get("home_advantage_init", 0.25),
                home_advantage_scale=dc_cfg.get("home_advantage_scale", 1.0),
                home_advantage_cap=dc_cfg.get("home_advantage_cap"),
                max_iter=dc_cfg.get("max_iter", 2000),
                tol=dc_cfg.get("tol", 1e-8),
                rho_init=dc_cfg.get("rho_init", -0.05),
                rho_bounds=tuple(dc_cfg.get("rho_bounds", [-0.5, 0.5])),
                regularization=dc_cfg.get("regularization", 0.001),
                contextual_regularization=dc_cfg.get("contextual_regularization", 0.01),
                rho_regularization=dc_cfg.get("rho_regularization", 0.002),
            ))
        elif model_name == "bivariate_poisson":
            bp_cfg = _fit_overrides(self.config.get("bivariate_poisson", {}), "bivariate_poisson")
            return BivariatePoissonModel(BivariatePoissonConfig(
                max_goals=max_goals,
                home_advantage_init=bp_cfg.get("home_advantage_init", 0.25),
                home_advantage_scale=bp_cfg.get("home_advantage_scale", 1.0),
                home_advantage_cap=bp_cfg.get("home_advantage_cap"),
                max_iter=bp_cfg.get("max_iter", 2000),
                tol=bp_cfg.get("tol", 1e-8),
                lambda3_init=bp_cfg.get("lambda3_init", 0.1),
                lambda3_bounds=tuple(bp_cfg.get("lambda3_bounds", [0.001, 2.0])),
                regularization=bp_cfg.get("regularization", 0.001),
                contextual_regularization=bp_cfg.get("contextual_regularization", 0.01),
                lambda3_regularization=bp_cfg.get("lambda3_regularization", 0.002),
            ))
        else:
            raise ValueError(f"Unknown model: {model_name}")

    def _generate_and_settle_bets(
        self,
        row: pd.Series,
        pred: PredictionResult,
        markets: Any,
        odds_rows: pd.DataFrame,
        staker: StakingEngine,
        model_name: str,
    ) -> None:
        """Generate bet recommendations and settle against actual results."""
        match_id = str(row["match_id"])
        home_goals = int(row["home_goals_90"])
        away_goals = int(row["away_goals_90"])
        total_goals = home_goals + away_goals
        if odds_rows is None or odds_rows.empty:
            return

        evaluation_time = self._historical_odds_evaluation_time(odds_rows)
        decisions = evaluate_market_candidates(
            match_id=match_id,
            slate_key=str(row.get("match_date")),
            odds_rows=odds_rows,
            markets=markets,
            staker=staker,
            selection=self.selection_config,
            now=evaluation_time,
            model_version="backtest",
            model_family=model_name,
            blended=model_name == "full_blend",
            # Backtest candidate generation should not be blocked by live
            # promotion gates; those gates are evaluated after validation.
            gating_status="passed",
        )
        for decision in decisions:
            staker.log_decision(decision)
        accepted = [decision for decision in decisions if decision.accepted]
        if not accepted:
            return

        for decision in accepted:
            rec = BetRecommendation(
                match_id=decision.match_id,
                market=decision.market,
                side=decision.side,
                line=float(decision.line or 0.0),
                model_prob=float(decision.model_probability),
                market_odds=float(decision.market_price),
                fair_odds=float(decision.model_price),
                market_no_vig_probability=float(decision.market_no_vig_probability),
                probability_edge=float(decision.probability_edge),
                expected_value=float(decision.expected_value),
                closing_market_odds=float(decision.closing_market_price),
                clv=float(decision.clv),
                edge=float(decision.edge),
                sportsbook=decision.sportsbook,
                source_type=decision.source_type,
                market_timestamp=decision.timestamp,
                confidence=float(decision.confidence),
                confidence_band=decision.confidence_band,
                slate_key=decision.slate_key,
                model_version=decision.model_version,
                model_family=decision.model_family,
                blended=decision.blended,
                gating_status=decision.gating_status,
                pick_tier=decision.pick_tier,
                actionable=decision.actionable,
                stake=float(decision.stake),
                stake_pct=float(decision.stake_pct),
            )
            if decision.market.startswith("1x2_"):
                result = settle_1x2(
                    decision.side[0].upper(),
                    home_goals,
                    away_goals,
                    decision.market_price,
                    rec.stake,
                )
            else:
                result = settle_total(
                    decision.side,
                    total_goals,
                    float(decision.line or 0.0),
                    decision.market_price,
                    rec.stake,
            )
            staker.update_bankroll(result.pnl)
            staker.log_bet(rec, result.pnl, result.result.value)

    @staticmethod
    def _historical_odds_evaluation_time(odds_rows: pd.DataFrame) -> Any:
        """Use the quote time as the backtest clock for historical close odds."""
        if odds_rows is None or odds_rows.empty or "timestamp" not in odds_rows.columns:
            return None
        timestamps = parse_mixed_utc_datetime(odds_rows["timestamp"]).dropna()
        if timestamps.empty:
            return None
        return timestamps.max().to_pydatetime()

    @staticmethod
    def _market_betting_diagnostics(
        predictions: pd.DataFrame,
        odds: pd.DataFrame | None,
        bet_log: pd.DataFrame,
        decision_log: pd.DataFrame | None = None,
    ) -> dict[str, Any]:
        """Summarize whether ML/1X2 and totals were actually testable."""
        match_ids = (
            set(predictions["match_id"].astype(str))
            if predictions is not None and not predictions.empty and "match_id" in predictions.columns
            else set()
        )
        close_odds = pd.DataFrame()
        if odds is not None and not odds.empty:
            close_odds = odds.copy()
            close_odds["match_id"] = close_odds["match_id"].astype(str)
            if "source_type" in close_odds.columns:
                close_odds = close_odds[close_odds["source_type"].astype(str).str.lower() == "close"]
            if match_ids:
                close_odds = close_odds[close_odds["match_id"].isin(match_ids)]

        def market_rows(market_type: str) -> pd.DataFrame:
            if close_odds.empty or "market_type" not in close_odds.columns:
                return pd.DataFrame()
            return close_odds[close_odds["market_type"].astype(str).str.lower() == market_type].copy()

        def bet_rows(prefix: str) -> pd.DataFrame:
            if bet_log is None or bet_log.empty or "market" not in bet_log.columns:
                return pd.DataFrame()
            return bet_log[bet_log["market"].astype(str).str.startswith(prefix)].copy()

        def decision_rows(prefix: str) -> pd.DataFrame:
            if decision_log is None or decision_log.empty or "market" not in decision_log.columns:
                return pd.DataFrame()
            return decision_log[decision_log["market"].astype(str).str.startswith(prefix)].copy()

        diagnostics: dict[str, Any] = {"market_coverage": {"validation_matches": len(match_ids)}}
        for market_type, label, prefix in [
            ("1x2", "moneyline", "1x2_"),
            ("total", "totals", "total_"),
        ]:
            rows = market_rows(market_type)
            bets = bet_rows(prefix)
            decisions = decision_rows(prefix)
            staked = float(bets["stake"].sum()) if not bets.empty and "stake" in bets.columns else 0.0
            pnl = float(bets["pnl"].sum()) if not bets.empty and "pnl" in bets.columns else 0.0
            matches_with_odds = int(rows["match_id"].nunique()) if not rows.empty else 0
            diagnostics["market_coverage"][label] = {
                "close_odds_rows": int(len(rows)),
                "matches_with_close_odds": matches_with_odds,
                "coverage_pct": float(matches_with_odds / max(len(match_ids), 1)),
                "testable": matches_with_odds > 0,
            }
            diagnostics[f"{label}_n_bets"] = int(len(bets))
            diagnostics[f"{label}_candidate_count"] = int(len(decisions))
            diagnostics[f"{label}_accepted_count"] = int(decisions["accepted"].sum()) if not decisions.empty and "accepted" in decisions.columns else int(len(bets))
            diagnostics[f"{label}_lean_count"] = (
                int(decisions["pick_tier"].astype(str).eq("lean").sum())
                if not decisions.empty and "pick_tier" in decisions.columns
                else 0
            )
            diagnostics[f"{label}_official_pick_count"] = (
                int(decisions["pick_tier"].astype(str).eq("official_pick").sum())
                if not decisions.empty and "pick_tier" in decisions.columns
                else int(len(bets))
            )
            diagnostics[f"{label}_rejected_reasons"] = (
                {
                    str(reason): int(count)
                    for reason, count in decisions.loc[~decisions["accepted"].astype(bool), "reason"].value_counts().items()
                }
                if not decisions.empty and {"accepted", "reason"}.issubset(decisions.columns)
                else {}
            )
            diagnostics[f"{label}_total_staked"] = staked
            diagnostics[f"{label}_total_pnl"] = pnl
            diagnostics[f"{label}_roi"] = float(pnl / staked) if staked > 0 else 0.0
            diagnostics[f"{label}_hit_rate"] = (
                float((bets["pnl"] > 0).mean())
                if not bets.empty and "pnl" in bets.columns
                else 0.0
            )
            diagnostics[f"{label}_mean_clv"] = (
                float(bets["clv"].mean())
                if not bets.empty and "clv" in bets.columns
                else 0.0
            )
            diagnostics[f"{label}_positive_clv_rate"] = (
                float((bets["clv"] > 0).mean())
                if not bets.empty and "clv" in bets.columns
                else 0.0
            )
            if market_type in {"1x2", "total"}:
                sides = ("home", "draw", "away") if market_type == "1x2" else ("over", "under")
                for side in sides:
                    side_market = f"1x2_{side}" if market_type == "1x2" else f"total_{side}_"
                    if bets.empty or "market" not in bets.columns:
                        side_bets = pd.DataFrame()
                    elif market_type == "1x2":
                        side_bets = bets[bets["market"].astype(str).eq(side_market)].copy()
                    else:
                        side_bets = bets[bets["market"].astype(str).str.startswith(side_market)].copy()

                    if decisions.empty or "market" not in decisions.columns:
                        side_decisions = pd.DataFrame()
                    elif market_type == "1x2":
                        side_decisions = decisions[decisions["market"].astype(str).eq(side_market)].copy()
                    else:
                        side_decisions = decisions[
                            decisions["market"].astype(str).str.startswith(side_market)
                        ].copy()
                    side_staked = (
                        float(side_bets["stake"].sum())
                        if not side_bets.empty and "stake" in side_bets.columns
                        else 0.0
                    )
                    side_pnl = (
                        float(side_bets["pnl"].sum())
                        if not side_bets.empty and "pnl" in side_bets.columns
                        else 0.0
                    )
                    prefix_key = f"{label}_{side}"
                    diagnostics[f"{prefix_key}_candidate_count"] = int(len(side_decisions))
                    diagnostics[f"{prefix_key}_n_bets"] = int(len(side_bets))
                    diagnostics[f"{prefix_key}_accepted_count"] = (
                        int(side_decisions["accepted"].sum())
                        if not side_decisions.empty and "accepted" in side_decisions.columns
                        else int(len(side_bets))
                    )
                    diagnostics[f"{prefix_key}_lean_count"] = (
                        int(side_decisions["pick_tier"].astype(str).eq("lean").sum())
                        if not side_decisions.empty and "pick_tier" in side_decisions.columns
                        else 0
                    )
                    diagnostics[f"{prefix_key}_official_pick_count"] = (
                        int(side_decisions["pick_tier"].astype(str).eq("official_pick").sum())
                        if not side_decisions.empty and "pick_tier" in side_decisions.columns
                        else int(len(side_bets))
                    )
                    diagnostics[f"{prefix_key}_rejected_reasons"] = (
                        {
                            str(reason): int(count)
                            for reason, count in side_decisions.loc[
                                ~side_decisions["accepted"].astype(bool), "reason"
                            ].value_counts().items()
                        }
                        if not side_decisions.empty and {"accepted", "reason"}.issubset(side_decisions.columns)
                        else {}
                    )
                    diagnostics[f"{prefix_key}_total_staked"] = side_staked
                    diagnostics[f"{prefix_key}_total_pnl"] = side_pnl
                    diagnostics[f"{prefix_key}_roi"] = float(side_pnl / side_staked) if side_staked > 0 else 0.0
                    diagnostics[f"{prefix_key}_hit_rate"] = (
                        float((side_bets["pnl"] > 0).mean())
                        if not side_bets.empty and "pnl" in side_bets.columns
                        else 0.0
                    )
        return diagnostics
