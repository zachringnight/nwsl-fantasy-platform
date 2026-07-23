from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.data.match_ids import (
    apply_official_match_id_crosswalk,
    build_match_id_crosswalk,
    model_team_key,
)


def _model_reference() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": "espn-completed",
                "match_date": "2026-03-14",
                "season": 2026,
                "home_team": "Washington Spirit",
                "away_team": "Portland Thorns FC",
                "home_goals_90": 0,
                "away_goals_90": 1,
            },
            {
                "match_id": "espn-upcoming",
                "match_date": "2026-05-29",
                "season": 2026,
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 0,
                "away_goals_90": 0,
            },
        ]
    )


def _official_matches() -> pd.DataFrame:
    return pd.DataFrame(
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
        ]
    )


def test_build_match_id_crosswalk_maps_official_ids_to_model_ids() -> None:
    crosswalk = build_match_id_crosswalk(_model_reference(), _official_matches())

    assert crosswalk[["official_match_id", "model_match_id"]].to_dict("records") == [
        {"official_match_id": "official-completed", "model_match_id": "espn-completed"},
        {"official_match_id": "official-upcoming", "model_match_id": "espn-upcoming"},
    ]


def test_model_team_key_handles_current_2026_aliases() -> None:
    assert model_team_key("Angel City") == "angel city fc"
    assert model_team_key("Denver Summit") == "denver summit fc"
    assert model_team_key("Current") == "kansas city current"
    assert model_team_key("SD Wave") == "san diego wave fc"


def test_apply_official_match_id_crosswalk_preserves_columns_and_model_team_names(tmp_path: Path) -> None:
    official_dir = tmp_path / "official"
    official_dir.mkdir()
    _official_matches().to_csv(official_dir / "nwsl_2026_official_matches.csv", index=False)
    frame = pd.DataFrame(
        [
            {
                "match_id": "official-completed",
                "season": 2026,
                "team": "Portland Thorns",
                "player_id": "player-1",
            },
            {
                "match_id": "official-upcoming",
                "season": 2026,
                "team": "Bay",
                "player_id": "player-2",
            },
        ]
    )

    mapped = apply_official_match_id_crosswalk(frame, _model_reference(), official_dir)

    assert mapped.columns.tolist() == ["match_id", "season", "team", "player_id"]
    assert mapped[["match_id", "team"]].to_dict("records") == [
        {"match_id": "espn-completed", "team": "Portland Thorns FC"},
        {"match_id": "espn-upcoming", "team": "Bay FC"},
    ]
