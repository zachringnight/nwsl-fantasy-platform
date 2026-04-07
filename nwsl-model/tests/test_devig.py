"""Tests for de-vig math and market probability computation."""

import numpy as np
import pytest

from src.features.market_features import devig_multiplicative, devig_power


class TestDevigMultiplicative:
    """Test multiplicative de-vig method."""

    def test_fair_odds_unchanged(self):
        """Fair odds (no overround) should be unchanged."""
        probs = [0.5, 0.3, 0.2]
        result = devig_multiplicative(probs)
        assert abs(sum(result) - 1.0) < 1e-10
        for r, p in zip(result, probs):
            assert abs(r - p) < 1e-10

    def test_removes_overround(self):
        """Vigged probabilities should sum to 1 after de-vig."""
        implied = [1 / 1.8, 1 / 3.5, 1 / 4.5]  # Sum > 1
        result = devig_multiplicative(implied)
        assert abs(sum(result) - 1.0) < 1e-10
        assert all(r > 0 for r in result)

    def test_proportional_scaling(self):
        """Ratios should be preserved."""
        implied = [0.5, 0.3, 0.3]  # sum = 1.1
        result = devig_multiplicative(implied)
        # Check ratios preserved
        assert abs(result[0] / result[1] - 0.5 / 0.3) < 1e-10

    def test_typical_nwsl_odds(self):
        """Test with typical NWSL-range odds."""
        # Home 2.10, Draw 3.30, Away 3.60
        implied = [1 / 2.10, 1 / 3.30, 1 / 3.60]
        result = devig_multiplicative(implied)
        assert abs(sum(result) - 1.0) < 1e-10
        assert result[0] > result[1]  # Home should be favorite
        assert result[0] > result[2]


class TestDevigPower:
    """Test power method de-vig."""

    def test_sums_to_one(self):
        odds = [1.8, 3.5, 4.5]
        result = devig_power(odds)
        assert abs(sum(result) - 1.0) < 0.01

    def test_reasonable_probabilities(self):
        odds = [2.10, 3.30, 3.60]
        result = devig_power(odds)
        assert all(0 < r < 1 for r in result)
        assert result[0] > result[1]  # Home should be favorite

    def test_two_way_market(self):
        odds = [1.85, 2.05]
        result = devig_power(odds)
        assert abs(sum(result) - 1.0) < 0.01
