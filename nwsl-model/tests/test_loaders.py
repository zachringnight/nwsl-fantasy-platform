from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.data.loaders import NWSLDataset, _filter_by_history_start


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False)


def test_filter_by_history_start_preserves_only_requested_seasons() -> None:
    frame = pd.DataFrame(
        [
            {"season": 2024, "value": "old"},
            {"season": 2025, "value": "new"},
            {"season": 2026, "value": "newer"},
        ]
    )

    filtered = _filter_by_history_start(frame, 2025)

    assert filtered["season"].tolist() == [2025, 2026]


def test_dataset_from_config_filters_history_window_across_tables(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    data_dir = repo_root / "data"
    matches_path = data_dir / "matches.csv"
    appearances_path = data_dir / "appearances.csv"
    projected_lineups_path = data_dir / "projected_lineups.csv"
    team_priors_path = data_dir / "team_season_priors.csv"
    player_priors_path = data_dir / "player_season_priors.csv"

    _write_csv(
        matches_path,
        [
            {
                "match_id": "m-2024",
                "match_date": "2024-04-01",
                "season": 2024,
                "home_team": "Portland Thorns",
                "away_team": "Washington Spirit",
                "home_goals_90": 1,
                "away_goals_90": 0,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_npxg": 1.1,
                "away_npxg": 0.7,
                "home_xg": 1.1,
                "away_xg": 0.7,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            },
            {
                "match_id": "m-2025",
                "match_date": "2025-04-01",
                "season": 2025,
                "home_team": "Portland Thorns",
                "away_team": "Washington Spirit",
                "home_goals_90": 2,
                "away_goals_90": 1,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_npxg": 1.9,
                "away_npxg": 1.2,
                "home_xg": 1.9,
                "away_xg": 1.2,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            },
        ],
    )
    _write_csv(
        appearances_path,
        [
            {
                "match_id": "m-2024",
                "season": 2024,
                "player_id": "p-old",
                "team": "Portland Thorns",
                "start_minute": 0,
                "end_minute": 90,
                "started_flag": True,
                "position": "Forward",
                "projected_flag": False,
                "available_flag": True,
                "injury_flag": False,
                "suspension_flag": False,
                "national_team_absence_flag": False,
            },
            {
                "match_id": "m-2025",
                "season": 2025,
                "player_id": "p-new",
                "team": "Portland Thorns",
                "start_minute": 0,
                "end_minute": 90,
                "started_flag": True,
                "position": "Forward",
                "projected_flag": False,
                "available_flag": True,
                "injury_flag": False,
                "suspension_flag": False,
                "national_team_absence_flag": False,
            },
        ],
    )
    _write_csv(
        projected_lineups_path,
        [
            {
                "match_id": "m-2024",
                "season": 2024,
                "team": "Portland Thorns",
                "player_id": "p-old",
                "projected_start": True,
                "projected_minutes": 90,
                "status": "available",
                "source": "test",
                "report_timestamp": "2026-04-07T00:00:00Z",
            },
            {
                "match_id": "m-2025",
                "season": 2025,
                "team": "Portland Thorns",
                "player_id": "p-new",
                "projected_start": True,
                "projected_minutes": 88,
                "status": "available",
                "source": "test",
                "report_timestamp": "2026-04-07T00:00:00Z",
            },
        ],
    )
    _write_csv(
        team_priors_path,
        [
            {"season": 2024, "team": "Portland Thorns", "games_played": 10},
            {"season": 2025, "team": "Portland Thorns", "games_played": 11},
        ],
    )
    _write_csv(
        player_priors_path,
        [
            {"season": 2024, "player_id": "p-old", "team": "Portland Thorns"},
            {"season": 2025, "player_id": "p-new", "team": "Portland Thorns"},
        ],
    )

    dataset = NWSLDataset.from_config(
        {
            "data": {
                "format": "csv",
                "history_start_season": 2025,
                "matches_path": str(matches_path),
                "odds_path": "",
                "venues_path": "",
                "appearances_path": str(appearances_path),
                "projected_lineups_path": str(projected_lineups_path),
                "team_season_priors_path": str(team_priors_path),
                "player_season_priors_path": str(player_priors_path),
            }
        }
    )

    assert dataset.matches["season"].tolist() == [2025]
    assert dataset.appearances["season"].tolist() == [2025]
    assert dataset.projected_lineups["season"].tolist() == [2025]
    assert dataset.team_season_priors["season"].tolist() == [2025]
    assert dataset.player_season_priors["season"].tolist() == [2025]
