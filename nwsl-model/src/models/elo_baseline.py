"""Regularized Elo baseline for benchmark backtests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from scipy.stats import poisson

from src.models.base import PredictionResult


@dataclass(frozen=True)
class EloBaselineConfig:
    initial_rating: float = 1500.0
    k_factor: float = 20.0
    home_advantage_elo: float = 45.0
    draw_prior: float = 0.27
    draw_prior_weight: float = 50.0
    draw_weight: float = 0.5
    max_goals: int = 8


class RegularizedEloBaseline:
    """Low-variance Elo baseline with a shrunken league draw rate."""

    def __init__(
        self,
        initial_rating: float = 1500.0,
        k_factor: float = 20.0,
        home_advantage_elo: float = 45.0,
        draw_prior: float = 0.27,
        draw_prior_weight: float = 50.0,
        draw_weight: float = 0.5,
        max_goals: int = 8,
    ) -> None:
        if not 0.0 < draw_prior < 1.0:
            raise ValueError("draw_prior must be between 0 and 1")
        if draw_prior_weight < 0.0:
            raise ValueError("draw_prior_weight must be non-negative")
        if not 0.0 <= draw_weight <= 1.0:
            raise ValueError("draw_weight must be between 0 and 1")
        if max_goals < 1:
            raise ValueError("max_goals must be at least 1")

        self.config = EloBaselineConfig(
            initial_rating=float(initial_rating),
            k_factor=float(k_factor),
            home_advantage_elo=float(home_advantage_elo),
            draw_prior=float(draw_prior),
            draw_prior_weight=float(draw_prior_weight),
            draw_weight=float(draw_weight),
            max_goals=int(max_goals),
        )
        self.ratings: dict[str, float] = {}
        self.n_matches: int = 0
        self.n_draws: int = 0

    @property
    def draw_probability(self) -> float:
        denominator = self.n_matches + self.config.draw_prior_weight
        if denominator <= 0.0:
            return self.config.draw_prior
        numerator = self.n_draws + self.config.draw_prior * self.config.draw_prior_weight
        return float(numerator / denominator)

    def fit(self, matches: pd.DataFrame) -> "RegularizedEloBaseline":
        """Fit Elo ratings from completed matches in chronological order."""
        required_columns = {"home_team", "away_team", "home_goals_90", "away_goals_90"}
        missing_columns = required_columns.difference(matches.columns)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"matches missing required columns: {missing}")

        self.ratings = {}
        self.n_matches = 0
        self.n_draws = 0

        match_rows = matches.copy()
        if "match_date" in match_rows.columns:
            match_rows = match_rows.sort_values("match_date", kind="stable")

        for _, row in match_rows.iterrows():
            home_goals = row["home_goals_90"]
            away_goals = row["away_goals_90"]
            if pd.isna(home_goals) or pd.isna(away_goals):
                continue

            home_team = str(row["home_team"])
            away_team = str(row["away_team"])
            home_rating = self._ensure_rating(home_team)
            away_rating = self._ensure_rating(away_team)
            expected_home = self._expected_home_score(home_rating, away_rating)

            home_goals_float = float(home_goals)
            away_goals_float = float(away_goals)
            if home_goals_float > away_goals_float:
                actual_home = 1.0
            elif home_goals_float < away_goals_float:
                actual_home = 0.0
            else:
                actual_home = self.config.draw_weight
                self.n_draws += 1

            rating_delta = self.config.k_factor * (actual_home - expected_home)
            self.ratings[home_team] = home_rating + rating_delta
            self.ratings[away_team] = away_rating - rating_delta
            self.n_matches += 1

        return self

    def predict_1x2(self, home_team: str, away_team: str) -> tuple[float, float, float]:
        """Return home/draw/away probabilities from Elo plus shrunken draw rate."""
        home_rating = self._rating(home_team)
        away_rating = self._rating(away_team)
        home_non_draw_share = self._expected_home_score(home_rating, away_rating)
        draw_prob = self.draw_probability
        non_draw_prob = 1.0 - draw_prob
        home_prob = non_draw_prob * home_non_draw_share
        away_prob = non_draw_prob * (1.0 - home_non_draw_share)
        return self._normalize_probs(home_prob, draw_prob, away_prob)

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: float | None = None,
        contextual_features: dict[str, float] | None = None,
    ) -> PredictionResult:
        """Return a low-information score matrix adapted to the Elo 1X2 prices."""
        del contextual_features

        if home_advantage is None:
            probs = self.predict_1x2(home_team, away_team)
            home_non_draw_share = self._expected_home_score(
                self._rating(home_team),
                self._rating(away_team),
            )
        else:
            probs = self._predict_1x2_with_home_advantage(home_team, away_team, float(home_advantage))
            home_non_draw_share = self._expected_home_score(
                self._rating(home_team),
                self._rating(away_team),
                home_advantage_elo=float(home_advantage),
            )

        lambda_home, lambda_away = self._low_information_lambdas(probs, home_non_draw_share)
        matrix = self._build_independent_score_matrix(lambda_home, lambda_away)
        matrix = self._calibrate_matrix_to_1x2(matrix, probs)

        return PredictionResult(
            match_id="",
            home_team=home_team,
            away_team=away_team,
            lambda_home=float(lambda_home),
            lambda_away=float(lambda_away),
            score_matrix=matrix,
            home_win_prob=probs[0],
            draw_prob=probs[1],
            away_win_prob=probs[2],
            metadata={
                "model": "regularized_elo_baseline",
                "home_rating": self._rating(home_team),
                "away_rating": self._rating(away_team),
                "draw_probability": self.draw_probability,
            },
        )

    def _rating(self, team: str) -> float:
        return self.ratings.get(team, self.config.initial_rating)

    def _ensure_rating(self, team: str) -> float:
        return self.ratings.setdefault(team, self.config.initial_rating)

    def _expected_home_score(
        self,
        home_rating: float,
        away_rating: float,
        home_advantage_elo: float | None = None,
    ) -> float:
        home_advantage_points = self.config.home_advantage_elo if home_advantage_elo is None else home_advantage_elo
        rating_diff = (home_rating + home_advantage_points) - away_rating
        return float(1.0 / (1.0 + 10.0 ** (-rating_diff / 400.0)))

    def _predict_1x2_with_home_advantage(
        self,
        home_team: str,
        away_team: str,
        home_advantage_elo: float,
    ) -> tuple[float, float, float]:
        home_non_draw_share = self._expected_home_score(
            self._rating(home_team),
            self._rating(away_team),
            home_advantage_elo=home_advantage_elo,
        )
        draw_prob = self.draw_probability
        non_draw_prob = 1.0 - draw_prob
        return self._normalize_probs(
            non_draw_prob * home_non_draw_share,
            draw_prob,
            non_draw_prob * (1.0 - home_non_draw_share),
        )

    def _low_information_lambdas(
        self,
        probs: tuple[float, float, float],
        home_non_draw_share: float,
    ) -> tuple[float, float]:
        draw_prob = probs[1]
        total_goals = float(np.clip(3.05 - 2.25 * draw_prob, 1.45, 2.75))
        home_share = float(np.clip(home_non_draw_share, 0.08, 0.92))
        lambda_home = max(total_goals * home_share, 0.1)
        lambda_away = max(total_goals * (1.0 - home_share), 0.1)
        return lambda_home, lambda_away

    def _build_independent_score_matrix(
        self,
        lambda_home: float,
        lambda_away: float,
    ) -> NDArray[np.float64]:
        goals = np.arange(self.config.max_goals + 1, dtype=np.float64)
        home_pmf = poisson.pmf(goals, max(lambda_home, 0.05))
        away_pmf = poisson.pmf(goals, max(lambda_away, 0.05))
        matrix = np.outer(home_pmf, away_pmf).astype(np.float64)
        total = float(matrix.sum())
        if total > 0.0:
            matrix /= total
        return matrix

    def _calibrate_matrix_to_1x2(
        self,
        matrix: NDArray[np.float64],
        probs: tuple[float, float, float],
    ) -> NDArray[np.float64]:
        calibrated = matrix.copy()
        home_mask = np.tril(np.ones_like(calibrated, dtype=bool), k=-1)
        draw_mask = np.eye(calibrated.shape[0], dtype=bool)
        away_mask = np.triu(np.ones_like(calibrated, dtype=bool), k=1)

        for mask, target in zip((home_mask, draw_mask, away_mask), probs):
            current = float(calibrated[mask].sum())
            if current > 0.0:
                calibrated[mask] *= target / current

        total = float(calibrated.sum())
        if total > 0.0:
            calibrated /= total
        return calibrated

    def _normalize_probs(
        self,
        home_prob: float,
        draw_prob: float,
        away_prob: float,
    ) -> tuple[float, float, float]:
        probs = np.array([home_prob, draw_prob, away_prob], dtype=np.float64)
        probs = np.clip(probs, 1e-12, 1.0)
        probs /= float(probs.sum())
        return float(probs[0]), float(probs[1]), float(probs[2])

    def get_parameters(self) -> dict[str, Any]:
        return {
            "ratings": dict(self.ratings),
            "draw_probability": self.draw_probability,
            "n_matches": self.n_matches,
            "n_draws": self.n_draws,
            **self.config.__dict__,
        }
