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

from src.backtest.metrics import compute_all_metrics
from src.backtest.splitter import BacktestFold, ExpandingWindowSplitter
from src.betting.market_derivation import derive_all_markets
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
from src.features.match_features import (
    build_match_features,
    compute_rolling_form,
    compute_season_stats,
)
from src.models.base import BaseScoreModel, PredictionResult
from src.models.bivariate_poisson import BivariatePoissonConfig, BivariatePoissonModel
from src.models.dixon_coles import DixonColesConfig, DixonColesModel
from src.models.market_blend import MarketBlender
from src.models.team_ratings import TeamRatingsConfig, TeamRatingsModel

logger = logging.getLogger("nwsl_model.backtest.runner")


class BacktestRunner:
    """Run expanding-window backtest across multiple model configurations."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.results: list[dict[str, Any]] = []
        self.predictions: list[pd.DataFrame] = []
        self.bet_logs: list[pd.DataFrame] = []

    def run(
        self,
        matches: pd.DataFrame,
        odds: Optional[pd.DataFrame] = None,
        models_to_run: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Run the full backtest.

        Args:
            matches: Validated match data.
            odds: Optional odds data.
            models_to_run: List of model names to evaluate.
                Options: "dixon_coles", "bivariate_poisson", "market_implied", "full_blend"
        """
        if models_to_run is None:
            models_to_run = ["dixon_coles", "bivariate_poisson", "market_implied", "full_blend"]

        # Prepare data
        matches = run_all_validations(matches)
        matches = add_result_columns(matches)
        matches = add_npxg_fallback(matches)
        if odds is not None:
            matches = merge_odds_to_matches(matches, odds)

        # Splitter
        bt_cfg = self.config.get("backtest", {})
        splitter = ExpandingWindowSplitter(
            min_train_matches=bt_cfg.get("min_train_matches", 50),
            step_size=bt_cfg.get("step_size", 1),
        )

        # Staking engine
        bet_cfg = self.config.get("betting", {})
        staking_config = StakingConfig(
            min_edge=bet_cfg.get("min_edge", 0.02),
            kelly_fraction=bet_cfg.get("kelly_fraction", 0.25),
            max_stake_pct=bet_cfg.get("max_stake_pct", 0.01),
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
                        fold, model_name, staker, blender, odds
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
    ) -> pd.DataFrame:
        """Evaluate a single fold for a given model."""
        train = fold.train_matches
        test = fold.test_matches

        if model_name == "market_implied":
            return self._evaluate_market_implied(test)

        # Build team ratings from training data
        team_matches = melt_to_team_match(train)
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

        # Compute recency weights for training
        days_since = np.array([
            (reference_date - d).days for d in train["match_date"]
        ], dtype=np.float64)
        weights = np.exp(-days_since * math.log(2) / ratings_cfg.get("half_life_days", 90))

        # Fit score model
        model = self._create_model(model_name)
        model.fit(train, weights=weights)

        # Predict test matches
        results = []
        for _, row in test.iterrows():
            pred = model.predict_score_matrix(
                home_team=row["home_team"],
                away_team=row["away_team"],
            )

            # Derive markets
            markets = derive_all_markets(pred.score_matrix, match_id=str(row["match_id"]))

            # Blend with market if available and model is "full_blend"
            if model_name == "full_blend":
                market_odds_1x2 = None
                if all(c in row.index for c in ["home_odds", "draw_odds", "away_odds"]):
                    h_o, d_o, a_o = row.get("home_odds"), row.get("draw_odds"), row.get("away_odds")
                    if not any(pd.isna(x) for x in [h_o, d_o, a_o]):
                        market_odds_1x2 = (h_o, d_o, a_o)

                if market_odds_1x2:
                    home_mp = min(
                        ratings_model.get_rating(row["home_team"]).n_matches,
                        ratings_model.get_rating(row["away_team"]).n_matches,
                    )
                    blended = blender.blend_1x2(
                        (pred.home_win_prob, pred.draw_prob, pred.away_win_prob),
                        market_odds_1x2,
                        matches_played=home_mp,
                    )
                    pred = PredictionResult(
                        match_id=pred.match_id,
                        home_team=pred.home_team,
                        away_team=pred.away_team,
                        lambda_home=pred.lambda_home,
                        lambda_away=pred.lambda_away,
                        score_matrix=blender.blend_score_matrix(
                            pred.score_matrix, market_odds_1x2, home_mp
                        ),
                        home_win_prob=blended[0],
                        draw_prob=blended[1],
                        away_win_prob=blended[2],
                        metadata={**pred.metadata, "blended": True},
                    )
                    markets = derive_all_markets(pred.score_matrix, match_id=str(row["match_id"]))

            # Generate bet recommendations and settle
            self._generate_and_settle_bets(
                row, pred, markets, staker
            )

            result_row = {
                "match_id": row["match_id"],
                "match_date": row["match_date"],
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
            }

            # Add derived binary columns
            result_row["total_goals"] = row["home_goals_90"] + row["away_goals_90"]
            result_row["home_win"] = int(row["home_goals_90"] > row["away_goals_90"])
            result_row["over_2_5"] = int(result_row["total_goals"] > 2.5)

            if 2.5 in markets.over_probs:
                result_row["prob_over_2.5"] = markets.over_probs[2.5]

            results.append(result_row)

        return pd.DataFrame(results)

    def _evaluate_market_implied(self, test: pd.DataFrame) -> pd.DataFrame:
        """Evaluate using market implied probabilities only."""
        results = []
        for _, row in test.iterrows():
            prob_h = row.get("mkt_prob_home", np.nan)
            prob_d = row.get("mkt_prob_draw", np.nan)
            prob_a = row.get("mkt_prob_away", np.nan)

            results.append({
                "match_id": row["match_id"],
                "match_date": row["match_date"],
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "home_goals_90": row["home_goals_90"],
                "away_goals_90": row["away_goals_90"],
                "prob_home": prob_h if not np.isnan(prob_h) else 1/3,
                "prob_draw": prob_d if not np.isnan(prob_d) else 1/3,
                "prob_away": prob_a if not np.isnan(prob_a) else 1/3,
                "lambda_home": np.nan,
                "lambda_away": np.nan,
                "model": "market_implied",
                "total_goals": row["home_goals_90"] + row["away_goals_90"],
                "home_win": int(row["home_goals_90"] > row["away_goals_90"]),
                "over_2_5": int(row["home_goals_90"] + row["away_goals_90"] > 2.5),
            })

        return pd.DataFrame(results)

    def _create_model(self, model_name: str) -> BaseScoreModel:
        """Create model instance from name."""
        model_cfg = self.config.get("model", {})
        max_goals = model_cfg.get("max_goals", 8)

        if model_name in ("dixon_coles", "full_blend"):
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
        staker: StakingEngine,
    ) -> None:
        """Generate bet recommendations and settle against actual results."""
        match_id = str(row["match_id"])
        home_goals = int(row["home_goals_90"])
        away_goals = int(row["away_goals_90"])
        total_goals = home_goals + away_goals

        # 1X2 bets
        for side, prob, odds_col in [
            ("home", pred.home_win_prob, "home_odds"),
            ("draw", pred.draw_prob, "draw_odds"),
            ("away", pred.away_win_prob, "away_odds"),
        ]:
            mkt_odds = row.get(odds_col, np.nan)
            if pd.isna(mkt_odds) or mkt_odds <= 1.0:
                continue

            rec = staker.recommend_bet(
                match_id, f"1x2_{side}", side, prob, mkt_odds
            )
            if rec:
                result = settle_1x2(
                    side[0].upper(), home_goals, away_goals, mkt_odds, rec.stake
                )
                staker.update_bankroll(result.pnl)
                staker.log_bet(rec, result.pnl, result.result.value)

        # Totals bets (over/under 2.5 as primary)
        for line_val in [2.5]:
            if line_val in markets.over_probs:
                over_odds = row.get("over_odds", np.nan)
                if not pd.isna(over_odds) and over_odds > 1.0:
                    rec = staker.recommend_bet(
                        match_id, f"total_over_{line_val}", "over",
                        markets.over_probs[line_val], over_odds, line=line_val,
                    )
                    if rec:
                        result = settle_total("over", total_goals, line_val, over_odds, rec.stake)
                        staker.update_bankroll(result.pnl)
                        staker.log_bet(rec, result.pnl, result.result.value)

            if line_val in markets.under_probs:
                under_odds = row.get("under_odds", np.nan)
                if not pd.isna(under_odds) and under_odds > 1.0:
                    rec = staker.recommend_bet(
                        match_id, f"total_under_{line_val}", "under",
                        markets.under_probs[line_val], under_odds, line=line_val,
                    )
                    if rec:
                        result = settle_total("under", total_goals, line_val, under_odds, rec.stake)
                        staker.update_bankroll(result.pnl)
                        staker.log_bet(rec, result.pnl, result.result.value)
