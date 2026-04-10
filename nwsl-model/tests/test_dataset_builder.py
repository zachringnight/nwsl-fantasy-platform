from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.data.asa import normalize_person_key
from src.data.dataset_builder import (
    build_appearances,
    build_dataset,
    build_matches,
    build_player_season_priors,
    build_projected_lineups,
    build_team_season_priors,
    normalize_odds_contract,
    write_dataset,
)


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False)


def test_build_matches_merges_statsbomb_xg(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    official_path = repo_root / "data" / "nwsl-official" / "nwsl_2018_official_matches.csv"
    statsbomb_path = repo_root / "data" / "statsbomb" / "nwsl_2018_match_team_xg.csv"

    _write_csv(
        official_path,
        [
            {
                "season": 2018,
                "match_id": "m1",
                "match_date_utc": "2018-04-15T00:00:00Z",
                "match_date_local": "2018-04-15T00:00:00",
                "home_official_name": "Washington Spirit",
                "away_official_name": "North Carolina Courage",
                "home_score": 2,
                "away_score": 4,
                "round_name": "Regular Season",
                "stadium_name": "Audi Field",
                "city_name": "Washington, DC",
            }
        ],
    )
    _write_csv(
        statsbomb_path,
        [
            {
                "match_id": 7430,
                "match_date": "2018-04-15",
                "home_team": "Washington Spirit",
                "away_team": "North Carolina Courage",
                "team": "Washington Spirit",
                "total_xg": 0.95,
            },
            {
                "match_id": 7430,
                "match_date": "2018-04-15",
                "home_team": "Washington Spirit",
                "away_team": "North Carolina Courage",
                "team": "North Carolina Courage",
                "total_xg": 2.15,
            },
        ],
    )

    matches = build_matches(repo_root)
    assert len(matches) == 1
    assert matches.loc[0, "home_team"] == "Washington Spirit"
    assert matches.loc[0, "away_team"] == "NC Courage"
    assert matches.loc[0, "home_xg"] == 0.95
    assert matches.loc[0, "away_npxg"] == 2.15


def test_build_matches_prefers_asa_xg_and_falls_back_to_goals(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    official_path = repo_root / "data" / "nwsl-official" / "nwsl_2021_official_matches.csv"

    _write_csv(
        official_path,
        [
            {
                "season": 2021,
                "match_id": "m1",
                "match_date_utc": "2021-05-01T00:00:00Z",
                "match_date_local": "2021-05-01T00:00:00",
                "home_official_name": "Kansas City Current",
                "away_official_name": "OL Reign",
                "home_score": 1,
                "away_score": 2,
                "round_name": "Regular Season",
                "stadium_name": "CMP",
                "city_name": "Kansas City",
            },
            {
                "season": 2021,
                "match_id": "m2",
                "match_date_utc": "2021-05-08T00:00:00Z",
                "match_date_local": "2021-05-08T00:00:00",
                "home_official_name": "Washington Spirit",
                "away_official_name": "Portland Thorns",
                "home_score": 0,
                "away_score": 0,
                "round_name": "Regular Season",
                "stadium_name": "Audi Field",
                "city_name": "Washington, DC",
            },
        ],
    )

    asa_match_xgoals = pd.DataFrame(
        [
            {
                "season": 2021,
                "match_date": "2021-05-01",
                "home_team": "Current",
                "away_team": "Reign",
                "home_xg": 1.42,
                "away_xg": 1.18,
                "home_xg_players": 1.4,
                "away_xg_players": 1.2,
            }
        ]
    )

    matches = build_matches(repo_root, asa_match_xgoals=asa_match_xgoals)
    match_one = matches.set_index("match_id").loc["m1"]
    match_two = matches.set_index("match_id").loc["m2"]
    assert match_one["home_xg"] == 1.42
    assert match_one["away_npxg"] == 1.18
    assert match_two["home_npxg"] == 0.0
    assert match_two["away_npxg"] == 0.0


def test_build_appearances_materializes_start_and_end_minutes(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    logs_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv"
    profiles_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_profiles.csv"

    _write_csv(
        logs_path,
        [
            {
                "player_id": "p1",
                "team_name": "Portland Thorns",
                "match_id": "match-1",
                "gamestarted": 1,
                "minsplayed": 90,
            },
            {
                "player_id": "p2",
                "team_name": "Portland Thorns",
                "match_id": "match-1",
                "gamestarted": 0,
                "minsplayed": 20,
                "totalsubon": 70,
            },
        ],
    )
    _write_csv(
        profiles_path,
        [
            {"player_id": "p1", "role_label": "Forward"},
            {"player_id": "p2", "role_label": "Midfielder"},
        ],
    )

    appearances = build_appearances(repo_root)
    assert set(appearances["player_id"]) == {"p1", "p2"}
    starter = appearances.set_index("player_id").loc["p1"]
    sub = appearances.set_index("player_id").loc["p2"]
    assert bool(starter["started_flag"]) is True
    assert starter["start_minute"] == 0
    assert starter["end_minute"] == 90
    assert bool(sub["started_flag"]) is False
    assert sub["start_minute"] == 70
    assert sub["end_minute"] == 90
    assert starter["position"] == "Forward"


def test_build_projected_lineups_prefers_recent_starters(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    matches_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_matches.csv"
    profiles_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_profiles.csv"
    logs_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_match_logs.csv"

    _write_csv(
        matches_path,
        [
            {
                "match_id": "upcoming-1",
                "match_date_utc": "2026-04-20T00:00:00Z",
                "status": "UPCOMING",
                "home_official_name": "Portland Thorns",
                "away_official_name": "Washington Spirit",
                "home_score": None,
                "away_score": None,
            }
        ],
    )
    _write_csv(
        profiles_path,
        [
            {"player_id": "starter-1", "team_name": "Portland Thorns", "player_status": "Active"},
            {"player_id": "bench-1", "team_name": "Portland Thorns", "player_status": "Active"},
            {"player_id": "starter-2", "team_name": "Washington Spirit", "player_status": "Active"},
        ],
    )
    _write_csv(
        logs_path,
        [
            {"player_id": "starter-1", "team_name": "Portland Thorns", "match_date_utc": "2026-03-01T00:00:00Z", "gamestarted": 1, "minsplayed": 90},
            {"player_id": "starter-1", "team_name": "Portland Thorns", "match_date_utc": "2026-03-08T00:00:00Z", "gamestarted": 1, "minsplayed": 88},
            {"player_id": "bench-1", "team_name": "Portland Thorns", "match_date_utc": "2026-03-01T00:00:00Z", "gamestarted": 0, "minsplayed": 15, "totalsubon": 75},
            {"player_id": "starter-2", "team_name": "Washington Spirit", "match_date_utc": "2026-03-08T00:00:00Z", "gamestarted": 1, "minsplayed": 87},
        ],
    )

    projected = build_projected_lineups(repo_root, timestamp="2026-04-07T00:00:00Z")
    portland_rows = projected[projected["team"] == "Portland Thorns"].set_index("player_id")
    assert bool(portland_rows.loc["starter-1", "projected_start"]) is True
    assert portland_rows.loc["starter-1", "projected_minutes"] > portland_rows.loc["bench-1", "projected_minutes"]


def test_build_projected_lineups_uses_last_season_role_proxy_when_current_logs_missing(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    matches_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_matches.csv"
    profiles_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_profiles.csv"
    player_stats_2025_path = repo_root / "data" / "nwsl-official" / "nwsl_2025_official_player_stats.csv"

    _write_csv(
        matches_path,
        [
            {
                "season": 2026,
                "match_id": "upcoming-1",
                "match_date_utc": "2026-04-20T00:00:00Z",
                "status": "UPCOMING",
                "home_official_name": "Portland Thorns",
                "away_official_name": "Washington Spirit",
                "home_score": None,
                "away_score": None,
            }
        ],
    )
    _write_csv(
        profiles_path,
        [
            {"player_id": "starter-proxy", "team_name": "Portland Thorns", "player_status": "Active", "role_label": "Forward"},
            {"player_id": "bench-proxy", "team_name": "Portland Thorns", "player_status": "Active", "role_label": "Forward"},
            {"player_id": "ws-1", "team_name": "Washington Spirit", "player_status": "Active", "role_label": "Midfielder"},
        ],
    )
    _write_csv(
        player_stats_2025_path,
        [
            {
                "season": 2025,
                "player_id": "starter-proxy",
                "team_official_name": "Portland Thorns",
                "display_name": "Starter Proxy",
                "role_label": "Forward",
                "minutes_played": 1800,
                "games_played": 24,
                "appearances": 24,
                "starts": 22,
                "substitute_on": 2,
                "substitute_off": 10,
                "goals": 8,
                "assists": 4,
                "xg": 7.2,
                "total_scoring_attempts": 40,
                "on_target_scoring_attempts": 18,
            },
            {
                "season": 2025,
                "player_id": "bench-proxy",
                "team_official_name": "Portland Thorns",
                "display_name": "Bench Proxy",
                "role_label": "Forward",
                "minutes_played": 320,
                "games_played": 18,
                "appearances": 18,
                "starts": 1,
                "substitute_on": 17,
                "substitute_off": 1,
                "goals": 1,
                "assists": 1,
                "xg": 0.8,
                "total_scoring_attempts": 8,
                "on_target_scoring_attempts": 3,
            },
            {
                "season": 2025,
                "player_id": "ws-1",
                "team_official_name": "Washington Spirit",
                "display_name": "WS Player",
                "role_label": "Midfielder",
                "minutes_played": 1400,
                "games_played": 22,
                "appearances": 22,
                "starts": 17,
                "substitute_on": 5,
                "substitute_off": 8,
                "goals": 2,
                "assists": 5,
                "xg": 1.9,
                "total_scoring_attempts": 20,
                "on_target_scoring_attempts": 7,
            },
        ],
    )

    projected = build_projected_lineups(repo_root, timestamp="2026-04-07T00:00:00Z")
    portland_rows = projected[projected["team"] == "Portland Thorns"].set_index("player_id")
    assert bool(portland_rows.loc["starter-proxy", "projected_start"]) is True
    assert portland_rows.loc["starter-proxy", "projected_minutes"] > portland_rows.loc["bench-proxy", "projected_minutes"]


def test_normalize_odds_contract_maps_common_columns() -> None:
    raw = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "book": "book-a",
                "market": "1x2",
                "home_price": 1.8,
                "draw_price": 3.2,
                "away_price": 4.1,
            }
        ]
    )
    normalized = normalize_odds_contract(raw)
    assert list(normalized.columns) == [
        "match_id",
        "timestamp",
        "sportsbook",
        "market_type",
        "line",
        "home_odds",
        "draw_odds",
        "away_odds",
        "over_odds",
        "under_odds",
        "source_type",
    ]
    assert normalized.loc[0, "sportsbook"] == "book-a"
    assert normalized.loc[0, "home_odds"] == 1.8
    assert normalized.loc[0, "source_type"] == "close"


def test_build_team_and_player_season_priors_from_official_stats(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    player_stats_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_player_stats.csv"
    team_stats_path = repo_root / "data" / "nwsl-official" / "nwsl_2026_official_team_stats.csv"

    _write_csv(
        player_stats_path,
        [
            {
                "season": 2026,
                "player_id": "p1",
                "team_official_name": "Portland Thorns",
                "display_name": "Sophia Wilson",
                "role_label": "Forward",
                "minutes_played": 900,
                "games_played": 10,
                "goals": 5,
                "assists": 3,
                "xg": 4.8,
                "total_scoring_attempts": 32,
                "on_target_scoring_attempts": 14,
            },
            {
                "season": 2026,
                "player_id": "p2",
                "team_official_name": "Washington Spirit",
                "display_name": "Ashley Hatch",
                "role_label": "Midfielder",
                "minutes_played": 720,
                "games_played": 10,
                "goals": 1,
                "assists": 4,
                "xg": 2.2,
                "total_scoring_attempts": 18,
                "on_target_scoring_attempts": 7,
            },
        ],
    )
    _write_csv(
        team_stats_path,
        [
            {
                "season": 2026,
                "official_name": "Portland Thorns",
                "games_played": 10,
                "goals": 18,
                "goals_against": 9,
                "total_shots": 120,
                "total_points": 21,
                "average_possession": 54.2,
            },
            {
                "season": 2026,
                "official_name": "Washington Spirit",
                "games_played": 10,
                "goals": 12,
                "goals_against": 11,
                "total_shots": 101,
                "total_points": 16,
                "average_possession": 50.6,
            },
        ],
    )

    asa_player = pd.DataFrame(
        [
            {
                "season": 2026,
                "team": "Portland Thorns",
                "player_name": "Sophia Wilson",
                "player_name_key": normalize_person_key("Sophia Wilson"),
                "position": "Forward",
                "minutes_played": 900,
                "asa_xgoals": 5.1,
                "asa_xassists": 1.9,
                "asa_points_added": 0.4,
                "asa_xpoints_added": 0.5,
                "asa_xg_plus_xa_per90": 0.7,
                "asa_gplus_raw_total": 0.3,
                "asa_gplus_above_avg_total": 0.2,
                "asa_gplus_above_avg_per90": 0.02,
            }
        ]
    )
    asa_team = pd.DataFrame(
        [
            {
                "season": 2026,
                "team": "Portland Thorns",
                "games_played": 10,
                "xg_per_match": 1.95,
                "xg_against_per_match": 0.88,
                "xpoints_per_match": 2.05,
                "gplus_for_per90": 0.12,
                "gplus_against_per90": -0.08,
                "gplus_net_per90": 0.2,
                "gplus_shooting_net_per90": 0.05,
                "gplus_passing_net_per90": 0.04,
                "gplus_receiving_net_per90": 0.03,
            }
        ]
    )

    player_priors = build_player_season_priors(repo_root, asa_player_analytics=asa_player)
    team_priors = build_team_season_priors(repo_root, player_priors, asa_team_analytics=asa_team)

    assert set(player_priors["player_id"]) == {"p1", "p2"}
    assert "season_value_score" in player_priors.columns
    assert "starter_rate" in player_priors.columns
    assert "role_proxy_score" in player_priors.columns
    sophia = player_priors.set_index("player_id").loc["p1"]
    assert sophia["player_name"] == "Sophia Wilson"
    assert sophia["asa_xgoals"] == 5.1
    assert sophia["starter_rate"] == 0.0
    portland = team_priors.set_index("team").loc["Portland Thorns"]
    assert portland["goals_per_match"] == 1.8
    assert portland["shots_per_match"] == 12.0
    assert portland["xg_per_match"] == 1.95
    assert portland["xpoints_per_match"] == 2.05
    assert portland["gplus_net_per90"] == 0.2


def test_build_dataset_filters_to_history_start_season(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    matches_path_2024 = repo_root / "data" / "nwsl-official" / "nwsl_2024_official_matches.csv"
    matches_path_2025 = repo_root / "data" / "nwsl-official" / "nwsl_2025_official_matches.csv"

    _write_csv(
        matches_path_2024,
        [
            {
                "season": 2024,
                "match_id": "m-2024",
                "match_date_utc": "2024-04-01T00:00:00Z",
                "match_date_local": "2024-04-01T00:00:00",
                "home_official_name": "Portland Thorns",
                "away_official_name": "Washington Spirit",
                "home_score": 1,
                "away_score": 0,
                "round_name": "Regular Season",
                "stadium_name": "Providence Park",
                "city_name": "Portland",
            }
        ],
    )
    _write_csv(
        matches_path_2025,
        [
            {
                "season": 2025,
                "match_id": "m-2025",
                "match_date_utc": "2025-04-01T00:00:00Z",
                "match_date_local": "2025-04-01T00:00:00",
                "home_official_name": "Portland Thorns",
                "away_official_name": "Washington Spirit",
                "home_score": 2,
                "away_score": 1,
                "round_name": "Regular Season",
                "stadium_name": "Providence Park",
                "city_name": "Portland",
            }
        ],
    )

    outputs = build_dataset(repo_root=repo_root, fetch_asa=False, history_start_season=2025)

    assert outputs.matches["season"].tolist() == [2025]
    assert outputs.refresh_manifest["history_start_season"] == 2025
    assert outputs.refresh_manifest["refresh_mode"] == "cache_first"
    assert any(batch["name"] == "official_match_archive" for batch in outputs.refresh_manifest["source_batches"])
    assert set(outputs.refresh_manifest["source_hooks"].keys()) == {"fbref_secondary", "espn_fallback"}
    assert outputs.manifest["refresh_manifest_path"] == "refresh_manifest.json"

    raw_dir = tmp_path / "raw"
    paths = write_dataset(outputs, raw_dir=raw_dir)
    assert paths["refresh_manifest"].exists()
    assert outputs.manifest["history_start_season"] == 2025
    assert outputs.manifest["matches"]["season_coverage"] == [2025]
