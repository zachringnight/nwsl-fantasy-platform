"""Math utility functions for the NWSL betting model."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def poisson_pmf(k: int, lam: float) -> float:
    """Poisson probability mass function."""
    from scipy.stats import poisson
    return float(poisson.pmf(k, lam))


def poisson_pmf_array(max_k: int, lam: float) -> NDArray[np.float64]:
    """Return Poisson PMF values for k=0..max_k."""
    from scipy.stats import poisson
    return poisson.pmf(np.arange(max_k + 1), lam)


def bivariate_poisson_pmf(
    i: int, j: int, lam1: float, lam2: float, lam3: float
) -> float:
    """Bivariate Poisson P(X=i, Y=j) with shared component lambda3.

    X = X1 + X3, Y = X2 + X3 where X1~Pois(lam1), X2~Pois(lam2), X3~Pois(lam3).
    P(X=i, Y=j) = sum_{k=0}^{min(i,j)} P(X1=i-k) * P(X2=j-k) * P(X3=k)
    """
    from scipy.stats import poisson
    max_k = min(i, j)
    total = 0.0
    for k in range(max_k + 1):
        total += (
            poisson.pmf(i - k, lam1)
            * poisson.pmf(j - k, lam2)
            * poisson.pmf(k, lam3)
        )
    return total


def bivariate_poisson_matrix(
    lam1: float, lam2: float, lam3: float, max_goals: int = 8
) -> NDArray[np.float64]:
    """Build a (max_goals+1) x (max_goals+1) joint probability matrix."""
    n = max_goals + 1
    mat = np.zeros((n, n), dtype=np.float64)
    for i in range(n):
        for j in range(n):
            mat[i, j] = bivariate_poisson_pmf(i, j, lam1, lam2, lam3)
    return mat


def dixon_coles_correction(
    i: int, j: int, lam1: float, lam2: float, rho: float
) -> float:
    """Dixon-Coles low-score adjustment factor tau(i, j, lam1, lam2, rho).

    Adjusts P(0,0), P(1,0), P(0,1), P(1,1) to correct for
    over/under-estimation of draws and low-scoring matches.
    """
    if i == 0 and j == 0:
        return 1.0 - lam1 * lam2 * rho
    elif i == 1 and j == 0:
        return 1.0 + lam2 * rho
    elif i == 0 and j == 1:
        return 1.0 + lam1 * rho
    elif i == 1 and j == 1:
        return 1.0 - rho
    return 1.0


def safe_log(x: float | NDArray, eps: float = 1e-15) -> float | NDArray:
    """Safe natural log that avoids log(0)."""
    return np.log(np.maximum(x, eps))


def softmax(x: NDArray[np.float64]) -> NDArray[np.float64]:
    """Numerically stable softmax."""
    e = np.exp(x - np.max(x))
    return e / e.sum()


def implied_probability(decimal_odds: float) -> float:
    """Convert decimal odds to implied probability."""
    if decimal_odds <= 1.0:
        raise ValueError(f"Decimal odds must be > 1.0, got {decimal_odds}")
    return 1.0 / decimal_odds


def decimal_from_probability(prob: float, min_odds: float = 1.01) -> float:
    """Convert probability to decimal odds."""
    if prob <= 0:
        return float("inf")
    return max(1.0 / prob, min_odds)
