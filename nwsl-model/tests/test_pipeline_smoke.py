from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import yaml


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False)


def test_train_backtest_evaluate_and_promote_smoke(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"
    artifact_root = tmp_path / "models"
    processed_dir = tmp_path / "processed"
    version = "smoke-v1"

    matches_rows = [
        {"match_id": "m01", "match_date": "2024-03-01", "season": 2024, "competition": "NWSL", "regular_season_flag": True, "home_team": "Portland Thorns", "away_team": "Reign", "home_goals_90": 2, "away_goals_90": 1, "home_npxg": 1.8, "away_npxg": 1.0, "home_xg": 1.8, "away_xg": 1.0, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m02", "match_date": "2024-03-08", "season": 2024, "competition": "NWSL", "regular_season_flag": True, "home_team": "Reign", "away_team": "Current", "home_goals_90": 1, "away_goals_90": 1, "home_npxg": 1.2, "away_npxg": 1.1, "home_xg": 1.2, "away_xg": 1.1, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m03", "match_date": "2024-03-15", "season": 2024, "competition": "NWSL", "regular_season_flag": True, "home_team": "Current", "away_team": "Portland Thorns", "home_goals_90": 0, "away_goals_90": 2, "home_npxg": 0.8, "away_npxg": 1.7, "home_xg": 0.8, "away_xg": 1.7, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m04", "match_date": "2025-03-01", "season": 2025, "competition": "NWSL", "regular_season_flag": True, "home_team": "Portland Thorns", "away_team": "Current", "home_goals_90": 1, "away_goals_90": 0, "home_npxg": 1.4, "away_npxg": 0.9, "home_xg": 1.4, "away_xg": 0.9, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m05", "match_date": "2025-03-08", "season": 2025, "competition": "NWSL", "regular_season_flag": True, "home_team": "Current", "away_team": "Reign", "home_goals_90": 2, "away_goals_90": 0, "home_npxg": 1.9, "away_npxg": 0.7, "home_xg": 1.9, "away_xg": 0.7, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m06", "match_date": "2025-03-15", "season": 2025, "competition": "NWSL", "regular_season_flag": True, "home_team": "Reign", "away_team": "Portland Thorns", "home_goals_90": 0, "away_goals_90": 1, "home_npxg": 0.6, "away_npxg": 1.5, "home_xg": 0.6, "away_xg": 1.5, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m07", "match_date": "2026-03-01", "season": 2026, "competition": "NWSL", "regular_season_flag": True, "home_team": "Portland Thorns", "away_team": "Reign", "home_goals_90": 2, "away_goals_90": 0, "home_npxg": 1.7, "away_npxg": 0.8, "home_xg": 1.7, "away_xg": 0.8, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m08", "match_date": "2026-03-08", "season": 2026, "competition": "NWSL", "regular_season_flag": True, "home_team": "Current", "away_team": "Portland Thorns", "home_goals_90": 1, "away_goals_90": 2, "home_npxg": 1.1, "away_npxg": 1.6, "home_xg": 1.1, "away_xg": 1.6, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
        {"match_id": "m09", "match_date": "2026-03-15", "season": 2026, "competition": "NWSL", "regular_season_flag": True, "home_team": "Reign", "away_team": "Current", "home_goals_90": 1, "away_goals_90": 2, "home_npxg": 1.0, "away_npxg": 1.7, "home_xg": 1.0, "away_xg": 1.7, "match_status": "completed", "resumed_flag": False, "incomplete_flag": False},
    ]
    odds_rows = [
        {"match_id": row["match_id"], "sportsbook": "book-a", "market_type": "1x2", "home_odds": 2.0, "draw_odds": 3.4, "away_odds": 3.8, "source_type": "close"}
        for row in matches_rows
    ]

    _write_csv(raw_dir / "matches.csv", matches_rows)
    _write_csv(raw_dir / "odds.csv", odds_rows)
    pd.DataFrame(
        columns=[
            "match_id",
            "player_id",
            "team",
            "start_minute",
            "end_minute",
            "started_flag",
        ]
    ).to_csv(raw_dir / "appearances.csv", index=False)
    pd.DataFrame(
        columns=[
            "match_id",
            "team",
            "player_id",
            "projected_start",
            "projected_minutes",
            "status",
        ]
    ).to_csv(raw_dir / "projected_lineups.csv", index=False)
    pd.DataFrame(
        [
            {
                "season": 2024,
                "team": "Portland Thorns",
                "games_played": 3,
                "goals_per_match": 1.7,
                "goals_against_per_match": 0.8,
                "shots_per_match": 12.5,
                "points_per_match": 2.0,
                "average_possession": 54.0,
                "xg_per_match": 1.6,
            },
            {
                "season": 2024,
                "team": "Reign",
                "games_played": 3,
                "goals_per_match": 0.8,
                "goals_against_per_match": 1.2,
                "shots_per_match": 9.5,
                "points_per_match": 1.0,
                "average_possession": 48.0,
                "xg_per_match": 0.9,
            },
            {
                "season": 2024,
                "team": "Current",
                "games_played": 3,
                "goals_per_match": 1.3,
                "goals_against_per_match": 1.0,
                "shots_per_match": 10.7,
                "points_per_match": 1.7,
                "average_possession": 51.0,
                "xg_per_match": 1.2,
            },
            {
                "season": 2025,
                "team": "Portland Thorns",
                "games_played": 3,
                "goals_per_match": 1.4,
                "goals_against_per_match": 0.7,
                "shots_per_match": 11.3,
                "points_per_match": 2.0,
                "average_possession": 53.0,
                "xg_per_match": 1.4,
            },
            {
                "season": 2025,
                "team": "Reign",
                "games_played": 3,
                "goals_per_match": 0.6,
                "goals_against_per_match": 1.4,
                "shots_per_match": 8.8,
                "points_per_match": 0.7,
                "average_possession": 47.0,
                "xg_per_match": 0.8,
            },
            {
                "season": 2025,
                "team": "Current",
                "games_played": 3,
                "goals_per_match": 1.8,
                "goals_against_per_match": 0.6,
                "shots_per_match": 12.8,
                "points_per_match": 2.3,
                "average_possession": 52.0,
                "xg_per_match": 1.8,
            },
            {
                "season": 2026,
                "team": "Portland Thorns",
                "games_played": 3,
                "goals_per_match": 2.0,
                "goals_against_per_match": 0.7,
                "shots_per_match": 13.0,
                "points_per_match": 2.3,
                "average_possession": 55.0,
                "xg_per_match": 1.9,
            },
            {
                "season": 2026,
                "team": "Reign",
                "games_played": 3,
                "goals_per_match": 0.9,
                "goals_against_per_match": 1.5,
                "shots_per_match": 9.0,
                "points_per_match": 0.7,
                "average_possession": 46.0,
                "xg_per_match": 0.9,
            },
            {
                "season": 2026,
                "team": "Current",
                "games_played": 3,
                "goals_per_match": 1.7,
                "goals_against_per_match": 1.0,
                "shots_per_match": 12.1,
                "points_per_match": 1.7,
                "average_possession": 51.5,
                "xg_per_match": 1.6,
            },
        ]
    ).to_csv(raw_dir / "team_season_priors.csv", index=False)
    pd.DataFrame(
        [
            {"season": 2026, "player_id": "p1", "team": "Portland Thorns", "position": "Forward", "minutes_played": 900, "games_played": 10, "goals": 5, "assists": 3, "xg": 4.8, "shots": 32, "shots_on_target": 14, "goal_actions_per90": 0.8, "xg_per90": 0.48, "shots_per90": 3.2, "shots_on_target_per90": 1.4, "season_value_score": 0.82},
            {"season": 2026, "player_id": "p2", "team": "Current", "position": "Forward", "minutes_played": 870, "games_played": 10, "goals": 4, "assists": 2, "xg": 4.1, "shots": 26, "shots_on_target": 12, "goal_actions_per90": 0.62, "xg_per90": 0.42, "shots_per90": 2.7, "shots_on_target_per90": 1.2, "season_value_score": 0.73},
        ]
    ).to_csv(raw_dir / "player_season_priors.csv", index=False)

    with open(raw_dir / "dataset_manifest.json", "w") as fh:
        json.dump({"history_start_season": 2025, "matches": {"season_coverage": [2025, 2026]}}, fh)

    config = {
        "data": {
            "matches_path": str(raw_dir / "matches.csv"),
            "odds_path": str(raw_dir / "odds.csv"),
            "appearances_path": str(raw_dir / "appearances.csv"),
            "projected_lineups_path": str(raw_dir / "projected_lineups.csv"),
            "team_season_priors_path": str(raw_dir / "team_season_priors.csv"),
            "player_season_priors_path": str(raw_dir / "player_season_priors.csv"),
            "history_start_season": 2025,
            "output_dir": str(processed_dir),
            "format": "csv",
        },
        "model": {"primary_model": "dixon_coles", "max_goals": 6, "random_seed": 42},
        "team_ratings": {"half_life_days": 90, "prior_weight": 5.0, "season_carryover": 0.6},
        "dixon_coles": {"rho_init": -0.05, "rho_bounds": [-0.5, 0.5], "home_advantage_init": 0.2, "max_iter": 50, "tol": 1e-6},
        "bivariate_poisson": {"lambda3_init": 0.1, "lambda3_bounds": [0.001, 2.0], "home_advantage_init": 0.2, "max_iter": 50, "tol": 1e-6},
        "lineup_adjustment": {"ridge_alpha": 100.0, "min_minutes": 200, "split_attack_defense": True},
        "features": {"rolling_windows": [3, 5], "short_rest_days": 4, "use_travel_distance": False, "use_weather": False, "use_surface": False},
        "market_blend": {"alpha": 0.5, "alpha_schedule_enabled": False, "alpha_schedule": [], "devig_method": "multiplicative"},
        "betting": {"min_edge": 0.02, "kelly_fraction": 0.25, "max_stake_pct": 0.01, "starting_bankroll": 10000.0, "markets": ["1x2", "totals"]},
        "backtest": {"min_train_matches": 4, "step_size": 1, "benchmarks": ["uniform_baseline", "home_field_baseline", "team_ratings_poisson", "rolling_npxg_poisson"]},
        "logging": {"level": "INFO", "file": str(tmp_path / "test.log")},
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(config))

    repo_root = Path(__file__).resolve().parents[2]
    commands = [
        [
            sys.executable,
            str(repo_root / "nwsl-model" / "scripts" / "train.py"),
            "--config",
            str(config_path),
            "--model",
            "all",
            "--output-dir",
            str(artifact_root),
            "--version",
            version,
        ],
        [
            sys.executable,
            str(repo_root / "nwsl-model" / "scripts" / "backtest.py"),
            "--config",
            str(config_path),
            "--artifact-root",
            str(artifact_root),
            "--version",
            version,
        ],
        [
            sys.executable,
            str(repo_root / "nwsl-model" / "scripts" / "evaluate.py"),
            "--artifact-root",
            str(artifact_root),
            "--version",
            version,
        ],
        [
            sys.executable,
            str(repo_root / "nwsl-model" / "scripts" / "promote.py"),
            "--artifact-root",
            str(artifact_root),
            "--version",
            version,
        ],
    ]

    for command in commands:
        result = subprocess.run(command, capture_output=True, text=True, cwd=str(repo_root))
        assert result.returncode == 0, result.stderr

    version_dir = artifact_root / version
    assert (version_dir / "dixon_coles_model.pkl").exists()
    assert (version_dir / "bivariate_poisson_model.pkl").exists()
    assert (version_dir / "training_summary.json").exists()
    assert (version_dir / "backtest_summary.json").exists()
    assert (version_dir / "evaluation_summary.json").exists()
    assert (version_dir / "promotion_summary.json").exists()
    assert (artifact_root / "champions.json").exists()
    training_summary = json.loads((version_dir / "training_summary.json").read_text())
    assert "home_team_xg_per_match" in training_summary["contextual_columns"]
    assert "home_team_xg_per_match" in training_summary["model_contextual_columns"]
    assert len(training_summary["model_contextual_columns"]) < len(training_summary["contextual_columns"])
