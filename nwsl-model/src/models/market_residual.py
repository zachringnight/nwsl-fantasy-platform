"""Market-residual layer: a fitted correction for model-vs-market disagreement.

Learns, from historical training folds only, whether the base model's
disagreement with the no-vig market price has historically carried signal.
Falls back cleanly to the base model's raw prediction whenever no-vig market
probabilities are unavailable or the classifier has not seen enough training
rows to fit.

This is a research candidate only. It settles bets at close odds using close
odds as an input feature, which is a legitimate close-time betting strategy
(the residual layer never sees test-fold rows during fit), but it makes
CLV-vs-close a degenerate (always ~0) metric by construction -- callers
should treat `metadata["clv_vs_close_degenerate"]` as an honesty flag, not a
bug.
"""

from __future__ import annotations

import math
from typing import Any, Protocol

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from sklearn.linear_model import LogisticRegression

from src.models.base import PredictionResult

_CLASS_HOME = 0
_CLASS_DRAW = 1
_CLASS_AWAY = 2
_PROB_EPS = 1e-4


class _ScoreMatrixModel(Protocol):
    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: float | None = None,
        contextual_features: dict[str, float] | None = None,
    ) -> PredictionResult: ...


def _clip_prob(value: float) -> float:
    return float(np.clip(float(value), _PROB_EPS, 1.0 - _PROB_EPS))


def _logit(value: float) -> float:
    p = _clip_prob(value)
    return float(math.log(p / (1.0 - p)))


def _feature_vector(
    market_probs: tuple[float, float, float],
    base_probs: tuple[float, float, float],
) -> list[float]:
    p_mkt_home, p_mkt_draw, p_mkt_away = (_clip_prob(p) for p in market_probs)
    p_base_home, p_base_draw, p_base_away = (_clip_prob(p) for p in base_probs)
    return [
        _logit(p_mkt_home),
        _logit(p_mkt_draw),
        _logit(p_mkt_away),
        p_base_home - p_mkt_home,
        p_base_draw - p_mkt_draw,
        p_base_away - p_mkt_away,
    ]


def _rescale_matrix_to_targets(
    matrix: NDArray[np.float64],
    p_home: float,
    p_draw: float,
    p_away: float,
) -> NDArray[np.float64]:
    """Rescale the H/D/A triangular regions of a score matrix to target masses.

    Each region (strictly-lower = home win, diagonal = draw, strictly-upper
    = away win) is scaled independently to hit its target probability mass,
    preserving the base model's relative shape within each region. If a
    region happens to carry zero mass in the base matrix, its target mass is
    spread uniformly across the region's cells instead. The result is
    renormalized to guard against floating-point drift.
    """
    matrix = np.asarray(matrix, dtype=np.float64)
    n = matrix.shape[0]
    lower_mask = np.tril(np.ones((n, n)), -1) > 0
    diag_mask = np.eye(n, dtype=bool)
    upper_mask = np.triu(np.ones((n, n)), 1) > 0

    scaled = np.zeros_like(matrix)
    for mask, target in ((lower_mask, p_home), (diag_mask, p_draw), (upper_mask, p_away)):
        region = matrix * mask
        region_sum = float(region.sum())
        if region_sum > 0:
            scaled += region * (target / region_sum)
        else:
            count = int(mask.sum())
            if count > 0:
                scaled += mask.astype(np.float64) * (target / count)

    total = float(scaled.sum())
    if total > 0:
        scaled /= total
    return scaled


