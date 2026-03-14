"""Model-market probability blending module.

Blends model probabilities with de-vigged market probabilities using a
tunable alpha that can vary by season stage / matches played.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
from numpy.typing import NDArray

from src.features.market_features import devig_multiplicative, devig_power

logger = logging.getLogger("nwsl_model.models.market_blend")


class MarketBlender:
    """Blend model and market probabilities.

    p_final = alpha * p_model + (1 - alpha) * p_market

    Alpha can be a fixed value or scheduled by matches played / season stage.
    """

    def __init__(
        self,
        alpha: float = 0.5,
        alpha_schedule: Optional[list[dict[str, Any]]] = None,
        alpha_schedule_enabled: bool = False,
        devig_method: str = "multiplicative",
    ):
        self.default_alpha = alpha
        self.alpha_schedule = alpha_schedule or []
        self.alpha_schedule_enabled = alpha_schedule_enabled
        self.devig_method = devig_method

    def get_alpha(self, matches_played: int = 999) -> float:
        """Get blending alpha based on matches played."""
        if not self.alpha_schedule_enabled or not self.alpha_schedule:
            return self.default_alpha

        for entry in sorted(self.alpha_schedule, key=lambda x: x["matches_played_lt"]):
            if matches_played < entry["matches_played_lt"]:
                return entry["alpha"]

        return self.default_alpha

    def devig_1x2(
        self, home_odds: float, draw_odds: float, away_odds: float,
    ) -> tuple[float, float, float]:
        """De-vig 1X2 odds to fair probabilities."""
        implied = [1.0 / home_odds, 1.0 / draw_odds, 1.0 / away_odds]
        if self.devig_method == "power":
            fair = devig_power([home_odds, draw_odds, away_odds])
        else:
            fair = devig_multiplicative(implied)
        return tuple(fair)  # type: ignore

    def devig_two_way(
        self, odds_1: float, odds_2: float,
    ) -> tuple[float, float]:
        """De-vig a two-way market (e.g., over/under, AH)."""
        implied = [1.0 / odds_1, 1.0 / odds_2]
        fair = devig_multiplicative(implied)
        return fair[0], fair[1]

    def blend_1x2(
        self,
        model_probs: tuple[float, float, float],
        market_odds: Optional[tuple[float, float, float]],
        matches_played: int = 999,
    ) -> tuple[float, float, float]:
        """Blend model and market 1X2 probabilities.

        Args:
            model_probs: (p_home, p_draw, p_away) from model.
            market_odds: (home_odds, draw_odds, away_odds) decimal odds.
                If None, returns model probs unchanged.
            matches_played: For alpha scheduling.

        Returns:
            Blended (p_home, p_draw, p_away).
        """
        if market_odds is None or any(np.isnan(o) for o in market_odds):
            return model_probs

        alpha = self.get_alpha(matches_played)
        market_probs = self.devig_1x2(*market_odds)

        blended = tuple(
            alpha * mp + (1 - alpha) * mkp
            for mp, mkp in zip(model_probs, market_probs)
        )

        # Renormalize
        total = sum(blended)
        if total > 0:
            blended = tuple(p / total for p in blended)

        return blended  # type: ignore

    def blend_two_way(
        self,
        model_prob: float,
        market_odds: Optional[tuple[float, float]],
        matches_played: int = 999,
    ) -> float:
        """Blend model probability with market for a two-way market.

        Args:
            model_prob: Model probability for outcome 1 (e.g., P(over)).
            market_odds: (odds_1, odds_2) for the two-way market.

        Returns:
            Blended probability for outcome 1.
        """
        if market_odds is None or any(np.isnan(o) for o in market_odds):
            return model_prob

        alpha = self.get_alpha(matches_played)
        market_fair = self.devig_two_way(*market_odds)

        return alpha * model_prob + (1 - alpha) * market_fair[0]

    def blend_score_matrix(
        self,
        model_matrix: NDArray[np.float64],
        market_odds_1x2: Optional[tuple[float, float, float]],
        matches_played: int = 999,
    ) -> NDArray[np.float64]:
        """Adjust a score matrix to match blended 1X2 probabilities.

        Uses iterative proportional fitting (Sinkhorn-like) to adjust the
        matrix margins while preserving the score-level structure.
        """
        if market_odds_1x2 is None:
            return model_matrix

        # Get blended 1X2 targets
        from src.betting.score_matrix import derive_1x2
        model_1x2 = derive_1x2(model_matrix)
        blended_1x2 = self.blend_1x2(model_1x2, market_odds_1x2, matches_played)

        target_h, target_d, target_a = blended_1x2

        # Simple rescaling approach: scale home-win, draw, away-win regions
        matrix = model_matrix.copy()
        n = matrix.shape[0]

        # Identify regions
        current_h = sum(matrix[i, j] for i in range(n) for j in range(n) if i > j)
        current_d = sum(matrix[i, i] for i in range(n))
        current_a = sum(matrix[i, j] for i in range(n) for j in range(n) if i < j)

        for i in range(n):
            for j in range(n):
                if i > j and current_h > 0:
                    matrix[i, j] *= target_h / current_h
                elif i == j and current_d > 0:
                    matrix[i, j] *= target_d / current_d
                elif i < j and current_a > 0:
                    matrix[i, j] *= target_a / current_a

        # Renormalize
        total = matrix.sum()
        if total > 0:
            matrix /= total

        return matrix
