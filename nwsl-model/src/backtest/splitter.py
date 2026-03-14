"""Time-based expanding window splitter for backtesting.

No random splits allowed. Each fold trains on all prior data
and predicts only future matches.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Iterator

import pandas as pd

logger = logging.getLogger("nwsl_model.backtest.splitter")


@dataclass
class BacktestFold:
    """A single fold in the expanding-window backtest."""
    fold_id: int
    train_matches: pd.DataFrame
    test_matches: pd.DataFrame
    train_end_date: date
    test_start_date: date
    test_end_date: date


class ExpandingWindowSplitter:
    """Expanding-window time splitter for backtesting.

    Rules:
    - Splits by date only (no random component).
    - Each fold trains on all matches before a cutoff date.
    - Each fold predicts matches in the next window.
    - No future information leaks into training data.
    """

    def __init__(
        self,
        min_train_matches: int = 50,
        step_size: int = 1,
    ):
        self.min_train_matches = min_train_matches
        self.step_size = step_size

    def split(self, matches: pd.DataFrame) -> Iterator[BacktestFold]:
        """Generate expanding-window folds.

        Args:
            matches: DataFrame sorted by match_date with match_date column.

        Yields:
            BacktestFold objects.
        """
        df = matches.sort_values("match_date").reset_index(drop=True)

        if len(df) < self.min_train_matches + 1:
            logger.warning(
                f"Not enough matches ({len(df)}) for backtesting "
                f"(min_train={self.min_train_matches})"
            )
            return

        fold_id = 0
        test_start_idx = self.min_train_matches

        while test_start_idx < len(df):
            test_end_idx = min(test_start_idx + self.step_size, len(df))

            train = df.iloc[:test_start_idx].copy()
            test = df.iloc[test_start_idx:test_end_idx].copy()

            # Verify no leakage: all train dates < all test dates
            train_max_date = train["match_date"].max()
            test_min_date = test["match_date"].min()

            if train_max_date > test_min_date:
                logger.warning(
                    f"Potential leakage in fold {fold_id}: "
                    f"train_max={train_max_date} > test_min={test_min_date}"
                )

            yield BacktestFold(
                fold_id=fold_id,
                train_matches=train,
                test_matches=test,
                train_end_date=train_max_date,
                test_start_date=test_min_date,
                test_end_date=test["match_date"].max(),
            )

            fold_id += 1
            test_start_idx += self.step_size

        logger.info(f"Generated {fold_id} backtest folds")

    def validate_no_leakage(self, fold: BacktestFold) -> bool:
        """Verify no information leakage in a fold."""
        train_max = fold.train_matches["match_date"].max()
        test_min = fold.test_matches["match_date"].min()
        return train_max <= test_min
