"""Tests for expanding-window splitter and leakage checks."""

from datetime import date

import pandas as pd
import pytest

from src.backtest.splitter import ExpandingWindowSplitter


def _make_matches(n=100):
    """Create a simple matches DataFrame for testing."""
    dates = pd.date_range("2023-01-01", periods=n, freq="3D")
    teams = ["Team_A", "Team_B", "Team_C", "Team_D", "Team_E", "Team_F"]
    records = []
    for i, d in enumerate(dates):
        h = teams[i % len(teams)]
        a = teams[(i + 1) % len(teams)]
        records.append({
            "match_id": f"M{i:04d}",
            "match_date": d.date(),
            "season": d.year,
            "home_team": h,
            "away_team": a,
            "home_goals_90": i % 3,
            "away_goals_90": (i + 1) % 3,
        })
    return pd.DataFrame(records)


class TestExpandingWindowSplitter:
    def test_basic_split(self):
        matches = _make_matches(100)
        splitter = ExpandingWindowSplitter(min_train_matches=50, step_size=1)
        folds = list(splitter.split(matches))
        assert len(folds) == 50  # 100 - 50

    def test_no_leakage(self):
        """Every fold must have train dates strictly <= test dates."""
        matches = _make_matches(100)
        splitter = ExpandingWindowSplitter(min_train_matches=30, step_size=1)

        for fold in splitter.split(matches):
            assert splitter.validate_no_leakage(fold)
            train_max = fold.train_matches["match_date"].max()
            test_min = fold.test_matches["match_date"].min()
            assert train_max <= test_min

    def test_expanding_window(self):
        """Training set should grow with each fold."""
        matches = _make_matches(60)
        splitter = ExpandingWindowSplitter(min_train_matches=20, step_size=1)
        folds = list(splitter.split(matches))

        for i in range(1, len(folds)):
            assert len(folds[i].train_matches) > len(folds[i - 1].train_matches)

    def test_step_size_larger(self):
        matches = _make_matches(100)
        splitter = ExpandingWindowSplitter(min_train_matches=50, step_size=5)
        folds = list(splitter.split(matches))
        # Each fold tests 5 matches, so 50 remaining / 5 = 10 folds
        assert len(folds) == 10

    def test_too_few_matches(self):
        matches = _make_matches(10)
        splitter = ExpandingWindowSplitter(min_train_matches=50, step_size=1)
        folds = list(splitter.split(matches))
        assert len(folds) == 0

    def test_all_matches_covered(self):
        """Every match should appear in exactly one test set."""
        matches = _make_matches(60)
        splitter = ExpandingWindowSplitter(min_train_matches=30, step_size=1)
        folds = list(splitter.split(matches))

        test_ids = set()
        for fold in folds:
            fold_ids = set(fold.test_matches["match_id"])
            assert len(fold_ids & test_ids) == 0  # No overlap
            test_ids |= fold_ids

        # All matches after the first 30 should be tested
        all_ids = set(matches["match_id"])
        train_only = set(matches.iloc[:30]["match_id"])
        assert test_ids == all_ids - train_only
