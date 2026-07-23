from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.data.loaders import NWSLDataset, _filter_by_history_start, _filter_by_season_window, load_odds


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


def test_filter_by_season_window_preserves_requested_closed_window() -> None:
    frame = pd.DataFrame(
        [
            {"season": 2024, "value": "old"},
            {"season": 2025, "value": "research"},
            {"season": 2026, "value": "live"},
        ]
    )

    filtered = _filter_by_season_window(frame, 2025, 2025)

    assert filtered["season"].tolist() == [2025]


def test_load_odds_parses_mixed_precision_timestamps(tmp_path: Path) -> None:
    odds_path = tmp_path / "odds.csv"
    _write_csv(
        odds_path,
        [
            {
                "match_id": "close",
                "timestamp": "2026-03-14T00:00:00+00:00",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
            },
            {
                "match_id": "current",
                "timestamp": "2026-05-27T18:58:26.088562+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
            },
        ],
    )

    odds = load_odds(odds_path)

    assert odds is not None
    assert odds["timestamp"].notna().all()
    assert str(odds.loc[odds["match_id"].eq("current"), "timestamp"].iloc[0]).startswith(
        "2026-05-27 18:58:26.088562+00:00"
    )


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
            {
                "match_id": "official-id-without-match",
                "season": 2025,
                "team": "Portland Thorns",
                "player_id": "p-stale",
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
    assert dataset.projected_lineups["match_id"].tolist() == ["m-2025"]
    assert dataset.team_season_priors["season"].tolist() == [2025]
    assert dataset.player_season_priors["season"].tolist() == [2025]


def test_dataset_from_config_keeps_prior_lookback_when_requested(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    data_dir = repo_root / "data"
    matches_path = data_dir / "matches.csv"
    team_priors_path = data_dir / "team_season_priors.csv"
    player_priors_path = data_dir / "player_season_priors.csv"

    _write_csv(
        matches_path,
        [
            {
                "match_id": "m-2025",
                "match_date": "2025-04-01",
                "season": 2025,
                "home_team": "Portland Thorns",
                "away_team": "Washington Spirit",
                "home_goals_90": 2,
                "away_goals_90": 1,
                "match_status": "completed",
            },
            {
                "match_id": "m-2026",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "Portland Thorns",
                "away_team": "Washington Spirit",
                "home_goals_90": 1,
                "away_goals_90": 1,
                "match_status": "completed",
            },
        ],
    )
    _write_csv(
        team_priors_path,
        [
            {"season": 2025, "team": "Portland Thorns", "games_played": 26},
            {"season": 2026, "team": "Portland Thorns", "games_played": 10},
        ],
    )
    _write_csv(
        player_priors_path,
        [
            {"season": 2025, "player_id": "p-old", "team": "Portland Thorns"},
            {"season": 2026, "player_id": "p-new", "team": "Portland Thorns"},
        ],
    )

    dataset = NWSLDataset.from_config(
        {
            "data": {
                "format": "csv",
                "history_start_season": 2026,
                "prior_history_start_season": 2025,
                "matches_path": str(matches_path),
                "odds_path": "",
                "venues_path": "",
                "appearances_path": "",
                "projected_lineups_path": "",
                "team_season_priors_path": str(team_priors_path),
                "player_season_priors_path": str(player_priors_path),
            }
        }
    )

    assert dataset.matches["season"].tolist() == [2026]
    assert dataset.team_season_priors["season"].tolist() == [2025, 2026]
    assert dataset.player_season_priors["season"].tolist() == [2025, 2026]


def test_dataset_from_config_supports_research_season_window(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    data_dir = repo_root / "data"
    matches_path = data_dir / "matches.csv"
    odds_path = data_dir / "odds.csv"

    _write_csv(
        matches_path,
        [
            {
                "match_id": "m-2025",
                "match_date": "2025-04-01",
                "season": 2025,
                "home_team": "Portland Thorns",
                "away_team": "Washington Spirit",
                "home_goals_90": 2,
                "away_goals_90": 1,
                "match_status": "completed",
            },
            {
                "match_id": "m-2026",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "Portland Thorns",
                "away_team": "Washington Spirit",
                "home_goals_90": 1,
                "away_goals_90": 1,
                "match_status": "completed",
            },
        ],
    )
    _write_csv(
        odds_path,
        [
            {"match_id": "m-2025", "sportsbook": "OddsPortalAvg", "market_type": "1x2", "source_type": "close"},
            {"match_id": "m-2026", "sportsbook": "OddsPortalAvg", "market_type": "1x2", "source_type": "close"},
        ],
    )

    dataset = NWSLDataset.from_config(
        {
            "data": {
                "format": "csv",
                "history_start_season": 2025,
                "history_end_season": 2025,
                "matches_path": str(matches_path),
                "odds_path": str(odds_path),
                "venues_path": "",
                "appearances_path": "",
                "projected_lineups_path": "",
            }
        }
    )

    assert dataset.matches["match_id"].tolist() == ["m-2025"]
    assert dataset.odds["match_id"].tolist() == ["m-2025"]


def test_dataset_from_config_maps_official_match_ids_with_upcoming_reference(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    data_dir = repo_root / "data"
    official_dir = repo_root / "official"
    matches_path = data_dir / "matches.csv"
    upcoming_path = data_dir / "upcoming.csv"
    appearances_path = data_dir / "appearances.csv"
    projected_lineups_path = data_dir / "projected_lineups.csv"

    _write_csv(
        matches_path,
        [
            {
                "match_id": "espn-completed",
                "match_date": "2026-03-14",
                "season": 2026,
                "home_team": "Washington Spirit",
                "away_team": "Portland Thorns FC",
                "home_goals_90": 0,
                "away_goals_90": 1,
                "match_status": "completed",
            }
        ],
    )
    _write_csv(
        upcoming_path,
        [
            {
                "match_id": "espn-upcoming",
                "match_date": "2026-05-29",
                "season": 2026,
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 0,
                "away_goals_90": 0,
                "match_status": "scheduled",
            }
        ],
    )
    _write_csv(
        official_dir / "nwsl_2026_official_matches.csv",
        [
            {
                "match_id": "official-completed",
                "season": 2026,
                "match_date_utc": "2026-03-14T00:00:00Z",
                "match_date_local": "2026-03-13T20:00:00",
                "home_official_name": "Washington Spirit",
                "away_official_name": "Portland Thorns",
                "home_score": 0,
                "away_score": 1,
            },
            {
                "match_id": "official-upcoming",
                "season": 2026,
                "match_date_utc": "2026-05-29T23:00:00Z",
                "match_date_local": "2026-05-29T19:00:00",
                "home_official_name": "Orlando Pride",
                "away_official_name": "Bay",
                "home_score": None,
                "away_score": None,
            },
        ],
    )
    _write_csv(
        appearances_path,
        [
            {
                "match_id": "official-completed",
                "season": 2026,
                "player_id": "player-1",
                "team": "Portland Thorns",
                "start_minute": 0,
                "end_minute": 90,
                "started_flag": True,
            },
            {
                "match_id": "official-upcoming",
                "season": 2026,
                "player_id": "player-future",
                "team": "Bay",
                "start_minute": 0,
                "end_minute": 90,
                "started_flag": True,
            },
            {
                "match_id": "official-completed",
                "season": 2026,
                "player_id": "player-bad-team",
                "team": "Bay",
                "start_minute": 0,
                "end_minute": 90,
                "started_flag": True,
            },
        ],
    )
    _write_csv(
        projected_lineups_path,
        [
            {
                "match_id": "official-upcoming",
                "season": 2026,
                "team": "Bay",
                "player_id": "player-2",
                "projected_start": True,
                "projected_minutes": 90,
                "status": "available",
            },
            {
                "match_id": "official-upcoming",
                "season": 2026,
                "team": "Portland Thorns",
                "player_id": "player-bad-team",
                "projected_start": True,
                "projected_minutes": 90,
                "status": "available",
            }
        ],
    )

    dataset = NWSLDataset.from_config(
        {
            "data": {
                "format": "csv",
                "history_start_season": 2026,
                "matches_path": str(matches_path),
                "upcoming_path": str(upcoming_path),
                "odds_path": "",
                "venues_path": "",
                "appearances_path": str(appearances_path),
                "projected_lineups_path": str(projected_lineups_path),
                "official_matches_dir": str(official_dir),
            }
        }
    )

    assert dataset.appearances[["match_id", "team"]].to_dict("records") == [
        {"match_id": "espn-completed", "team": "Portland Thorns FC"}
    ]
    assert dataset.projected_lineups[["match_id", "team"]].to_dict("records") == [
        {"match_id": "espn-upcoming", "team": "Bay FC"}
    ]


def test_dataset_from_config_aligns_prior_team_aliases_to_model_labels(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    matches_path = data_dir / "matches.csv"
    team_priors_path = data_dir / "team_season_priors.csv"
    player_priors_path = data_dir / "player_season_priors.csv"

    _write_csv(
        matches_path,
        [
            {
                "match_id": "m-2026",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "Kansas City Current",
                "away_team": "Seattle Reign FC",
                "home_goals_90": 1,
                "away_goals_90": 1,
                "match_status": "completed",
            }
        ],
    )
    _write_csv(
        team_priors_path,
        [
            {"season": 2025, "team": "Current", "games_played": 26},
            {"season": 2025, "team": "Reign", "games_played": 26},
        ],
    )
    _write_csv(
        player_priors_path,
        [
            {"season": 2025, "player_id": "p1", "team": "Current"},
            {"season": 2025, "player_id": "p2", "team": "Reign"},
        ],
    )

    dataset = NWSLDataset.from_config(
        {
            "data": {
                "format": "csv",
                "history_start_season": 2026,
                "prior_history_start_season": 2025,
                "matches_path": str(matches_path),
                "odds_path": "",
                "venues_path": "",
                "appearances_path": "",
                "projected_lineups_path": "",
                "team_season_priors_path": str(team_priors_path),
                "player_season_priors_path": str(player_priors_path),
            }
        }
    )

    assert dataset.team_season_priors["team"].tolist() == [
        "Kansas City Current",
        "Seattle Reign FC",
    ]
    assert dataset.player_season_priors["team"].tolist() == [
        "Kansas City Current",
        "Seattle Reign FC",
    ]
