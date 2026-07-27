from __future__ import annotations

import copy
import json
import urllib.error
from datetime import datetime, timezone
from typing import Any

import pytest

from scripts.refresh_public_data import (
    API_ROOT,
    DataValidationError,
    OfficialApiClient,
    PUBLISHED_RAW_STATS_KEYS,
    ValidationLimits,
    _apply_finished_team_standings,
    _apply_season_fantasy_totals,
    _breakdown_fetch_jobs,
    _compact_raw_stats,
    _count_live_player_rows_excluded,
    _date_only,
    _fantasy_score,
    _finished_lineup_appearances,
    _finished_lineup_appearance_keys,
    _is_official_appearance,
    _lineup_appearance_teams_for_player,
    _match_core_stats,
    _merge_stats,
    _normalize_player_match_stats,
    _retry_delay,
    compute_payload_checksum,
    fetch_stats_category,
    finalize_payload,
    resolve_transfer_match_team,
    validate_payload,
)


TEAM_A = f"nwsl::Football_Team::{'1' * 32}"
TEAM_B = f"nwsl::Football_Team::{'2' * 32}"
TEAM_C = f"nwsl::Football_Team::{'3' * 32}"
MATCH_A = f"nwsl::Football_Match::{'a' * 32}"
PLAYER_ROUTE = "b" * 32
PLAYER_OFFICIAL = f"nwsl::Football_Player::{PLAYER_ROUTE}"
NOW = datetime(2026, 7, 26, 20, 0, tzinfo=timezone.utc)


class _Response:
    def __init__(self, payload: dict[str, Any], status: int = 200) -> None:
        self.status = status
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def read(self, _limit: int = -1) -> bytes:
        return self._body


def _minimal_payload() -> dict[str, Any]:
    payload = {
        "schemaVersion": 1,
        "season": 2026,
        "run": {
            "runKey": "",
            "seasonId": "nwsl::Football_Season::0b6761e4701749f593690c0f338da74c",
            "sourceProvider": "nwsl_official",
            "sourceUrl": API_ROOT,
            "generatedAt": "2026-07-26T20:00:00Z",
            "fetchedAt": "2026-07-26T20:00:00Z",
            "metadata": {
                "aggregatePlayerSeasonRows": 1,
                "finishedLineupAppearances": 1,
                "statBearingMatchAppearances": 1,
                "lineupOnlyAppearancesExcluded": 0,
                "matchStatsCompletePlayers": 1,
                "matchStatsIncompletePlayers": 0,
            },
        },
        "teams": [
            {"id": TEAM_A, "slug": "team-a"},
            {"id": TEAM_B, "slug": "team-b"},
        ],
        "players": [
            {
                "id": PLAYER_ROUTE,
                "officialId": PLAYER_OFFICIAL,
                "currentTeamId": TEAM_A,
            }
        ],
        "matches": [
            {
                "id": MATCH_A,
                "status": "FINISHED",
                "kickoffAt": "2026-07-25T20:00:00Z",
                "homeTeamId": TEAM_A,
                "awayTeamId": TEAM_B,
                "homeScore": 1,
                "awayScore": 0,
            }
        ],
        "playerSeasonStats": [
            {
                "playerId": PLAYER_ROUTE,
                "teamId": TEAM_A,
                "gamesPlayed": 1,
                "matchStatsAppearances": 1,
                "matchStatsComplete": True,
                "minutesPlayed": 90,
                "fantasyPoints": 1.0,
                "rawStats": {},
            }
        ],
        "teamSeasonStats": [
            {
                "teamId": TEAM_A,
                "gamesPlayed": 1,
                "wins": 1,
                "draws": 0,
                "losses": 0,
                "points": 3,
                "goalsFor": 1,
                "goalsAgainst": 0,
                "goalDifference": 1,
                "rawStats": {},
            },
            {
                "teamId": TEAM_B,
                "gamesPlayed": 1,
                "wins": 0,
                "draws": 0,
                "losses": 1,
                "points": 0,
                "goalsFor": 0,
                "goalsAgainst": 1,
                "goalDifference": -1,
                "rawStats": {},
            },
        ],
        "playerMatchStats": [
            {
                "playerId": PLAYER_ROUTE,
                "matchId": MATCH_A,
                "teamId": TEAM_A,
                "opponentTeamId": TEAM_B,
                "isHome": True,
                "fantasyPoints": 1.0,
                "fantasyBreakdown": {"appearance": 1.0},
                "rawStats": {},
            }
        ],
    }
    return finalize_payload(payload)


