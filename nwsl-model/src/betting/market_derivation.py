"""Derive betting market prices from score matrix probabilities.

Handles 1X2, draw no bet, Asian handicaps (including quarter lines),
totals (including quarter lines), and BTTS.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from numpy.typing import NDArray

from src.betting.score_matrix import (
    derive_1x2,
    derive_asian_handicap,
    derive_btts,
    derive_over_under,
    derive_total_goals_distribution,
)
from src.utils.math_utils import decimal_from_probability


@dataclass
class MarketPrices:
    """All derived market prices for a single match."""
    match_id: str = ""

    # 1X2
    home_prob: float = 0.0
    draw_prob: float = 0.0
    away_prob: float = 0.0
    home_fair_odds: float = 0.0
    draw_fair_odds: float = 0.0
    away_fair_odds: float = 0.0

    # Draw no bet
    dnb_home_prob: float = 0.0
    dnb_away_prob: float = 0.0
    dnb_home_fair_odds: float = 0.0
    dnb_away_fair_odds: float = 0.0

    # Asian handicap
    ah_home_probs: dict[float, float] = field(default_factory=dict)
    ah_away_probs: dict[float, float] = field(default_factory=dict)
    ah_home_fair_odds: dict[float, float] = field(default_factory=dict)
    ah_away_fair_odds: dict[float, float] = field(default_factory=dict)

    # Totals
    over_probs: dict[float, float] = field(default_factory=dict)
    under_probs: dict[float, float] = field(default_factory=dict)
    over_fair_odds: dict[float, float] = field(default_factory=dict)
    under_fair_odds: dict[float, float] = field(default_factory=dict)

    # BTTS
    btts_yes_prob: float = 0.0
    btts_no_prob: float = 0.0
    btts_yes_fair_odds: float = 0.0
    btts_no_fair_odds: float = 0.0


def compute_quarter_line_over_under(
    matrix: NDArray[np.float64],
    quarter_lines: list[float] | None = None,
) -> tuple[dict[float, float], dict[float, float]]:
    """Compute over/under for quarter lines (e.g., 2.25, 2.75).

    Quarter-line logic:
        Over 2.25 = 50% stake on Over 2.0 + 50% stake on Over 2.5
        Over 2.75 = 50% stake on Over 2.5 + 50% stake on Over 3.0
    For pricing, the probability is the average of the two component probabilities.
    """
    if quarter_lines is None:
        quarter_lines = [1.75, 2.25, 2.75, 3.25, 3.75, 4.25]

    # Get half-line and whole-line probabilities
    all_lines = set()
    for ql in quarter_lines:
        lo = np.floor(ql * 2) / 2.0
        hi = np.ceil(ql * 2) / 2.0
        all_lines.add(lo)
        all_lines.add(hi)

    base_over, base_under = derive_over_under(matrix, sorted(all_lines))

    over_probs = {}
    under_probs = {}

    for ql in quarter_lines:
        lo = np.floor(ql * 2) / 2.0
        hi = np.ceil(ql * 2) / 2.0
        over_probs[ql] = 0.5 * base_over.get(lo, 0) + 0.5 * base_over.get(hi, 0)
        under_probs[ql] = 0.5 * base_under.get(lo, 0) + 0.5 * base_under.get(hi, 0)

    return over_probs, under_probs


def derive_all_markets(
    matrix: NDArray[np.float64],
    match_id: str = "",
    handicap_lines: list[float] | None = None,
    total_lines: list[float] | None = None,
) -> MarketPrices:
    """Derive all betting markets from a score matrix.

    Args:
        matrix: Joint score probability matrix (max_goals+1 x max_goals+1).
        match_id: Match identifier.
        handicap_lines: Asian handicap lines to compute.
        total_lines: Total lines to compute (half + quarter).
    """
    if handicap_lines is None:
        handicap_lines = [-1.5, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.5]
    if total_lines is None:
        total_lines = [1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0, 4.25, 4.5]

    prices = MarketPrices(match_id=match_id)

    # 1X2
    h, d, a = derive_1x2(matrix)
    prices.home_prob = h
    prices.draw_prob = d
    prices.away_prob = a
    prices.home_fair_odds = decimal_from_probability(h)
    prices.draw_fair_odds = decimal_from_probability(d)
    prices.away_fair_odds = decimal_from_probability(a)

    # Draw no bet
    if h + a > 0:
        prices.dnb_home_prob = h / (h + a)
        prices.dnb_away_prob = a / (h + a)
    else:
        prices.dnb_home_prob = 0.5
        prices.dnb_away_prob = 0.5
    prices.dnb_home_fair_odds = decimal_from_probability(prices.dnb_home_prob)
    prices.dnb_away_fair_odds = decimal_from_probability(prices.dnb_away_prob)

    # Separate half/whole lines from quarter lines for totals
    half_whole_lines = [l for l in total_lines if abs(l * 4 - round(l * 4)) < 1e-10
                        and abs(l * 2 - round(l * 2)) < 1e-10]
    quarter_lines = [l for l in total_lines if abs(l * 2 - round(l * 2)) > 1e-10]

    # Half/whole line totals
    over_hw, under_hw = derive_over_under(matrix, half_whole_lines)

    # Quarter line totals
    over_q, under_q = compute_quarter_line_over_under(matrix, quarter_lines)

    prices.over_probs = {**over_hw, **over_q}
    prices.under_probs = {**under_hw, **under_q}
    prices.over_fair_odds = {
        k: decimal_from_probability(v) for k, v in prices.over_probs.items()
    }
    prices.under_fair_odds = {
        k: decimal_from_probability(v) for k, v in prices.under_probs.items()
    }

    # Asian handicap
    ah_home, ah_away = derive_asian_handicap(matrix, handicap_lines)
    prices.ah_home_probs = ah_home
    prices.ah_away_probs = ah_away
    prices.ah_home_fair_odds = {
        k: decimal_from_probability(v) for k, v in ah_home.items()
    }
    prices.ah_away_fair_odds = {
        k: decimal_from_probability(v) for k, v in ah_away.items()
    }

    # BTTS
    btts = derive_btts(matrix)
    prices.btts_yes_prob = btts
    prices.btts_no_prob = 1.0 - btts
    prices.btts_yes_fair_odds = decimal_from_probability(btts)
    prices.btts_no_fair_odds = decimal_from_probability(1.0 - btts)

    return prices
