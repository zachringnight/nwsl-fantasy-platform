import pandas as pd

from scripts.fetch_official_player_appearances import build_appearance_rows
from src.data.official_api import (
    flatten_match_lineup,
    flatten_matches,
    flatten_player_stats,
    flatten_team_stats,
    merge_category_frames,
    stat_column_name,
)


def test_stat_column_name_normalizes_official_labels() -> None:
    assert stat_column_name({"statsId": "games-played"}) == "games_played"
    assert stat_column_name({"statsId": "Xg"}) == "xg"
    assert stat_column_name({"statsId": "Shots On Target ( inc goals )"}) == "shots_on_target_inc_goals"


def test_flatten_and_merge_player_stats_categories() -> None:
    general = flatten_player_stats(
        [
            {
                "playerId": "p1",
                "providerId": "opta:p1",
                "team": {"teamId": "t1", "officialName": "Bay FC"},
                "mediaFirstName": "A",
                "mediaLastName": "Player",
                "roleLabel": "Forward",
                "stats": [
                    {"statsId": "games-played", "statsValue": 10},
                    {"statsId": "Starts", "statsValue": 8},
                ],
            }
        ],
        season=2026,
        season_id="s1",
        category="general",
    )
    passing = flatten_player_stats(
        [{"playerId": "p1", "team": {"teamId": "t1"}, "stats": [{"statsId": "accurate-pass", "statsValue": 300}]}],
        season=2026,
        season_id="s1",
        category="passing",
    )

    merged = merge_category_frames([general, passing], key="player_id")

    assert merged.loc[0, "player_id"] == "p1"
    assert merged.loc[0, "games_played"] == 10
    assert merged.loc[0, "starts"] == 8
    assert merged.loc[0, "accurate_pass"] == 300
    assert bool(merged.loc[0, "source_category_general"]) is True
    assert bool(merged.loc[0, "source_category_passing"]) is True


def test_flatten_matches_uses_current_status_and_scores() -> None:
    matches = flatten_matches(
        [
            {
                "matchId": "m1",
                "providerId": "opta:m1",
                "status": "FINISHED",
                "providerStatus": "Played",
                "phase": "FULL_TIME",
                "matchDateUtc": "2026-05-24T00:00:00Z",
                "home": {"teamId": "h", "officialName": "Home FC"},
                "away": {"teamId": "a", "officialName": "Away FC"},
                "providerHomeScore": 2,
                "providerAwayScore": 1,
                "editorial": {"highlightsUrl": "https://example.test/highlights"},
            }
        ],
        season=2026,
        season_id="s1",
    )

    assert matches.loc[0, "status"] == "FINISHED"
    assert matches.loc[0, "home_score"] == 2
    assert matches.loc[0, "away_official_name"] == "Away FC"


def test_flatten_team_stats() -> None:
    teams = flatten_team_stats(
        [
            {
                "teamId": "t1",
                "officialName": "Bay FC",
                "stats": [
                    {"statsId": "games-played", "statsValue": 10},
                    {"statsId": "total-points", "statsValue": 18},
                ],
            }
        ],
        season=2026,
        season_id="s1",
        category="general",
    )

    assert isinstance(teams, pd.DataFrame)
    assert teams.loc[0, "games_played"] == 10
    assert teams.loc[0, "total_points"] == 18


def _lineup_payload() -> dict:
    return {
        "home": {
            "teamId": "home::1",
            "officialName": "Orlando Pride",
            "fielded": [
                {
                    "playerId": "p_full",
                    "roleLabel": "Goalkeeper",
                    "shortName": "A. Keeper",
                    "events": [],
                },
                {
                    "playerId": "p_subout",
                    "roleLabel": "Defender",
                    "shortName": "B. Defender",
                    "events": [
                        {"type": "substitution-out", "time": 63, "additionalTime": 0},
                        {"type": "yellow-card", "time": 40, "additionalTime": 0},
                    ],
                },
            ],
            "benched": [
                {
                    "playerId": "p_subin",
                    "roleLabel": "Midfielder",
                    "shortName": "C. Sub",
                    "events": [
                        {"type": "substitution-in", "time": 63, "additionalTime": 0},
                    ],
                },
                {
                    "playerId": "p_unused",
                    "roleLabel": "Forward",
                    "shortName": "D. Unused",
                    "events": [],
                },
            ],
        },
        "away": {
            "teamId": "away::2",
            "officialName": "Bay FC",
            "fielded": [
                {
                    "playerId": "p_away_full",
                    "roleLabel": "Forward",
                    "shortName": "E. Striker",
                    "events": [],
                }
            ],
            "benched": [],
        },
    }


def test_flatten_match_lineup_derives_starts_and_minutes() -> None:
    rows = flatten_match_lineup(
        _lineup_payload(),
        match_id="m1",
        season=2025,
        regulation_minutes=90,
    )

    # Unused bench player (no substitution-in) is excluded; 3 home + 1 away = 4 rows.
    assert len(rows) == 4
    assert set(rows["player_id"]) == {"p_full", "p_subout", "p_subin", "p_away_full"}
    assert (rows["match_id"] == "m1").all()
    assert (rows["season"] == 2025).all()

    full = rows.set_index("player_id").loc["p_full"]
    assert int(full["gamestarted"]) == 1
    assert int(full["minsplayed"]) == 90
    assert int(full["totalsubon"]) == 0
    assert full["team_name"] == "Orlando Pride"
    assert full["role_label"] == "Goalkeeper"

    subout = rows.set_index("player_id").loc["p_subout"]
    assert int(subout["gamestarted"]) == 1
    assert int(subout["minsplayed"]) == 63

    subin = rows.set_index("player_id").loc["p_subin"]
    assert int(subin["gamestarted"]) == 0
    assert int(subin["totalsubon"]) == 63
    assert int(subin["minsplayed"]) == 27
    assert subin["team_name"] == "Orlando Pride"

    away = rows.set_index("player_id").loc["p_away_full"]
    assert away["team_name"] == "Bay FC"
    assert int(away["minsplayed"]) == 90


def test_build_appearance_rows_carries_match_date_utc() -> None:
    match = {
        "matchId": "api-m1",
        "matchDateUtc": "2026-05-24T00:00:00Z",
    }
    rows = build_appearance_rows(
        match,
        _lineup_payload(),
        target_id="m1",
        season=2026,
    )

    assert not rows.empty
    assert "match_date_utc" in rows.columns
    assert (rows["match_date_utc"] == "2026-05-24T00:00:00Z").all()
    assert (rows["match_id"] == "m1").all()
    assert (rows["season"] == 2026).all()


def test_build_appearance_rows_output_is_superset_for_projected_lineups() -> None:
    """build_projected_lineups requires match_date_utc on the written CSV."""
    match = {"matchId": "api-m1", "matchDateUtc": "2026-05-24T00:00:00Z"}
    rows = build_appearance_rows(
        match,
        _lineup_payload(),
        target_id="m1",
        season=2026,
    )

    required_columns = {"match_id", "player_id", "gamestarted", "match_date_utc"}
    assert required_columns.issubset(set(rows.columns))