TEST_LIMITS = ValidationLimits(
    exact_teams=2,
    min_players=1,
    min_matches=1,
    min_player_season_stats=1,
    max_payload_bytes=100_000,
)


def test_official_client_retries_429_and_timeout_with_deterministic_backoff() -> None:
    outcomes: list[Any] = [
        urllib.error.HTTPError("https://example.test", 429, "rate limited", {}, None),
        TimeoutError("slow"),
        _Response({"ok": True}),
    ]
    sleeps: list[float] = []
    calls: list[float] = []

    def opener(_request: Any, *, timeout: float) -> Any:
        calls.append(timeout)
        outcome = outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    client = OfficialApiClient(
        timeout=3.0,
        max_attempts=4,
        base_delay=0.1,
        max_delay=2.0,
        opener=opener,
        sleep=sleeps.append,
    )
    url = "https://example.test/data"

    assert client.get_json(url) == {"ok": True}
    assert calls == [3.0, 3.0, 3.0]
    assert sleeps == [
        _retry_delay(url, 0, base_delay=0.1, max_delay=2.0),
        _retry_delay(url, 1, base_delay=0.1, max_delay=2.0),
    ]


def test_provider_birth_timestamp_normalizes_to_contract_date() -> None:
    assert (
        _date_only(
            "2000-05-17T00:00:00Z",
            field="player dateOfBirth",
        )
        == "2000-05-17"
    )
    assert _date_only("1999-07-02", field="player dateOfBirth") == "1999-07-02"
    with pytest.raises(DataValidationError, match="not a valid date"):
        _date_only("07/02/1999", field="player dateOfBirth")


def test_fetch_stats_category_walks_mocked_pagination_without_dropping_rows() -> None:
    class FakeClient:
        def __init__(self) -> None:
            self.pages: list[int] = []

        def get_json(self, url: str) -> dict[str, Any]:
            page = int(url.split("page=")[1].split("&")[0])
            self.pages.append(page)
            return {
                "players": [{"playerId": f"p{page}"}],
                "pagination": {"isLastPage": page == 2},
            }

    client = FakeClient()
    result = fetch_stats_category(
        client,  # type: ignore[arg-type]
        entity="players",
        category="general",
    )

    assert client.pages == [1, 2]
    assert result == [{"playerId": "p1"}, {"playerId": "p2"}]


def test_merge_stats_preserves_conflicting_category_value_under_stable_key() -> None:
    merged: dict[str, int | float | str | bool | None] = {
        "games_played": 15,
        "accurate_pass": 400,
    }

    _merge_stats(
        merged,
        {"games_played": 15, "accurate_pass": 401},
        category="passing",
    )

    assert merged == {
        "games_played": 15,
        "accurate_pass": 400,
        "passing__accurate_pass": 401,
    }


def test_official_appearance_filter_excludes_zero_stat_roster_rows() -> None:
    assert not _is_official_appearance(
        {"minutes": 0, "formation_place": 0}
    )
    assert _is_official_appearance({"minutes": 15})
    assert _is_official_appearance({"minutes": 0, "game_started": 1})
    assert _is_official_appearance({"minutes": 0, "total_sub_on": 1})


@pytest.mark.parametrize(
    ("raw", "attempted", "completed", "accuracy"),
    [
        (
            {
                "accurate_pass": 2,
                "total_pass": 1,
                "pass_attempts": 1,
                "missed_passes": 1,
            },
            3,
            2,
            66.6667,
        ),
        (
            {
                "accurate_pass": 1,
                "total_pass": 0,
                "pass_attempts": 0,
                "missed_passes": 0,
            },
            1,
            1,
            100.0,
        ),
    ],
)
def test_match_pass_attempts_include_official_accurate_crosses(
    raw: dict[str, Any],
    attempted: int,
    completed: int,
    accuracy: float,
) -> None:
    core = _match_core_stats(raw)

    assert core["passesAttempted"] == attempted
    assert core["passesCompleted"] == completed
    assert core["passAccuracyPct"] == accuracy


