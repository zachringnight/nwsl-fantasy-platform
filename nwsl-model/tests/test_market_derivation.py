"""Tests for market derivation: probabilities must sum correctly."""

import numpy as np
import pytest

from src.betting.market_derivation import (
    compute_quarter_line_over_under,
    derive_all_markets,
)
from src.utils.math_utils import poisson_pmf_array


def _make_matrix(lam_h=1.5, lam_a=1.2, max_goals=8):
    matrix = np.outer(
        poisson_pmf_array(max_goals, lam_h),
        poisson_pmf_array(max_goals, lam_a),
    )
    return matrix / matrix.sum()


class TestDeriveAllMarkets:
    def test_1x2_sums_to_one(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        total = markets.home_prob + markets.draw_prob + markets.away_prob
        assert abs(total - 1.0) < 1e-6

    def test_dnb_sums_to_one(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        total = markets.dnb_home_prob + markets.dnb_away_prob
        assert abs(total - 1.0) < 1e-6

    def test_over_under_sum_to_one(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        for line in markets.over_probs:
            total = markets.over_probs[line] + markets.under_probs[line]
            assert abs(total - 1.0) < 1e-4, f"Over/under {line} sum = {total}"

    def test_ah_home_away_sum_to_one(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        for line in markets.ah_home_probs:
            total = markets.ah_home_probs[line] + markets.ah_away_probs[line]
            assert abs(total - 1.0) < 1e-4, f"AH {line} sum = {total}"

    def test_btts_valid_range(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        assert 0 <= markets.btts_yes_prob <= 1
        assert abs(markets.btts_yes_prob + markets.btts_no_prob - 1.0) < 1e-6

    def test_fair_odds_positive(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        assert markets.home_fair_odds > 1.0
        assert markets.draw_fair_odds > 1.0
        assert markets.away_fair_odds > 1.0

    def test_fair_odds_reciprocal(self):
        matrix = _make_matrix()
        markets = derive_all_markets(matrix)
        assert abs(1.0 / markets.home_fair_odds - markets.home_prob) < 1e-6


class TestQuarterLines:
    def test_quarter_line_over_under_sum(self):
        matrix = _make_matrix()
        over, under = compute_quarter_line_over_under(matrix, [2.25, 2.75])
        for line in [2.25, 2.75]:
            total = over[line] + under[line]
            assert abs(total - 1.0) < 1e-4

    def test_quarter_line_between_half_lines(self):
        """Over 2.25 should be between over 2.0 and over 2.5."""
        matrix = _make_matrix()
        from src.betting.score_matrix import derive_over_under
        base_over, _ = derive_over_under(matrix, [2.0, 2.5])
        q_over, _ = compute_quarter_line_over_under(matrix, [2.25])
        assert base_over[2.5] <= q_over[2.25] <= base_over[2.0]
