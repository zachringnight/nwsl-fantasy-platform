"""Calibrated market-line totals model.

Fits a binary classifier for P(total_goals > main_total_line) that takes the
market line, model lambdas, the model's own raw over-probability, and the
no-vig market probability (when available) as inputs. Evaluated chronologically
via an expanding walk-forward split; never auto-promoted (see
scripts/evaluate_totals_model.py and packet 09 of the model-lab plan).
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.features.market_features import devig_multiplicative

logger = logging.getLogger("nwsl_model.models.totals_market_model")

_LOGIT_EPS = 1e-4
_FEATURE_COLUMNS = (
    "line",
    "total_lambda",
    "lambda_minus_line",
    "base_logit",
    "market_logit",
    "has_market",
)


def _logit(probability: pd.Series) -> pd.Series:
    clipped = probability.astype(float).clip(_LOGIT_EPS, 1.0 - _LOGIT_EPS)
    return np.log(clipped / (1.0 - clipped))


def _market_prob_over(row: pd.Series) -> float:
    over_price = row.get("main_total_over_market_odds")
    under_price = row.get("main_total_under_market_odds")
    if pd.isna(over_price) or pd.isna(under_price):
        return float("nan")
    over_price = float(over_price)
    under_price = float(under_price)
    if over_price <= 1.0 or under_price <= 1.0:
        return float("nan")
    fair = devig_multiplicative([1.0 / over_price, 1.0 / under_price])
    return float(fair[0])


class TotalsMarketModel:
    """Binary calibrated model for P(over main total line)."""

    def __init__(self, *, regularization_c: float = 1.0, min_train_matches: int = 60):
        self.regularization_c = regularization_c
        self.min_train_matches = min_train_matches
        self.fitted_ = False
        self.model_: LogisticRegression | None = None

    @staticmethod
    def _usable_mask(frame: pd.DataFrame) -> pd.Series:
        required = ["main_total_line", "total_goals", "lambda_home", "lambda_away"]
        for column in required:
            if column not in frame.columns:
                return pd.Series(False, index=frame.index)
        mask = (
            frame["main_total_line"].notna()
            & frame["total_goals"].notna()
            & frame["lambda_home"].notna()
            & frame["lambda_away"].notna()
        )
        mask &= frame["total_goals"] != frame["main_total_line"]
        return mask

    @staticmethod
    def _feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
        line = frame["main_total_line"].astype(float)
        total_lambda = frame["lambda_home"].astype(float) + frame["lambda_away"].astype(float)
        base_prob = frame.get("prob_over_main_total")
        if base_prob is None:
            base_prob = pd.Series(np.nan, index=frame.index)
        base_logit = _logit(base_prob.reindex(frame.index))
        market_prob = frame.apply(_market_prob_over, axis=1)
        has_market = market_prob.notna().astype(float)
        market_logit = _logit(market_prob.fillna(0.5))
        return pd.DataFrame(
            {
                "line": line,
                "total_lambda": total_lambda,
                "lambda_minus_line": total_lambda - line,
                "base_logit": base_logit,
                "market_logit": market_logit,
                "has_market": has_market,
            },
            index=frame.index,
        )

    def fit(self, frame: pd.DataFrame) -> "TotalsMarketModel":
        self.fitted_ = False
        self.model_ = None

        mask = self._usable_mask(frame)
        usable = frame.loc[mask]
        if len(usable) < self.min_train_matches:
            return self

        features = self._feature_frame(usable)
        target = (usable["total_goals"].astype(float) > usable["main_total_line"].astype(float)).astype(int)
        valid = features.notna().all(axis=1)
        features = features.loc[valid]
        target = target.loc[valid]
        if len(features) < self.min_train_matches or target.nunique() < 2:
            return self

        model = LogisticRegression(C=self.regularization_c, max_iter=1000)
        model.fit(features[list(_FEATURE_COLUMNS)].to_numpy(), target.to_numpy())
        self.model_ = model
        self.fitted_ = True
        return self

    def predict_prob_over(self, frame: pd.DataFrame) -> pd.Series:
        result = pd.Series(np.nan, index=frame.index, dtype=float)
        if "main_total_line" not in frame.columns:
            return result
        has_line = frame["main_total_line"].notna()
        if not has_line.any():
            return result

        base_prob = frame.get("prob_over_main_total")
        if base_prob is None:
            base_prob = pd.Series(np.nan, index=frame.index)

        if not self.fitted_ or self.model_ is None:
            result.loc[has_line] = base_prob.reindex(frame.index).loc[has_line].astype(float)
            return result

        candidates = frame.loc[has_line]
        features = self._feature_frame(candidates)
        valid_rows = features.notna().all(axis=1)
        valid_index = features.index[valid_rows]
        if len(valid_index) > 0:
            probs = self.model_.predict_proba(
                features.loc[valid_index, list(_FEATURE_COLUMNS)].to_numpy()
            )[:, 1]
            result.loc[valid_index] = probs

        fallback_index = candidates.index.difference(valid_index)
        if len(fallback_index) > 0:
            result.loc[fallback_index] = base_prob.reindex(frame.index).loc[fallback_index].astype(float)

        return result

    def walk_forward_evaluate(self, frame: pd.DataFrame, *, block: str = "match_date") -> pd.DataFrame:
        mask = self._usable_mask(frame)
        usable = frame.loc[mask].copy()
        columns = ["match_id", "match_date", "prob_model", "prob_base", "prob_market", "outcome"]
        if usable.empty or block not in usable.columns:
            return pd.DataFrame(columns=columns)

        usable = usable.sort_values(block, kind="mergesort")
        dates = usable[block].drop_duplicates().tolist()

        records: list[dict[str, Any]] = []
        for current_date in dates:
            train_frame = usable.loc[usable[block] < current_date]
            test_frame = usable.loc[usable[block] == current_date]

            fold_model = TotalsMarketModel(
                regularization_c=self.regularization_c,
                min_train_matches=self.min_train_matches,
            )
            fold_model.fit(train_frame)
            model_probs = fold_model.predict_prob_over(test_frame)

            for idx, row in test_frame.iterrows():
                prob_base = row.get("prob_over_main_total")
                records.append(
                    {
                        "match_id": row.get("match_id"),
                        "match_date": row[block],
                        "prob_model": model_probs.loc[idx],
                        "prob_base": float(prob_base) if pd.notna(prob_base) else float("nan"),
                        "prob_market": _market_prob_over(row),
                        "outcome": int(float(row["total_goals"]) > float(row["main_total_line"])),
                    }
                )

        return pd.DataFrame.from_records(records, columns=columns)