def test_lineup_appearance_filter_excludes_unused_bench_player() -> None:
    payload = {
        "home": {
            "teamId": TEAM_A,
            "fielded": [{"playerId": PLAYER_OFFICIAL}],
            "benched": [],
        },
        "away": {
            "teamId": TEAM_B,
            "fielded": [],
            "benched": [
                {"playerId": "unused", "events": []},
                {
                    "playerId": "substitute",
                    "events": [{"type": "substitution-in", "time": 90}],
                },
            ],
        },
    }

    assert _lineup_appearance_teams_for_player(payload, PLAYER_OFFICIAL) == {
        TEAM_A
    }
    assert _lineup_appearance_teams_for_player(payload, "unused") == set()
    assert _lineup_appearance_teams_for_player(payload, "substitute") == {
        TEAM_B
    }


def test_lineup_only_appearance_is_explicitly_excluded_from_stat_ledger() -> None:
    breakdowns = {
        PLAYER_OFFICIAL: {
            "matches": [
                {
                    "match": {
                        "matchId": MATCH_A,
                        "home": {"teamId": TEAM_A},
                        "away": {"teamId": TEAM_B},
                    },
                    "playerStats": [
                        {"statsId": "minutes", "statsValue": 0},
                    ],
                }
            ]
        }
    }
    lineup = {
        "home": {
            "teamId": TEAM_A,
            "fielded": [{"playerId": PLAYER_OFFICIAL}],
            "benched": [],
        },
        "away": {"teamId": TEAM_B, "fielded": [], "benched": []},
    }

    rows = _normalize_player_match_stats(
        breakdowns=breakdowns,
        candidates_by_player={PLAYER_OFFICIAL: {TEAM_A}},
        positions_by_player={PLAYER_ROUTE: "MID"},
        matches_by_id={
            MATCH_A: {
                "id": MATCH_A,
                "status": "FINISHED",
                "homeTeamId": TEAM_A,
                "awayTeamId": TEAM_B,
                "homeScore": 1,
                "awayScore": 0,
            },
        },
        lineups_by_match_id={MATCH_A: lineup},
    )
    official_appearances = _finished_lineup_appearances({MATCH_A: lineup})
    lineup_keys = _finished_lineup_appearance_keys(
        official_appearances,
        {PLAYER_OFFICIAL: PLAYER_ROUTE},
    )

    assert rows == []
    assert lineup_keys == {(PLAYER_ROUTE, MATCH_A)}


def test_zero_aggregate_debutant_is_added_to_breakdown_fetch_jobs() -> None:
    jobs = _breakdown_fetch_jobs(
        aggregate_positive_teams={},
        lineup_appearances={(PLAYER_OFFICIAL, MATCH_A, TEAM_A)},
        candidates_by_player={PLAYER_OFFICIAL: {TEAM_A}},
        current_teams_by_player={PLAYER_OFFICIAL: TEAM_A},
    )

    assert jobs == [(PLAYER_OFFICIAL, TEAM_A)]


def test_transfer_resolution_uses_exact_candidate_intersection_and_lineup() -> None:
    ordinary_match = {
        "id": MATCH_A,
        "homeTeamId": TEAM_A,
        "awayTeamId": TEAM_C,
    }
    assert (
        resolve_transfer_match_team(ordinary_match, {TEAM_A, TEAM_B})
        == TEAM_A
    )

    former_versus_current = {
        "id": MATCH_A,
        "homeTeamId": TEAM_A,
        "awayTeamId": TEAM_B,
    }
    assert (
        resolve_transfer_match_team(
            former_versus_current,
            {TEAM_A, TEAM_B},
            lineup_team_ids={TEAM_B},
        )
        == TEAM_B
    )
    with pytest.raises(DataValidationError, match="exact transfer team"):
        resolve_transfer_match_team(former_versus_current, {TEAM_A, TEAM_B})
    with pytest.raises(DataValidationError, match="0 candidate sides"):
        resolve_transfer_match_team(former_versus_current, {TEAM_C})


def test_validation_rejects_duplicate_player_match_key() -> None:
    payload = _minimal_payload()
    payload["playerMatchStats"].append(copy.deepcopy(payload["playerMatchStats"][0]))
    finalize_payload(payload)

    with pytest.raises(DataValidationError, match="duplicate player-match keys"):
        validate_payload(payload, limits=TEST_LIMITS, now=NOW)


