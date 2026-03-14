"""Score matrix utilities and derived probabilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray


@dataclass
class ScoreMatrixResult:
    """Container for a score matrix and derived probabilities."""
    matrix: NDArray[np.float64]
    max_goals: int
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    btts_prob: float
    total_goals_probs: dict[float, float]  # {n_goals: P(total=n)}
    over_probs: dict[float, float]  # {line: P(over)}
    under_probs: dict[float, float]  # {line: P(under)}


def validate_score_matrix(matrix: NDArray[np.float64], tol: float = 0.01) -> bool:
    """Check that a score matrix is valid: non-negative and sums to ~1."""
    if np.any(matrix < -1e-10):
        return False
    total = matrix.sum()
    return abs(total - 1.0) < tol


def derive_1x2(matrix: NDArray[np.float64]) -> tuple[float, float, float]:
    """Derive home/draw/away probabilities from score matrix."""
    home_win = float(np.sum(np.tril(matrix, -1)))  # home_goals > away_goals
    draw = float(np.sum(np.diag(matrix)))
    away_win = float(np.sum(np.triu(matrix, 1)))  # away_goals > home_goals
    return home_win, draw, away_win


def derive_btts(matrix: NDArray[np.float64]) -> float:
    """Both teams to score probability."""
    # P(home>=1 AND away>=1)
    return float(matrix[1:, 1:].sum())


def derive_total_goals_distribution(
    matrix: NDArray[np.float64],
) -> dict[int, float]:
    """Compute P(total_goals = k) for each k."""
    n = matrix.shape[0]
    total_probs = {}
    for total in range(2 * (n - 1) + 1):
        prob = 0.0
        for i in range(min(total + 1, n)):
            j = total - i
            if 0 <= j < n:
                prob += matrix[i, j]
        total_probs[total] = prob
    return total_probs


def derive_over_under(
    matrix: NDArray[np.float64],
    lines: list[float] | None = None,
) -> tuple[dict[float, float], dict[float, float]]:
    """Compute over/under probabilities for given total lines.

    Handles whole lines and half lines directly.
    Quarter lines are handled separately in market_derivation.
    """
    if lines is None:
        lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]

    total_probs = derive_total_goals_distribution(matrix)

    over_probs = {}
    under_probs = {}

    for line in lines:
        p_over = 0.0
        p_under = 0.0

        for total, prob in total_probs.items():
            if total > line:
                p_over += prob
            elif total < line:
                p_under += prob
            else:
                # Exact hit on whole number line = push (split evenly for pricing)
                p_over += prob * 0.5
                p_under += prob * 0.5

        over_probs[line] = p_over
        under_probs[line] = p_under

    return over_probs, under_probs


def derive_asian_handicap(
    matrix: NDArray[np.float64],
    lines: list[float] | None = None,
) -> tuple[dict[float, float], dict[float, float]]:
    """Compute Asian handicap probabilities for home and away.

    line = handicap applied to home team.
    E.g., line=-0.5 means home -0.5 (home must win by 1+).

    Handles whole, half, and quarter lines.
    """
    if lines is None:
        lines = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0]

    n = matrix.shape[0]
    home_probs = {}
    away_probs = {}

    for line in lines:
        if line % 0.5 == 0 and line % 0.25 != 0:
            # This shouldn't happen for our lines, but handle it
            pass

        # Check if this is a quarter line
        if abs(line * 4 - round(line * 4)) < 1e-10 and abs(line * 2 - round(line * 2)) > 1e-10:
            # Quarter line: split into two half-stakes
            line_lo = line - 0.25 if line > 0 else line + 0.25
            line_hi = line + 0.25 if line > 0 else line - 0.25
            # Actually: e.g., -0.75 = half on -0.5, half on -1.0
            line_lo = math.floor(line * 2) / 2.0
            line_hi = math.ceil(line * 2) / 2.0
            p_home_lo, p_away_lo = _handicap_half_line(matrix, line_lo)
            p_home_hi, p_away_hi = _handicap_half_line(matrix, line_hi)
            home_probs[line] = 0.5 * p_home_lo + 0.5 * p_home_hi
            away_probs[line] = 0.5 * p_away_lo + 0.5 * p_away_hi
        else:
            p_home, p_away = _handicap_half_line(matrix, line)
            home_probs[line] = p_home
            away_probs[line] = p_away

    return home_probs, away_probs


import math


def _handicap_half_line(
    matrix: NDArray[np.float64], line: float
) -> tuple[float, float]:
    """Compute home/away handicap probs for a single half or whole line."""
    n = matrix.shape[0]
    p_home = 0.0
    p_away = 0.0

    for i in range(n):
        for j in range(n):
            diff = (i - j) + line  # adjusted home margin
            if diff > 1e-10:
                p_home += matrix[i, j]
            elif diff < -1e-10:
                p_away += matrix[i, j]
            else:
                # Push: return half stake (reflected in pricing as 0.5 each)
                p_home += matrix[i, j] * 0.5
                p_away += matrix[i, j] * 0.5

    return p_home, p_away


def build_full_result(matrix: NDArray[np.float64]) -> ScoreMatrixResult:
    """Build a complete ScoreMatrixResult from a score matrix."""
    h, d, a = derive_1x2(matrix)
    btts = derive_btts(matrix)
    total_goals = derive_total_goals_distribution(matrix)
    over_probs, under_probs = derive_over_under(matrix)

    total_goals_float = {float(k): v for k, v in total_goals.items()}

    return ScoreMatrixResult(
        matrix=matrix,
        max_goals=matrix.shape[0] - 1,
        home_win_prob=h,
        draw_prob=d,
        away_win_prob=a,
        btts_prob=btts,
        total_goals_probs=total_goals_float,
        over_probs=over_probs,
        under_probs=under_probs,
    )
