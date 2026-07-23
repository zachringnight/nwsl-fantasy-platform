"""SPI-lite independent Poisson projection model.

This is a compact, transparent rating model inspired by public soccer models:
separate attack/defense strength, current-season xG form, roster-prior decay,
and lineup deltas. It is intentionally low-parameter so it can serve as a
strong chronological benchmark in small NWSL samples.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy.stats import poisson

from src.models.base import PredictionResult


@dataclass(frozen=True)
class SpiLiteConfig:
    max_goals: int = 8
    league_home_rate: float = 1.25
    league_away_rate: float = 1.05
    rating_weight: float = 0.55
    current_full_weight_matches: float = 10.0
    max_rating_log_adjustment: float = 0.70
    lineup_log_scale: float = 0.035
    rest_log_scale: float = 0.012
    pace_weight: float = 0.20
    min_lambda: float = 0.20
    max_lambda: float = 3.75


def _finite_float(value: Any, default: float = 0.0) -> float:
    try:
        output = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(output):
        return default
    return output


def _positive(value: Any) -> float | None:
    output = _finite_float(value, 0.0)
    if output <= 0.0:
        return None
    return output


def _weighted_average(candidates: list[tuple[Any, float]], fallback: float) -> float:
    total_weight = 0.0
    total_value = 0.0
    for value, weight in candidates:
        numeric = _positive(value)
        if numeric is None or weight <= 0.0:
            continue
        total_value += numeric * float(weight)
        total_weight += float(weight)
    if total_weight <= 0.0:
        return float(fallback)
    return float(total_value / total_weight)


def _build_independent_score_matrix(
    lambda_home: float,
    lambda_away: float,
    max_goals: int,
) -> NDArray[np.float64]:
    goals = np.arange(max_goals + 1, dtype=np.float64)
    home_pmf = poisson.pmf(goals, max(lambda_home, 0.05))
    away_pmf = poisson.pmf(goals, max(lambda_away, 0.05))
    matrix = np.outer(home_pmf, away_pmf).astype(np.float64)
    total = float(matrix.sum())
    if total > 0.0:
        matrix /= total
    return matrix


class SpiLiteBaseline:
    """Low-parameter xG/rating benchmark with lineup and prior decay."""

    def __init__(
        self,
        ratings_model: Any | None = None,
        *,
        max_goals: int = 8,
        league_home_rate: float = 1.25,
        league_away_rate: float = 1.05,
        rating_weight: float = 0.55,
        current_full_weight_matches: float = 10.0,
        max_rating_log_adjustment: float = 0.70,
        lineup_log_scale: float = 0.035,
        rest_log_scale: float = 0.012,
        pace_weight: float = 0.20,
        min_lambda: float = 0.20,
        max_lambda: float = 3.75,
    ) -> None:
        self.ratings_model = ratings_model
        self.config = SpiLiteConfig(
            max_goals=int(max_goals),
            league_home_rate=max(float(league_home_rate), 0.1),
            league_away_rate=max(float(league_away_rate), 0.1),
            rating_weight=float(np.clip(rating_weight, 0.0, 1.0)),
            current_full_weight_matches=max(float(current_full_weight_matches), 1.0),
            max_rating_log_adjustment=max(float(max_rating_log_adjustment), 0.05),
            lineup_log_scale=float(lineup_log_scale),
            rest_log_scale=float(rest_log_scale),
            pace_weight=float(np.clip(pace_weight, 0.0, 1.0)),
            min_lambda=max(float(min_lambda), 0.05),
            max_lambda=max(float(max_lambda), 0.2),
        )

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: float | None = None,
        contextual_features: dict[str, float] | None = None,
    ) -> PredictionResult:
        del home_advantage

        context = contextual_features or {}
        lambda_home, lambda_away, metadata = self._resolve_lambdas(home_team, away_team, context)
        matrix = _build_independent_score_matrix(
            lambda_home=lambda_home,
            lambda_away=lambda_away,
            max_goals=self.config.max_goals,
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
            metadata=metadata,
        )

    def _resolve_lambdas(
        self,
        home_team: str,
        away_team: str,
        context: dict[str, float],
    ) -> tuple[float, float, dict[str, Any]]:
        home_rating = self._rating(home_team)
        away_rating = self._rating(away_team)

        home_rating_lambda = self.config.league_home_rate * math.exp(
            self._clamp_log_adjustment(home_rating["attack"] + away_rating["defense"])
        )
        away_rating_lambda = self.config.league_away_rate * math.exp(
            self._clamp_log_adjustment(away_rating["attack"] + home_rating["defense"])
        )

        home_for = self._team_attack_signal("home", context, self.config.league_home_rate)
        away_for = self._team_attack_signal("away", context, self.config.league_away_rate)
        home_against = self._team_defense_signal("home", context, self.config.league_away_rate)
        away_against = self._team_defense_signal("away", context, self.config.league_home_rate)

        home_context_lambda = max((home_for + away_against) / 2.0, self.config.min_lambda)
        away_context_lambda = max((away_for + home_against) / 2.0, self.config.min_lambda)

        rating_weight = self.config.rating_weight
        context_weight = 1.0 - rating_weight
        lambda_home = rating_weight * home_rating_lambda + context_weight * home_context_lambda
        lambda_away = rating_weight * away_rating_lambda + context_weight * away_context_lambda

        pace_multiplier = self._pace_multiplier(
            home_for=home_for,
            away_for=away_for,
            home_against=home_against,
            away_against=away_against,
        )
        lambda_home *= pace_multiplier
        lambda_away *= pace_multiplier

        lineup_delta = _finite_float(context.get("home_lineup_strength_delta"), 0.0) - _finite_float(
            context.get("away_lineup_strength_delta"), 0.0
        )
        lineup_adjustment = float(
            np.clip(self.config.lineup_log_scale * lineup_delta, -0.20, 0.20)
        )
        lambda_home *= math.exp(lineup_adjustment)
        lambda_away *= math.exp(-lineup_adjustment)

        rest_diff = float(np.clip(_finite_float(context.get("rest_diff"), 0.0), -7.0, 7.0))
        rest_adjustment = float(np.clip(self.config.rest_log_scale * rest_diff, -0.08, 0.08))
        lambda_home *= math.exp(rest_adjustment)
        lambda_away *= math.exp(-rest_adjustment)

        lambda_home = float(np.clip(lambda_home, self.config.min_lambda, self.config.max_lambda))
        lambda_away = float(np.clip(lambda_away, self.config.min_lambda, self.config.max_lambda))

        return lambda_home, lambda_away, {
            "model": "spi_lite_baseline",
            "home_rating_lambda": float(home_rating_lambda),
            "away_rating_lambda": float(away_rating_lambda),
            "home_context_lambda": float(home_context_lambda),
            "away_context_lambda": float(away_context_lambda),
            "pace_multiplier": float(pace_multiplier),
            "lineup_adjustment": float(lineup_adjustment),
            "rest_adjustment": float(rest_adjustment),
            "home_attack_rating": float(home_rating["attack"]),
            "home_defense_rating": float(home_rating["defense"]),
            "away_attack_rating": float(away_rating["attack"]),
            "away_defense_rating": float(away_rating["defense"]),
        }

    def _rating(self, team: str) -> dict[str, float]:
        if self.ratings_model is None:
            return {"attack": 0.0, "defense": 0.0}
        rating = self.ratings_model.get_rating(team)
        return {
            "attack": _finite_float(getattr(rating, "attack", 0.0), 0.0),
            "defense": _finite_float(getattr(rating, "defense", 0.0), 0.0),
        }

    def _team_attack_signal(self, prefix: str, context: dict[str, float], fallback: float) -> float:
        current = _weighted_average(
            [
                (context.get(f"{prefix}_season_avg_npxg_for"), 0.60),
                (context.get(f"{prefix}_roll_5_npxg_for"), 0.40),
            ],
            fallback=fallback,
        )
        prior = _weighted_average(
            [
                (context.get(f"{prefix}_team_xg_per_match"), 0.70),
                (context.get(f"{prefix}_team_goals_per_match"), 0.30),
            ],
            fallback=current,
        )
        return self._blend_current_and_prior(prefix, context, current, prior)

    def _team_defense_signal(self, prefix: str, context: dict[str, float], fallback: float) -> float:
        current = _weighted_average(
            [
                (context.get(f"{prefix}_season_avg_npxg_against"), 0.60),
                (context.get(f"{prefix}_roll_5_npxg_against"), 0.40),
            ],
            fallback=fallback,
        )
        prior = _weighted_average(
            [
                (context.get(f"{prefix}_team_xg_against_per_match"), 0.70),
                (context.get(f"{prefix}_team_goals_against_per_match"), 0.30),
            ],
            fallback=current,
        )
        return self._blend_current_and_prior(prefix, context, current, prior)

    def _blend_current_and_prior(
        self,
        prefix: str,
        context: dict[str, float],
        current: float,
        prior: float,
    ) -> float:
        matches_played = max(_finite_float(context.get(f"{prefix}_season_matches_played"), 0.0), 0.0)
        current_weight = float(np.clip(matches_played / self.config.current_full_weight_matches, 0.0, 1.0))
        continuity_weight = _finite_float(context.get(f"{prefix}_roster_historical_prior_weight"), np.nan)
        if math.isfinite(continuity_weight):
            prior_weight = float(np.clip((1.0 - current_weight) * continuity_weight, 0.0, 1.0))
        else:
            prior_weight = 1.0 - current_weight
        current_weight = 1.0 - prior_weight
        return float(max(current_weight * current + prior_weight * prior, self.config.min_lambda))

    def _pace_multiplier(
        self,
        *,
        home_for: float,
        away_for: float,
        home_against: float,
        away_against: float,
    ) -> float:
        league_total = max(self.config.league_home_rate + self.config.league_away_rate, 0.2)
        observed_total = max((home_for + away_for + home_against + away_against) / 2.0, 0.2)
        raw_pace = observed_total / league_total
        return float(1.0 + self.config.pace_weight * np.clip(raw_pace - 1.0, -0.35, 0.35))

    def _clamp_log_adjustment(self, value: float) -> float:
        return float(
            np.clip(
                _finite_float(value, 0.0),
                -self.config.max_rating_log_adjustment,
                self.config.max_rating_log_adjustment,
            )
        )