def test_validation_rejects_missing_finished_match_coverage() -> None:
    payload = _minimal_payload()
    payload["playerMatchStats"] = []
    finalize_payload(payload)

    with pytest.raises(DataValidationError, match="FINISHED matches lack"):
        validate_payload(payload, limits=TEST_LIMITS, now=NOW)


def test_checksum_is_stable_across_order_and_runtime_metadata() -> None:
    payload = _minimal_payload()
    expected = compute_payload_checksum(payload)
    original_run_key = payload["run"]["runKey"]
    reordered = copy.deepcopy(payload)
    reordered["teams"].reverse()
    reordered["run"]["runKey"] = "ignored"
    reordered["run"]["generatedAt"] = "2026-07-27T20:00:00Z"
    reordered["run"]["fetchedAt"] = "2026-07-27T20:00:00Z"
    reordered["run"]["metadata"]["payloadChecksum"] = "0" * 64

    assert compute_payload_checksum(reordered) == expected
    finalize_payload(reordered)
    assert reordered["run"]["metadata"]["payloadChecksum"] == expected
    assert reordered["run"]["runKey"] != original_run_key
    assert "20260727T200000Z" in reordered["run"]["runKey"]

    exact_retry = copy.deepcopy(payload)
    finalize_payload(exact_retry)
    assert exact_retry["run"]["runKey"] == original_run_key

    changed = copy.deepcopy(payload)
    changed["playerSeasonStats"][0]["gamesPlayed"] = 2
    assert compute_payload_checksum(changed) != expected


def _player_season_row_for_reconciliation(games_played: int) -> dict[str, Any]:
    return {
        "playerId": PLAYER_ROUTE,
        "gamesPlayed": games_played,
        "minutesPlayed": 90.0 * games_played,
        "goals": 0,
        "assists": 0,
        "shots": 0,
        "shotsOnTarget": 0,
        "xg": 0.0,
        "passesAttempted": 0,
        "passesCompleted": 0,
        "passAccuracyPct": 0.0,
        "chancesCreated": 0,
        "tackles": 0,
        "tacklesWon": 0,
        "interceptions": 0,
        "clearances": 0,
        "saves": 0,
        "goalsConceded": 0,
        "yellowCards": 0,
        "redCards": 0,
        "fantasyPoints": 0.0,
        "pointsPer90": 0.0,
    }


def _player_match_row_for_reconciliation(
    *,
    match_id: str,
    minutes: float,
    goals: int,
    fantasy_points: float,
) -> dict[str, Any]:
    return {
        "playerId": PLAYER_ROUTE,
        "matchId": match_id,
        "minutes": minutes,
        "goals": goals,
        "assists": 1,
        "shots": 2,
        "shotsOnTarget": 1,
        "xg": 0.25,
        "passesAttempted": 20,
        "passesCompleted": 15,
        "chancesCreated": 1,
        "tackles": 2,
        "tacklesWon": 1,
        "interceptions": 1,
        "clearances": 0,
        "saves": 0,
        "goalsConceded": 0,
        "yellowCards": 0,
        "redCards": 0,
        "fantasyPoints": fantasy_points,
    }


def test_finished_feed_ahead_replaces_lagging_player_aggregate() -> None:
    season = [_player_season_row_for_reconciliation(1)]
    finished = [
        _player_match_row_for_reconciliation(
            match_id=MATCH_A,
            minutes=90,
            goals=1,
            fantasy_points=12,
        ),
        _player_match_row_for_reconciliation(
            match_id=f"nwsl::Football_Match::{'c' * 32}",
            minutes=45,
            goals=0,
            fantasy_points=4,
        ),
    ]

    report = _apply_season_fantasy_totals(
        season,
        finished,
        {
            (PLAYER_ROUTE, MATCH_A),
            (PLAYER_ROUTE, f"nwsl::Football_Match::{'c' * 32}"),
        },
    )

    assert report["aggregateGamesPlayedMismatches"] == 1
    assert report["aggregatePlayerAdditiveMismatches"] == 1
    assert season[0]["gamesPlayed"] == 2
    assert season[0]["matchStatsAppearances"] == 2
    assert season[0]["matchStatsComplete"] is True
    assert season[0]["minutesPlayed"] == 135
    assert season[0]["goals"] == 1
    assert season[0]["assists"] == 2
    assert season[0]["passesAttempted"] == 40
    assert season[0]["passesCompleted"] == 30
    assert season[0]["passAccuracyPct"] == 75
    assert season[0]["xg"] == 0.5
    assert season[0]["fantasyPoints"] == 16
    assert season[0]["pointsPer90"] == pytest.approx(10.6667)