class MarketResidualModel:
    """Fitted logistic correction on model-vs-no-vig-market disagreement."""

    def __init__(
        self,
        base_model: _ScoreMatrixModel,
        *,
        regularization_c: float = 1.0,
        min_train_matches: int = 60,
        max_goals: int = 8,
    ) -> None:
        self.base_model = base_model
        self.regularization_c = float(regularization_c)
        self.min_train_matches = int(min_train_matches)
        self.max_goals = int(max_goals)
        self.fitted_: bool = False
        self.classifier_: LogisticRegression | None = None
        self.n_train_rows_: int = 0

    def fit(self, train_matches: pd.DataFrame, context_provider: Any) -> "MarketResidualModel":
        features: list[list[float]] = []
        targets: list[int] = []

        for _, row in train_matches.iterrows():
            mkt_home = row.get("mkt_prob_home")
            mkt_draw = row.get("mkt_prob_draw")
            mkt_away = row.get("mkt_prob_away")
            if pd.isna(mkt_home) or pd.isna(mkt_draw) or pd.isna(mkt_away):
                continue

            home_goals = row.get("home_goals_90")
            away_goals = row.get("away_goals_90")
            if pd.isna(home_goals) or pd.isna(away_goals):
                continue

            contextual_features = context_provider.for_match(
                home_team=row["home_team"],
                away_team=row["away_team"],
                match_date=row.get("match_date"),
                match_id=str(row.get("match_id", "")),
            )
            base_pred = self.base_model.predict_score_matrix(
                home_team=row["home_team"],
                away_team=row["away_team"],
                contextual_features=contextual_features,
            )
            base_probs = (base_pred.home_win_prob, base_pred.draw_prob, base_pred.away_win_prob)
            market_probs = (float(mkt_home), float(mkt_draw), float(mkt_away))
            features.append(_feature_vector(market_probs, base_probs))

            if float(home_goals) > float(away_goals):
                targets.append(_CLASS_HOME)
            elif float(home_goals) == float(away_goals):
                targets.append(_CLASS_DRAW)
            else:
                targets.append(_CLASS_AWAY)

        self.n_train_rows_ = len(features)
        if len(features) < self.min_train_matches or len(set(targets)) < 2:
            self.fitted_ = False
            self.classifier_ = None
            return self

        x = np.asarray(features, dtype=np.float64)
        y = np.asarray(targets, dtype=np.int64)
        classifier = LogisticRegression(C=self.regularization_c, max_iter=1000)
        classifier.fit(x, y)
        self.classifier_ = classifier
        self.fitted_ = True
        return self

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        *,
        market_probs: tuple[float, float, float] | None = None,
        contextual_features: dict[str, float] | None = None,
    ) -> PredictionResult:
        base_pred = self.base_model.predict_score_matrix(
            home_team=home_team,
            away_team=away_team,
            contextual_features=contextual_features,
        )

        usable_market_probs = (
            market_probs is not None
            and len(market_probs) == 3
            and all(value is not None and math.isfinite(float(value)) for value in market_probs)
        )
        if not self.fitted_ or self.classifier_ is None or not usable_market_probs:
            return PredictionResult(
                match_id=base_pred.match_id,
                home_team=base_pred.home_team,
                away_team=base_pred.away_team,
                lambda_home=base_pred.lambda_home,
                lambda_away=base_pred.lambda_away,
                score_matrix=base_pred.score_matrix,
                home_win_prob=base_pred.home_win_prob,
                draw_prob=base_pred.draw_prob,
                away_win_prob=base_pred.away_win_prob,
                metadata={"model": "market_residual", "base": "spi_lite_baseline", "fallback": True},
            )

        base_probs = (base_pred.home_win_prob, base_pred.draw_prob, base_pred.away_win_prob)
        market_probs_typed = (float(market_probs[0]), float(market_probs[1]), float(market_probs[2]))
        feature_vec = _feature_vector(market_probs_typed, base_probs)
        proba = self.classifier_.predict_proba(np.asarray([feature_vec], dtype=np.float64))[0]
        class_probs = dict(zip(self.classifier_.classes_, proba))
        p_home = float(class_probs.get(_CLASS_HOME, 0.0))
        p_draw = float(class_probs.get(_CLASS_DRAW, 0.0))
        p_away = float(class_probs.get(_CLASS_AWAY, 0.0))
        total = p_home + p_draw + p_away
        if total > 0:
            p_home, p_draw, p_away = p_home / total, p_draw / total, p_away / total
        else:
            p_home = p_draw = p_away = 1.0 / 3.0

        matrix = _rescale_matrix_to_targets(base_pred.score_matrix, p_home, p_draw, p_away)

        return PredictionResult(
            match_id=base_pred.match_id,
            home_team=home_team,
            away_team=away_team,
            lambda_home=base_pred.lambda_home,
            lambda_away=base_pred.lambda_away,
            score_matrix=matrix,
            home_win_prob=p_home,
            draw_prob=p_draw,
            away_win_prob=p_away,
            metadata={
                "model": "market_residual",
                "base": "spi_lite_baseline",
                "fallback": False,
                "clv_vs_close_degenerate": True,
            },
        )
