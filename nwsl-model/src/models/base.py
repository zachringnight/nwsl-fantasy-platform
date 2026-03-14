"""Base model interface for score prediction models."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray


@dataclass
class ModelConfig:
    """Configuration for a score prediction model."""
    max_goals: int = 8
    random_seed: int = 42
    home_advantage_init: float = 0.25
    max_iter: int = 2000
    tol: float = 1e-8


@dataclass
class FitResult:
    """Result of fitting a model."""
    converged: bool
    n_matches: int
    n_teams: int
    log_likelihood: float
    parameters: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass
class PredictionResult:
    """Result of predicting a single match."""
    match_id: str
    home_team: str
    away_team: str
    lambda_home: float
    lambda_away: float
    score_matrix: NDArray[np.float64]
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseScoreModel(ABC):
    """Abstract base class for joint score prediction models."""

    def __init__(self, config: ModelConfig):
        self.config = config
        self._fitted = False
        self._team_map: dict[str, int] = {}
        self._n_teams: int = 0

    @property
    def is_fitted(self) -> bool:
        return self._fitted

    @abstractmethod
    def fit(
        self,
        matches: pd.DataFrame,
        weights: Optional[NDArray[np.float64]] = None,
    ) -> FitResult:
        """Fit the model on historical match data.

        Args:
            matches: DataFrame with at minimum home_team, away_team,
                     home_goals_90, away_goals_90 columns.
            weights: Optional per-match weights (e.g., recency decay).
        """
        ...

    @abstractmethod
    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: Optional[float] = None,
        contextual_features: Optional[dict[str, float]] = None,
    ) -> PredictionResult:
        """Predict the joint score distribution for a match.

        Returns a PredictionResult with the full (max_goals+1 x max_goals+1) matrix.
        """
        ...

    def predict_batch(
        self,
        matches: pd.DataFrame,
        contextual_features: Optional[pd.DataFrame] = None,
    ) -> list[PredictionResult]:
        """Predict score matrices for a batch of matches."""
        results = []
        for idx, row in matches.iterrows():
            ctx = None
            if contextual_features is not None:
                ctx = contextual_features.loc[idx].to_dict() if idx in contextual_features.index else None
            pred = self.predict_score_matrix(
                home_team=row["home_team"],
                away_team=row["away_team"],
                contextual_features=ctx,
            )
            pred.match_id = str(row.get("match_id", idx))
            results.append(pred)
        return results

    def _ensure_fitted(self) -> None:
        if not self._fitted:
            raise RuntimeError("Model must be fitted before prediction.")

    def _get_team_index(self, team: str) -> int:
        """Get team index, returning league-average index for unknown teams."""
        if team in self._team_map:
            return self._team_map[team]
        # Unknown team: return -1 to signal league average
        return -1

    def get_parameters(self) -> dict[str, Any]:
        """Return model parameters as a dictionary."""
        return {}