def test_exact_finished_rows_replace_provider_aggregate_overcount() -> None:
    season = [_player_season_row_for_reconciliation(2)]
    finished = [
        _player_match_row_for_reconciliation(
            match_id=MATCH_A,
            minutes=62,
            goals=0,
            fantasy_points=5,
        )
    ]

    report = _apply_season_fantasy_totals(
        season,
        finished,
        {(PLAYER_ROUTE, MATCH_A)},
    )

    assert report["aggregateGamesPlayedMismatches"] == 1
    assert season[0]["gamesPlayed"] == 1
    assert season[0]["matchStatsAppearances"] == 1
    assert season[0]["matchStatsComplete"] is True
    assert season[0]["minutesPlayed"] == 62
    assert season[0]["fantasyPoints"] == 5
    assert season[0]["pointsPer90"] == pytest.approx(7.2581)


def test_incomplete_match_coverage_preserves_official_additive_season_totals() -> None:
    season = [_player_season_row_for_reconciliation(2)]
    season[0]["minutesPlayed"] = 101
    season[0]["goals"] = 2
    tracked = [
        _player_match_row_for_reconciliation(
            match_id=MATCH_A,
            minutes=20,
            goals=0,
            fantasy_points=3,
        )
    ]
    missing_match = f"nwsl::Football_Match::{'f' * 32}"

    report = _apply_season_fantasy_totals(
        season,
        tracked,
        {(PLAYER_ROUTE, MATCH_A), (PLAYER_ROUTE, missing_match)},
    )

    assert report["matchStatsIncompletePlayers"] == 1
    assert season[0]["gamesPlayed"] == 2
    assert season[0]["matchStatsAppearances"] == 1
    assert season[0]["matchStatsComplete"] is False
    assert season[0]["minutesPlayed"] == 101
    assert season[0]["goals"] == 2
    assert season[0]["fantasyPoints"] == 3
    assert season[0]["pointsPer90"] == 13.5


def test_live_player_rows_are_counted_but_never_normalized_as_finished() -> None:
    live_match = f"nwsl::Football_Match::{'d' * 32}"
    breakdowns = {
        PLAYER_OFFICIAL: {
            "matches": [
                    {
                        "match": {"matchId": live_match},
                        "playerStats": [
                            {"statsId": "minutes", "statsValue": 27},
                        ],
                    },
                    {
                        "match": {"matchId": live_match},
                        "playerStats": [
                            {"statsId": "minutes", "statsValue": 0},
                        ],
                    },
            ]
        }
    }

    assert (
        _count_live_player_rows_excluded(
            breakdowns=breakdowns,
            matches_by_id={live_match: {"status": "LIVE"}},
        )
        == 1
    )


def test_finished_matches_replace_lagging_team_standings() -> None:
    rows = [
        {
            "teamId": TEAM_A,
            "gamesPlayed": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "points": 0,
            "goalsFor": 0,
            "goalsAgainst": 0,
            "goalDifference": 0,
            "xg": 99.0,
        },
        {
            "teamId": TEAM_B,
            "gamesPlayed": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "points": 0,
            "goalsFor": 0,
            "goalsAgainst": 0,
            "goalDifference": 0,
            "xg": 88.0,
        },
    ]
    matches = [
        {
            "id": MATCH_A,
            "status": "FINISHED",
            "homeTeamId": TEAM_A,
            "awayTeamId": TEAM_B,
            "homeScore": 2,
            "awayScore": 1,
        },
        {
            "id": f"nwsl::Football_Match::{'e' * 32}",
            "status": "LIVE",
            "homeTeamId": TEAM_B,
            "awayTeamId": TEAM_A,
            "homeScore": 1,
            "awayScore": 1,
        },
    ]

    report = _apply_finished_team_standings(rows, matches)

    assert report == {"aggregateTeamStandingsMismatches": 2}
    assert rows[0] == {
        "teamId": TEAM_A,
        "gamesPlayed": 1,
        "wins": 1,
        "draws": 0,
        "losses": 0,
        "points": 3,
        "goalsFor": 2,
        "goalsAgainst": 1,
        "goalDifference": 1,
        "xg": 99.0,
    }
    assert rows[1]["gamesPlayed"] == 1
    assert rows[1]["losses"] == 1
    assert rows[1]["points"] == 0
    assert rows[1]["xg"] == 88.0


