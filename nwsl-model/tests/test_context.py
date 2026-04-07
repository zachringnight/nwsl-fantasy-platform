from __future__ import annotations

from datetime import date

import pandas as pd

from src.features.context import ContextualFeatureProvider, build_contextual_training_frame


def test_contextual_training_frame_uses_team_and_player_priors() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": date(2026, 3, 1),
                "season": 2026,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Portland Thorns",
                "away_team": "Current",
                "home_goals_90": 2,
                "away_goals_90": 1,
                "home_npxg": 1.8,
                "away_npxg": 1.1,
                "home_xg": 1.8,
                "away_xg": 1.1,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            }
        ]
    )
    team_priors = pd.DataFrame(
        [
            {
                "season": 2025,
                "team": "Portland Thorns",
                "goals_per_match": 1.9,
                "goals_against_per_match": 0.8,
                "shots_per_match": 12.4,
                "points_per_match": 2.2,
                "average_possession": 54.0,
                "xg_per_match": 1.7,
                "xg_against_per_match": 0.9,
                "xpoints_per_match": 2.1,
                "gplus_net_per90": 0.18,
                "gplus_shooting_net_per90": 0.05,
                "gplus_passing_net_per90": 0.04,
                "gplus_receiving_net_per90": 0.03,
            },
            {
                "season": 2026,
                "team": "Portland Thorns",
                "goals_per_match": 2.4,
                "goals_against_per_match": 0.6,
                "shots_per_match": 13.8,
                "points_per_match": 2.6,
                "average_possession": 56.0,
                "xg_per_match": 2.0,
                "xg_against_per_match": 0.7,
                "xpoints_per_match": 2.5,
                "gplus_net_per90": 0.25,
                "gplus_shooting_net_per90": 0.08,
                "gplus_passing_net_per90": 0.06,
                "gplus_receiving_net_per90": 0.04,
            },
            {
                "season": 2025,
                "team": "Current",
                "goals_per_match": 1.5,
                "goals_against_per_match": 1.0,
                "shots_per_match": 11.1,
                "points_per_match": 1.7,
                "average_possession": 50.5,
                "xg_per_match": 1.4,
                "xg_against_per_match": 1.1,
                "xpoints_per_match": 1.8,
                "gplus_net_per90": 0.08,
                "gplus_shooting_net_per90": 0.02,
                "gplus_passing_net_per90": 0.01,
                "gplus_receiving_net_per90": 0.015,
            },
            {
                "season": 2026,
                "team": "Current",
                "goals_per_match": 1.8,
                "goals_against_per_match": 0.9,
                "shots_per_match": 12.0,
                "points_per_match": 2.0,
                "average_possession": 52.0,
                "xg_per_match": 1.6,
                "xg_against_per_match": 0.95,
                "xpoints_per_match": 2.0,
                "gplus_net_per90": 0.11,
                "gplus_shooting_net_per90": 0.03,
                "gplus_passing_net_per90": 0.02,
                "gplus_receiving_net_per90": 0.02,
            },
        ]
    )
    player_priors = pd.DataFrame(
        [
            {
                "season": 2026,
                "player_id": "p1",
                "team": "Portland Thorns",
                "season_value_score": 0.8,
            },
            {
                "season": 2026,
                "player_id": "p2",
                "team": "Current",
                "season_value_score": 0.6,
            },
        ]
    )
    projected_lineups = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "team": "Portland Thorns",
                "player_id": "p1",
                "projected_start": True,
                "projected_minutes": 88,
                "status": "available",
            },
            {
                "match_id": "m1",
                "team": "Current",
                "player_id": "p2",
                "projected_start": True,
                "projected_minutes": 84,
                "status": "available",
            },
        ]
    )

    prepared, contextual_cols = build_contextual_training_frame(
        matches,
        projected_lineups=projected_lineups,
        team_season_priors=team_priors,
        player_season_priors=player_priors,
    )

    row = prepared.iloc[0]
    assert row["home_team_xg_per_match"] == 1.7
    assert row["away_team_points_per_match"] == 1.7
    assert row["home_team_xpoints_per_match"] == 2.1
    assert row["away_team_gplus_net_per90"] == 0.08
    assert row["home_lineup_strength"] == 0.8
    assert row["away_lineup_strength"] == 0.6
    assert "home_team_shots_per_match" in contextual_cols
    assert "home_team_gplus_passing_net_per90" in contextual_cols
    assert "home_team_xg_per_match_missing" in contextual_cols
    assert row["home_team_xg_per_match_missing"] == 0.0

    provider = ContextualFeatureProvider.from_training_frame(prepared).attach_projected_lineups(
        projected_lineups=projected_lineups,
        player_season_priors=player_priors,
    )
    fixture_context = provider.for_match("Portland Thorns", "Current")
    assert fixture_context["home_team_goals_per_match"] == 1.9
    assert fixture_context["away_team_xg_per_match"] == 1.4
    assert fixture_context["home_team_xpoints_per_match"] == 2.1
    assert fixture_context["away_team_gplus_receiving_net_per90"] == 0.015
    assert fixture_context["home_lineup_strength"] == 0.8


def test_contextual_training_frame_uses_previous_available_team_priors() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": date(2025, 3, 1),
                "season": 2025,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Portland Thorns",
                "away_team": "Current",
                "home_goals_90": 1,
                "away_goals_90": 0,
                "home_npxg": 1.2,
                "away_npxg": 0.7,
                "home_xg": 1.2,
                "away_xg": 0.7,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            },
            {
                "match_id": "m2",
                "match_date": date(2026, 3, 1),
                "season": 2026,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Portland Thorns",
                "away_team": "Current",
                "home_goals_90": 2,
                "away_goals_90": 1,
                "home_npxg": 1.5,
                "away_npxg": 1.0,
                "home_xg": 1.5,
                "away_xg": 1.0,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            },
        ]
    )
    team_priors = pd.DataFrame(
        [
            {
                "season": 2025,
                "team": "Portland Thorns",
                "goals_per_match": 1.4,
                "points_per_match": 1.8,
                "xg_per_match": 1.35,
            },
            {
                "season": 2025,
                "team": "Current",
                "goals_per_match": 1.6,
                "points_per_match": 2.0,
                "xg_per_match": 1.5,
            },
            {
                "season": 2026,
                "team": "Portland Thorns",
                "goals_per_match": 2.1,
                "points_per_match": 2.4,
                "xg_per_match": 1.9,
            },
            {
                "season": 2026,
                "team": "Current",
                "goals_per_match": 1.9,
                "points_per_match": 2.1,
                "xg_per_match": 1.8,
            },
        ]
    )

    prepared, _ = build_contextual_training_frame(matches, team_season_priors=team_priors)

    first_row = prepared.set_index("match_id").loc["m1"]
    second_row = prepared.set_index("match_id").loc["m2"]
    assert first_row["home_team_xg_per_match"] == 1.35
    assert first_row["home_team_xg_per_match_missing"] == 1.0
    assert second_row["home_team_xg_per_match"] == 1.35
    assert second_row["away_team_points_per_match"] == 2.0
    assert second_row["home_team_xg_per_match_missing"] == 0.0
