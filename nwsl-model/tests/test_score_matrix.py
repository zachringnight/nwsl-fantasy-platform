"""Tests for score matrix validity and derived probabilities."""

import numpy as np
import pytest

from src.betting.score_matrix import (
    build_full_result,
    derive_1x2,
    derive_asian_handicap,
    derive_btts,
    derive_over_under,
    derive_total_goals_distribution,
    validate_score_matrix,
)
from src.utils.math_utils import bivariate_poisson_matrix, poisson_pmf_array


class TestScoreMatrixValidity:
    """Test that score matrices are valid probability distributions."""

    def _make_poisson_matrix(self, lam_h=1.5, lam_a=1.2, max_goals=8):
        """Create a simple independent Poisson score matrix."""
        n = max_goals + 1
        pmf_h = poisson_pmf_array(max_goals, lam_h)
        pmf_a = poisson_pmf_array(max_goals, lam_a)
        return np.outer(pmf_h, pmf_a)

    def test_poisson_matrix_sums_to_one(self):
        matrix = self._make_poisson_matrix()
        assert abs(matrix.sum() - 1.0) < 0.01

    def test_poisson_matrix_non_negative(self):
        matrix = self._make_poisson_matrix()
        assert np.all(matrix >= 0)

    def test_validate_score_matrix_valid(self):
        matrix = self._make_poisson_matrix()
        matrix /= matrix.sum()
        assert validate_score_matrix(matrix)

    def test_validate_score_matrix_invalid_negative(self):
        matrix = self._make_poisson_matrix()
        matrix[0, 0] = -0.1
        assert not validate_score_matrix(matrix)

    def test_validate_score_matrix_invalid_sum(self):
        matrix = self._make_poisson_matrix()
        matrix *= 2.0
        assert not validate_score_matrix(matrix)

    def test_bivariate_poisson_matrix_valid(self):
        matrix = bivariate_poisson_matrix(1.0, 0.8, 0.2)
        matrix /= matrix.sum()
        assert validate_score_matrix(matrix)
        assert np.all(matrix >= 0)


class TestDerived1X2:
    """Test 1X2 probability derivation."""

    def test_1x2_sums_to_one(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        h, d, a = derive_1x2(matrix)
        assert abs(h + d + a - 1.0) < 1e-6

    def test_1x2_home_heavy(self):
        """Strong home team should have higher home win prob."""
        matrix = np.outer(
            poisson_pmf_array(8, 3.0),
            poisson_pmf_array(8, 0.5),
        )
        matrix /= matrix.sum()
        h, d, a = derive_1x2(matrix)
        assert h > a
        assert h > d

    def test_1x2_symmetric(self):
        """Equal teams should have roughly equal home/away probs."""
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.5),
        )
        matrix /= matrix.sum()
        h, d, a = derive_1x2(matrix)
        assert abs(h - a) < 0.01


class TestDerivedTotals:
    """Test over/under probability derivation."""

    def test_over_under_sum_to_one(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        over, under = derive_over_under(matrix, [2.5])
        assert abs(over[2.5] + under[2.5] - 1.0) < 1e-6

    def test_over_under_multiple_lines(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        over, under = derive_over_under(matrix, [0.5, 1.5, 2.5, 3.5, 4.5])

        for line in [0.5, 1.5, 2.5, 3.5, 4.5]:
            assert abs(over[line] + under[line] - 1.0) < 1e-6

        # Higher lines should have lower over probability
        assert over[0.5] > over[1.5] > over[2.5] > over[3.5]

    def test_total_goals_distribution_sums_to_one(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        total_probs = derive_total_goals_distribution(matrix)
        assert abs(sum(total_probs.values()) - 1.0) < 1e-6


class TestDerivedBTTS:
    """Test BTTS derivation."""

    def test_btts_range(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        btts = derive_btts(matrix)
        assert 0 <= btts <= 1

    def test_btts_low_scoring(self):
        """Low scoring game should have lower BTTS."""
        matrix_low = np.outer(
            poisson_pmf_array(8, 0.5),
            poisson_pmf_array(8, 0.5),
        )
        matrix_low /= matrix_low.sum()

        matrix_high = np.outer(
            poisson_pmf_array(8, 2.0),
            poisson_pmf_array(8, 2.0),
        )
        matrix_high /= matrix_high.sum()

        assert derive_btts(matrix_low) < derive_btts(matrix_high)


class TestAsianHandicap:
    """Test Asian handicap derivation."""

    def test_ah_probs_sum_to_one(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        home_p, away_p = derive_asian_handicap(matrix, [0.0, -0.5, 0.5])

        for line in [0.0, -0.5, 0.5]:
            assert abs(home_p[line] + away_p[line] - 1.0) < 1e-6

    def test_ah_half_line_no_push(self):
        """Half-line handicaps should never have a push."""
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        home_p, away_p = derive_asian_handicap(matrix, [-0.5, 0.5])

        for line in [-0.5, 0.5]:
            # With half lines, probs should sum to exactly 1
            assert abs(home_p[line] + away_p[line] - 1.0) < 1e-10


class TestBuildFullResult:
    """Test the full result builder."""

    def test_build_full_result(self):
        matrix = np.outer(
            poisson_pmf_array(8, 1.5),
            poisson_pmf_array(8, 1.2),
        )
        matrix /= matrix.sum()
        result = build_full_result(matrix)

        assert abs(result.home_win_prob + result.draw_prob + result.away_win_prob - 1.0) < 1e-6
        assert 0 <= result.btts_prob <= 1
        assert result.max_goals == 8