def test_published_raw_stats_are_empty_and_fantasy_breakdown_is_sparse() -> None:
    core = {
        "minutes": 90,
        "goals": 0,
        "assists": 0,
        "shots": 0,
        "shotsOnTarget": 0,
        "passesCompleted": 10,
        "chancesCreated": 0,
        "tacklesWon": 0,
        "interceptions": 0,
        "saves": 0,
        "goalsConceded": 0,
        "yellowCards": 0,
        "redCards": 0,
    }
    scoring = {
        "successful_crosses": 0,
        "fouls_won": 0,
        "fouls_committed": 0,
        "blocks": 0,
        "clean_sheet": False,
        "penalty_saves": 0,
        "penalty_misses": 0,
        "penalty_conceded": 0,
        "own_goals": 0,
        "goalkeeper_win": False,
        "goalkeeper_draw": False,
    }

    total, breakdown = _fantasy_score(
        position="MID",
        core=core,
        scoring=scoring,
    )

    assert _compact_raw_stats({"minutes": 90}, PUBLISHED_RAW_STATS_KEYS) == {}
    assert _compact_raw_stats(
        {
            "successful_crosses": 2,
            "fouls_won": 0,
            "blocks": 0.0,
            "clean_sheet": False,
            "goalkeeper_win": True,
            "penalty_saves": None,
        },
        PUBLISHED_RAW_STATS_KEYS,
    ) == {
        "goalkeeper_win": True,
        "successful_crosses": 2,
    }
    assert breakdown == {
        "appearance": 1.0,
        "minutes60Plus": 1.0,
        "successfulPasses": 0.3,
    }
    assert total == 2.3


