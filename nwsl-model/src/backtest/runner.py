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
from src.features.context import ContextualFeatureProvider, build_contextual_training_frame
from src.features.market_features import compute_market_probabilities, compute_totals_market_probabilities
from src.features.match_features import (
    compute_rolling_form,
    compute_season_stats,
)
from src.models.base import BaseScoreModel, PredictionResult
from src.models.bivariate_poisson import BivariatePoissonConfig, BivariatePoissonModel
from src.models.dixon_coles import DixonColesConfig, DixonColesModel
from src.models.market_blend import MarketBlender
from src.models.team_ratings import TeamRatingsConfig, TeamRatingsModel

logger = logging.getLogger("nwsl_model.backtest.runner")

PURE_MODELS = {"dixon_coles", "bivariate_poisson"}
BASELINE_MODELS = {
    "uniform_baseline",
    "home_field_baseline",
    "team_ratings_poisson",
    "rolling_npxg_poisson",
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

                metrics = compute_all_metrics(all_preds, bet_log)
                metrics["model"] = model_name
                metrics["staking_summary"] = staker.summary()

                all_model_results[model_name] = {
                    "metrics": metrics,
                    "predictions": all_preds,
                    "bet_log": bet_log,
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
        model.fit(prepared_train, weights=weights, contextual_cols=contextual_cols)

        # Predict test matches
        results = []
        for _, row in test.iterrows():
            contextual_features = context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row.get("match_date"),
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
            total_line = row.get("total_line")
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

        rows: list[dict[str, Any]] = []
        for _, row in test.iterrows():
            contextual_features = context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row.get("match_date"),
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
                lambda_home = league_side_rate * math.exp(home_adv + home_rating.attack - away_rating.defense)
                lambda_away = league_side_rate * math.exp(away_rating.attack - home_rating.defense)
                probs_override = None
            elif base_model == "rolling_npxg_poisson":
                home_for = float(contextual_features.get("home_roll_5_npxg_for", contextual_features.get("home_season_avg_npxg_for", train_home_npxg)))
                away_against = float(contextual_features.get("away_roll_5_npxg_against", contextual_features.get("away_season_avg_npxg_against", train_away_npxg)))
                away_for = float(contextual_features.get("away_roll_5_npxg_for", contextual_features.get("away_season_avg_npxg_for", train_away_npxg)))
                home_against = float(contextual_features.get("home_roll_5_npxg_against", contextual_features.get("home_season_avg_npxg_against", train_home_npxg)))
                lambda_home = max((home_for + away_against) / 2.0, 0.1)
                lambda_away = max((away_for + home_against) / 2.0, 0.1)
                probs_override = None
            else:
                raise ValueError(f"Unknown baseline model: {base_model}")

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

        if model_name == "dixon_coles":
            dc_cfg = self.config.get("dixon_coles", {})
            return DixonColesModel(DixonColesConfig(
                max_goals=max_goals,
                home_advantage_init=dc_cfg.get("home_advantage_init", 0.25),
                max_iter=dc_cfg.get("max_iter", 2000),
                tol=dc_cfg.get("tol", 1e-8),
                rho_init=dc_cfg.get("rho_init", -0.05),
                rho_bounds=tuple(dc_cfg.get("rho_bounds", [-0.5, 0.5])),
            ))
        elif model_name == "bivariate_poisson":
            bp_cfg = self.config.get("bivariate_poisson", {})
            return BivariatePoissonModel(BivariatePoissonConfig(
                max_goals=max_goals,
                home_advantage_init=bp_cfg.get("home_advantage_init", 0.25),
                max_iter=bp_cfg.get("max_iter", 2000),
                tol=bp_cfg.get("tol", 1e-8),
                lambda3_init=bp_cfg.get("lambda3_init", 0.1),
                lambda3_bounds=tuple(bp_cfg.get("lambda3_bounds", [0.001, 2.0])),
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

        decisions = evaluate_market_candidates(
            match_id=match_id,
            slate_key=str(row.get("match_date")),
            odds_rows=odds_rows,
            markets=markets,
            staker=staker,
            selection=self.selection_config,
            model_version="backtest",
            model_family=model_name,
            blended=model_name == "full_blend",
            gating_status="backtest",
        )
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
