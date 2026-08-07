"""Non-penalty xG derivation from ASA shot-pattern splits.

ASA's game feed exposes only total team xG, which includes penalties. The model
trains on `home_npxg`/`away_npxg`, so copying total xG into those columns
inflates every scoring rate by the league's penalty share (about 8% of xG in
2026). These tests pin the subtraction that produces real npxG.
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.data.asa import _fetch_match_xgoals, attach_non_penalty_xg


def _games() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "asa_game_id": "g1",
                "home_team_id": "H",
                "away_team_id": "A",
                "home_xg": 2.00,
                "away_xg": 1.50,
            },
            {
                "asa_game_id": "g2",
                "home_team_id": "A",
                "away_team_id": "H",
                "home_xg": 1.00,
                "away_xg": 0.80,
            },
        ]
    )


def test_subtracts_penalty_xg_from_each_side() -> None:
    penalties = pd.DataFrame(
        [
            {"game_id": "g1", "team_id": "H", "xgoals_for": 0.76},
            {"game_id": "g1", "team_id": "A", "xgoals_for": 0.76},
        ]
    )

    result = attach_non_penalty_xg(_games(), penalties)

    row = result[result["asa_game_id"] == "g1"].iloc[0]
    assert row["home_npxg"] == pytest.approx(1.24)
    assert row["away_npxg"] == pytest.approx(0.74)


def test_team_game_without_a_penalty_keeps_full_xg() -> None:
    penalties = pd.DataFrame(
        [{"game_id": "g1", "team_id": "H", "xgoals_for": 0.76}]
    )

    result = attach_non_penalty_xg(_games(), penalties)

    g1 = result[result["asa_game_id"] == "g1"].iloc[0]
    g2 = result[result["asa_game_id"] == "g2"].iloc[0]
    assert g1["away_npxg"] == pytest.approx(1.50)
    assert g2["home_npxg"] == pytest.approx(1.00)
    assert g2["away_npxg"] == pytest.approx(0.80)


def test_total_xg_is_left_untouched() -> None:
    penalties = pd.DataFrame(
        [{"game_id": "g1", "team_id": "H", "xgoals_for": 0.76}]
    )

    result = attach_non_penalty_xg(_games(), penalties)

    row = result[result["asa_game_id"] == "g1"].iloc[0]
    assert row["home_xg"] == pytest.approx(2.00)


def test_missing_penalty_feed_yields_null_npxg_rather_than_total_xg() -> None:
    """Absent penalty data must not be reported as if it were npxG.

    Returning total xG here is exactly the silent inflation this fix removes,
    so an empty feed fails closed to NaN and lets the caller decide.
    """
    result = attach_non_penalty_xg(_games(), pd.DataFrame())

    assert result["home_npxg"].isna().all()
    assert result["away_npxg"].isna().all()


def test_penalty_xg_exceeding_total_xg_clamps_at_zero() -> None:
    penalties = pd.DataFrame(
        [{"game_id": "g2", "team_id": "A", "xgoals_for": 5.0}]
    )

    result = attach_non_penalty_xg(_games(), penalties)

    row = result[result["asa_game_id"] == "g2"].iloc[0]
    assert row["home_npxg"] == pytest.approx(0.0)


class _StubClient:
    """Minimal stand-in for the ASA client, recording the queries it receives."""

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def get_game_xgoals(self, **kwargs: object) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "game_id": "g1",
                    "date_time_utc": "2026-05-01 02:00:00 UTC",
                    "home_team_id": "H",
                    "away_team_id": "A",
                    "home_team_xgoals": 2.00,
                    "away_team_xgoals": 1.50,
                    "home_player_xgoals": 2.10,
                    "away_player_xgoals": 1.40,
                    "home_xpoints": 1.9,
                    "away_xpoints": 1.1,
                }
            ]
        )

    def get_team_xgoals(self, **kwargs: object) -> pd.DataFrame:
        self.calls.append(kwargs)
        return pd.DataFrame(
            [{"game_id": "g1", "team_id": "H", "xgoals_for": 0.76}]
        )


def test_fetch_populates_npxg_from_the_penalty_split() -> None:
    client = _StubClient()

    frame = _fetch_match_xgoals(client, [2026], {"H": "Home FC", "A": "Away FC"})

    row = frame.iloc[0]
    assert row["home_npxg"] == pytest.approx(1.24)
    assert row["away_npxg"] == pytest.approx(1.50)
    assert row["home_xg"] == pytest.approx(2.00)


def test_fetch_requests_the_penalty_shot_pattern_per_game() -> None:
    client = _StubClient()

    _fetch_match_xgoals(client, [2026], {"H": "Home FC", "A": "Away FC"})

    assert client.calls == [
        {
            "leagues": "nwsl",
            "season_name": "2026",
            "shot_pattern": "Penalty",
            "split_by_games": True,
        }
    ]
