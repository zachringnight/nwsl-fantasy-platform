"""Serveable non-market baseline models for projection fallback."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.stats import poisson

from src.models.base import PredictionResult
from src.models.spi_lite import SpiLiteBaseline


def _build_independent_score_matrix(
    lambda_home: float,
    lambda_away: float,
    max_goals: int = 8,
) -> np.ndarray:
    goals = np.arange(max_goals + 1, dtype=np.float64)
    home_pmf = poisson.pmf(goals, max(lambda_home, 0.05))
    away_pmf = poisson.pmf(goals, max(lambda_away, 0.05))
    matrix = np.outer(home_pmf, away_pmf)
    total = float(matrix.sum())
    if total > 0:
        matrix /= total
    return matrix


class ProjectionBaselineModel:
    """Simple independent-Poisson baseline used when no champion is promoted."""

    def __init__(
        self,
        strategy: str,
        ratings_model: Any | None = None,
        max_goals: int = 8,
        spi_lite_config: dict[str, Any] | None = None,
        league_home_rate: float | None = None,
        league_away_rate: float | None = None,
    ) -> None:
        self.strategy = strategy
        self.ratings_model = ratings_model
        self.max_goals = max_goals
        spi_cfg = spi_lite_config or {}
        spi_lite_kwargs: dict[str, Any] = dict(
            ratings_model=ratings_model,
            max_goals=max_goals,
            rating_weight=spi_cfg.get("rating_weight", 0.55),
            current_full_weight_matches=spi_cfg.get("current_full_weight_matches", 10.0),
            max_rating_log_adjustment=spi_cfg.get("max_rating_log_adjustment", 0.70),
            lineup_log_scale=spi_cfg.get("lineup_log_scale", 0.035),
            rest_log_scale=spi_cfg.get("rest_log_scale", 0.012),
            pace_weight=spi_cfg.get("pace_weight", 0.20),
            min_lambda=spi_cfg.get("min_lambda", 0.20),
            max_lambda=spi_cfg.get("max_lambda", 3.75),
        )
        # Explicit constructor kwargs win over config; both are optional and
        # None keeps SpiLiteBaseline's own defaults (this is the train/serve
        # skew fix: backtest fits league rates per-fold, serving previously
        # hardcoded 1.25/1.05 no matter what the training data implied).
        resolved_home_rate = league_home_rate if league_home_rate is not None else spi_cfg.get("league_home_rate")
        resolved_away_rate = league_away_rate if league_away_rate is not None else spi_cfg.get("league_away_rate")
        if resolved_home_rate is not None:
            spi_lite_kwargs["league_home_rate"] = resolved_home_rate
        if resolved_away_rate is not None:
            spi_lite_kwargs["league_away_rate"] = resolved_away_rate
        self._spi_lite = SpiLiteBaseline(**spi_lite_kwargs)

    def _resolve_lambdas(
        self,
        home_team: str,
        away_team: str,
        contextual_features: dict[str, float] | None = None,
    ) -> tuple[float, float]:
        context = contextual_features or {}
        if self.strategy == "uniform_baseline":
            return (1.15, 1.15)

        if self.strategy == "home_field_baseline":
            lambda_home = float(
                context.get("home_season_avg_npxg_for", context.get("home_roll_5_npxg_for", 1.35))
            )
            lambda_away = float(
                context.get("away_season_avg_npxg_for", context.get("away_roll_5_npxg_for", 1.05))
            )
            return (max(lambda_home, 0.1), max(lambda_away, 0.1))

        if self.strategy == "team_ratings_poisson":
            if self.ratings_model is None:
                return (1.25, 1.05)
            home_rating = self.ratings_model.get_rating(home_team)
            away_rating = self.ratings_model.get_rating(away_team)
            lambda_home = 1.25 * math.exp(0.12 + home_rating.attack + away_rating.defense)
            lambda_away = 1.05 * math.exp(away_rating.attack + home_rating.defense)
            return (max(lambda_home, 0.1), max(lambda_away, 0.1))

        if self.strategy == "spi_lite_baseline":
            pred = self._spi_lite.predict_score_matrix(
                home_team=home_team,
                away_team=away_team,
                contextual_features=context,
            )
            return (pred.lambda_home, pred.lambda_away)

        if self.strategy == "rolling_npxg_poisson":
            home_for = float(
                context.get("home_roll_5_npxg_for", context.get("home_season_avg_npxg_for", 1.2))
            )
            away_against = float(
                context.get(
                    "away_roll_5_npxg_against",
                    context.get("away_season_avg_npxg_against", 1.1),
                )
            )
            away_for = float(
                context.get("away_roll_5_npxg_for", context.get("away_season_avg_npxg_for", 1.0))
            )
            home_against = float(
                context.get(
                    "home_roll_5_npxg_against",
                    context.get("home_season_avg_npxg_against", 1.0),
                )
            )
            lambda_home = max((home_for + away_against) / 2.0, 0.1)
            lambda_away = max((away_for + home_against) / 2.0, 0.1)
            return (lambda_home, lambda_away)

        raise ValueError(f"Unknown baseline strategy: {self.strategy}")

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: float | None = None,
        contextual_features: dict[str, float] | None = None,
    ) -> PredictionResult:
        del home_advantage

        lambda_home, lambda_away = self._resolve_lambdas(
            home_team=home_team,
            away_team=away_team,
            contextual_features=contextual_features,
        )
        if self.strategy == "spi_lite_baseline":
            spi_pred = self._spi_lite.predict_score_matrix(
                home_team=home_team,
                away_team=away_team,
                contextual_features=contextual_features,
            )
            spi_pred.match_id = ""
            return spi_pred

        matrix = _build_independent_score_matrix(
            lambda_home=lambda_home,
            lambda_away=lambda_away,
            max_goals=self.max_goals,
        )
        home_win_prob = float(np.tril(matrix, k=-1).sum())
        draw_prob = float(np.trace(matrix))
        away_win_prob = float(np.triu(matrix, k=1).sum())

        return PredictionResult(
            match_id="",
            home_team=home_team,
            away_team=away_team,
            lambda_home=float(lambda_home),
            lambda_away=float(lambda_away),
            score_matrix=matrix,
            home_win_prob=home_win_prob,
            draw_prob=draw_prob,
            away_win_prob=away_win_prob,
            metadata={"baseline_strategy": self.strategy},
        )