def _observed_shape_payload() -> dict[str, Any]:
    team_ids = [
        f"nwsl::Football_Team::{index + 1:032x}"
        for index in range(16)
    ]
    players = []
    player_season_stats = []
    for index in range(455):
        route_id = f"{index + 1_000:032x}"
        team_id = team_ids[index % len(team_ids)]
        players.append(
            {
                "id": route_id,
                "officialId": f"nwsl::Football_Player::{route_id}",
                "providerId": f"provider-player-{index:03d}",
                "slug": f"representative-player-{index:03d}",
                "displayName": f"Representative Player {index:03d}",
                "firstName": "Representative",
                "lastName": f"Player {index:03d}",
                "currentTeamId": team_id,
                "position": ("GK", "DEF", "MID", "FWD")[index % 4],
                "playerStatus": "active",
                "jerseyNumber": index % 100,
                "dateOfBirth": "1998-01-01",
                "nationality": "United States",
                "nationalityCode": "USA",
            }
        )
        player_season_stats.append(
            {
                "playerId": route_id,
                "teamId": team_id,
                "gamesPlayed": 4,
                "matchStatsAppearances": 4,
                "matchStatsComplete": True,
                "starts": 3,
                "minutesPlayed": 315,
                "goals": 1,
                "assists": 1,
                "shots": 7,
                "shotsOnTarget": 3,
                "xg": 1.2345,
                "xa": 0.9876,
                "passesAttempted": 125,
                "passesCompleted": 101,
                "passAccuracyPct": 80.8,
                "chancesCreated": 5,
                "tackles": 8,
                "tacklesWon": 6,
                "interceptions": 3,
                "clearances": 4,
                "cleanSheets": 1,
                "saves": 0,
                "goalsConceded": 2,
                "yellowCards": 1,
                "redCards": 0,
                "fantasyPoints": 33.75,
                "pointsPer90": 9.6429,
                "rawStats": {},
            }
        )

    matches = []
    for index in range(240):
        home_index = index % 16
        away_index = (index + 1 + index // 16) % 16
        if home_index == away_index:
            away_index = (away_index + 1) % 16
        finished = index < 125
        matches.append(
            {
                "id": f"nwsl::Football_Match::{index + 2_000:032x}",
                "providerId": f"provider-match-{index:03d}",
                "status": "FINISHED" if finished else "UPCOMING",
                "phase": "REGULAR_SEASON",
                "kickoffAt": "2026-07-25T23:00:00Z",
                "localDate": "2026-07-25",
                "homeTeamId": team_ids[home_index],
                "awayTeamId": team_ids[away_index],
                "homeScore": 2 if finished else None,
                "awayScore": 1 if finished else None,
                "venue": "Representative Soccer Stadium",
                "city": "Representative City",
                "roundName": f"Matchweek {index // 8 + 1}",
                "matchWeek": index // 8 + 1,
            }
        )

    player_match_stats = []
    for index in range(1_800):
        player = players[index % len(players)]
        match = matches[index % 125]
        player_match_stats.append(
            {
                "playerId": player["id"],
                "matchId": match["id"],
                "teamId": match["homeTeamId"],
                "opponentTeamId": match["awayTeamId"],
                "isHome": True,
                "minutes": 78,
                "goals": 1,
                "assists": 1,
                "shots": 3,
                "shotsOnTarget": 2,
                "xg": 0.4567,
                "passesAttempted": 34,
                "passesCompleted": 28,
                "passAccuracyPct": 82.3529,
                "chancesCreated": 2,
                "tackles": 3,
                "tacklesWon": 2,
                "interceptions": 1,
                "clearances": 1,
                "saves": 0,
                "goalsConceded": 1,
                "yellowCards": 0,
                "redCards": 0,
                "fantasyPoints": 19.34,
                "fantasyBreakdown": {
                    "appearance": 1,
                    "minutes60Plus": 1,
                    "goals": 8,
                    "assists": 5,
                    "shots": 1.5,
                    "shotsOnTarget": 4,
                    "successfulPasses": 0.84,
                    "interceptions": 0.5,
                    "goalsConceded": -0.5,
                },
                "rawStats": {
                    "blocks": 1,
                    "fouls_committed": 2,
                    "fouls_won": 1,
                    "successful_crosses": 2,
                },
            }
        )

    team_season_stats = []
    for index, team_id in enumerate(team_ids):
        team_season_stats.append(
            {
                "teamId": team_id,
                "gamesPlayed": 16,
                "wins": 7,
                "draws": 4,
                "losses": 5,
                "points": 25,
                "goalsFor": 24,
                "goalsAgainst": 20,
                "goalDifference": 4,
                "cleanSheets": 5,
                "shots": 210,
                "shotsOnTarget": 84,
                "xg": 22.4567,
                "xga": 19.7654,
                "possessionPct": 51.2345,
                "passesAttempted": 7_400,
                "passesCompleted": 5_900,
                "passAccuracyPct": 79.7297,
                "chancesCreated": 155,
                "tackles": 225,
                "tacklesWon": 145,
                "interceptions": 118,
                "yellowCards": 22,
                "redCards": 1,
                "corners": 88,
                "rawStats": {},
            }
        )

    return {
        "schemaVersion": 1,
        "season": 2026,
        "run": {
            "runKey": "nwsl-data:2026:mock",
            "seasonId": "nwsl::Football_Season::0b6761e4701749f593690c0f338da74c",
            "sourceProvider": "nwsl_official",
            "sourceUrl": API_ROOT,
            "generatedAt": "2026-07-26T20:00:00Z",
            "fetchedAt": "2026-07-26T20:00:00Z",
            "metadata": {
                "payloadChecksum": "0" * 64,
                "playerStatsScope": "finished_matches_only",
            },
        },
        "teams": [
            {
                "id": team_id,
                "providerId": f"provider-team-{index:02d}",
                "slug": f"representative-team-{index:02d}",
                "name": f"Representative Team {index:02d}",
                "abbreviation": f"T{index:02d}",
                "mediaName": f"Team {index:02d}",
                "websiteUrl": "https://example.com/team",
                "isActive": True,
            }
            for index, team_id in enumerate(team_ids)
        ],
        "players": players,
        "matches": matches,
        "playerSeasonStats": player_season_stats,
        "teamSeasonStats": team_season_stats,
        "playerMatchStats": player_match_stats,
    }


def test_mocked_observed_shape_stays_below_vercel_publish_body_limit() -> None:
    payload = _observed_shape_payload()
    compact_bytes = len(
        json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )

    assert compact_bytes < 4_400_000
