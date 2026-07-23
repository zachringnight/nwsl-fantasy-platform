from __future__ import annotations

import pandas as pd
import pytest

from src.features.roster_continuity import (
    RosterContinuityInputs,
    compute_roster_continuity,
    prior_weight_from_continuity,
    roster_continuity_score,
)


def test_roster_continuity_score_weights_returning_core() -> None:
    score = roster_continuity_score(
        RosterContinuityInputs(
            returning_minutes_share=80.0,
            returning_value_share=70.0,
            defensive_spine_continuity=60.0,
            attacking_core_continuity=90.0,
            goalkeeper_continuity=100.0,
            manager_continuity=50.0,
        )
    )

    assert score == pytest.approx(74.5)


def test_prior_weight_from_continuity_decays_with_current_season_matches() -> None:
    assert prior_weight_from_continuity(85.0, matches_played=0) == 0.60
    assert prior_weight_from_continuity(85.0, matches_played=5) == 0.50
    assert prior_weight_from_continuity(85.0, matches_played=10) == 0.30
    assert prior_weight_from_continuity(85.0, matches_played=18) == 0.15
    assert prior_weight_from_continuity(10.0, matches_played=0) == 0.08


def test_compute_roster_continuity_uses_prior_season_minutes_and_value() -> None:
    priors = pd.DataFrame(
        [
            {
                "season": 2025,
                "team": "Portland Thorns",
                "player_id": "keeper",
                "position": "Goalkeeper",
                "minutes_played": 900,
                "season_value_score": 0.5,
            },
            {
                "season": 2025,
                "team": "Portland Thorns",
                "player_id": "defender",
                "position": "Defender",
                "minutes_played": 900,
                "season_value_score": 0.4,
            },
            {
                "season": 2025,
                "team": "Portland Thorns",
                "player_id": "forward",
                "position": "Forward",
                "minutes_played": 900,
                "season_value_score": 0.6,
            },
            {
                "season": 2026,
                "team": "Portland Thorns",
                "player_id": "keeper",
                "position": "Goalkeeper",
                "minutes_played": 0,
                "season_value_score": 0.0,
            },
            {
                "season": 2026,
                "team": "Portland Thorns",
                "player_id": "forward",
                "position": "Forward",
                "minutes_played": 0,
                "season_value_score": 0.0,
            },
        ]
    )

    continuity = compute_roster_continuity(priors)
    row = continuity.iloc[0]

    assert row["season"] == 2026
    assert row["team"] == "Portland Thorns"
    assert row["returning_minutes_share"] == pytest.approx(66.6667)
    assert row["returning_value_share"] == pytest.approx(73.3333)
    assert row["defensive_spine_continuity"] == pytest.approx(50.0)
    assert row["attacking_core_continuity"] == pytest.approx(100.0)
    assert row["goalkeeper_continuity"] == pytest.approx(100.0)
    assert row["roster_continuity_score"] == pytest.approx(70.8333)
    assert row["preseason_historical_prior_weight"] == 0.45


def test_compute_roster_continuity_gives_expansion_team_zero_historical_weight() -> None:
    priors = pd.DataFrame(
        [
            {
                "season": 2025,
                "team": "Existing FC",
                "player_id": "prior-player",
                "position": "Forward",
                "minutes_played": 900,
                "season_value_score": 0.5,
            },
            {
                "season": 2026,
                "team": "Boston Legacy",
                "player_id": "new-player",
                "position": "Forward",
                "minutes_played": 0,
                "season_value_score": 0.0,
            }
        ]
    )

    continuity = compute_roster_continuity(priors, target_seasons=[2026])
    row = continuity.iloc[0]

    assert row["team"] == "Boston Legacy"
    assert row["roster_continuity_score"] == 0.0
    assert row["preseason_historical_prior_weight"] == 0.0
