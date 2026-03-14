"""Shared test fixtures."""

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def sample_matches():
    """Generate sample match data for testing."""
    rng = np.random.RandomState(42)
    teams = ["Portland Thorns", "OL Reign", "Racing Louisville",
             "Angel City FC", "San Diego Wave", "NJ/NY Gotham FC"]
    records = []
    base_date = date(2023, 3, 1)

    for i in range(100):
        h = teams[i % len(teams)]
        a = teams[(i + 3) % len(teams)]
        hg = rng.poisson(1.4)
        ag = rng.poisson(1.1)
        records.append({
            "match_id": f"NWSL{i:04d}",
            "match_date": base_date + timedelta(days=i * 3),
            "season": 2023,
            "competition": "NWSL",
            "regular_season_flag": True,
            "home_team": h,
            "away_team": a,
            "home_goals_90": hg,
            "away_goals_90": ag,
            "home_npxg": max(0, hg + rng.normal(0, 0.3)),
            "away_npxg": max(0, ag + rng.normal(0, 0.3)),
            "home_xg": max(0, hg + rng.normal(0, 0.4)),
            "away_xg": max(0, ag + rng.normal(0, 0.4)),
            "match_status": "completed",
            "resumed_flag": False,
            "incomplete_flag": False,
        })
    return pd.DataFrame(records)


@pytest.fixture
def sample_odds(sample_matches):
    """Generate sample odds data."""
    records = []
    for _, row in sample_matches.iterrows():
        records.append({
            "match_id": row["match_id"],
            "sportsbook": "test_book",
            "market_type": "1x2",
            "home_odds": round(np.random.uniform(1.8, 3.5), 2),
            "draw_odds": round(np.random.uniform(3.0, 4.0), 2),
            "away_odds": round(np.random.uniform(2.0, 5.0), 2),
            "source_type": "close",
        })
    return pd.DataFrame(records)
