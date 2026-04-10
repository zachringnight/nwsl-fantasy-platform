"""Serveable non-market baseline models for projection fallback."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.stats import poisson

from src.models.base import PredictionResult


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
    ) -> None:
        self.strategy = strategy
        self.ratings_model = ratings_model
        self.max_goals = max_goals

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
            lambda_home = 1.25 * math.exp(0.12 + home_rating.attack - away_rating.defense)
            lambda_away = 1.05 * math.exp(away_rating.attack - home_rating.defense)
            return (max(lambda_home, 0.1), max(lambda_away, 0.1))

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
