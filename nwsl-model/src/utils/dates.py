"""Date utility functions."""

from __future__ import annotations

from datetime import date, timedelta


def days_between(d1: date, d2: date) -> int:
    """Return absolute number of days between two dates."""
    return abs((d2 - d1).days)


def decay_weight(days_ago: float, half_life: float) -> float:
    """Exponential decay weight. weight = exp(-days_ago * ln(2) / half_life)."""
    import math
    if half_life <= 0:
        raise ValueError("half_life must be positive")
    return math.exp(-days_ago * math.log(2) / half_life)


def season_from_date(d: date) -> int:
    """Infer NWSL season year from date. Season typically runs March-November."""
    return d.year


def is_in_season(d: date, season_start_month: int = 3, season_end_month: int = 11) -> bool:
    """Check if date falls within approximate season window."""
    return season_start_month <= d.month <= season_end_month
