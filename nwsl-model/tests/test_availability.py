from __future__ import annotations

import pandas as pd

from src.data.availability import (
    append_availability_snapshot,
    apply_availability_to_projected_lineups,
    parse_availability_texts,
)
from src.features.lineup_features import compute_projected_lineup_delta


def test_append_availability_snapshot_accumulates_distinct_report_dates() -> None:
    week1 = parse_availability_texts(
        ["**Updated May 16, 2026**", "**BAY FC**\\n\\n**OUT:** Alex Pfeiffer (Knee)"],
        fetched_at="2026-05-16T00:00:00Z",
    )
    week2 = parse_availability_texts(
        ["**Updated May 23, 2026**", "**BAY FC**\\n\\n**OUT:** Alex Pfeiffer (Knee)"],
        fetched_at="2026-05-23T00:00:00Z",
    )

    after_first = append_availability_snapshot(pd.DataFrame(), week1)
    accumulated = append_availability_snapshot(after_first, week2)

    # Same player, two distinct report weeks: both rows kept (a history).
    assert sorted(accumulated["report_date"].unique().tolist()) == ["2026-05-16", "2026-05-23"]
    assert len(accumulated) == 2


def test_append_availability_snapshot_dedupes_same_report_date_rerun() -> None:
    week = parse_availability_texts(
        ["**Updated May 23, 2026**", "**BAY FC**\\n\\n**OUT:** Alex Pfeiffer (Knee)"],
        fetched_at="2026-05-23T00:00:00Z",
    )

    first = append_availability_snapshot(pd.DataFrame(), week)
    # Re-running the same week (e.g. the daily cron fires again) must not duplicate.
    second = append_availability_snapshot(first, week)

    assert len(second) == 1


def test_parse_availability_texts_extracts_team_status_reason_rows() -> None:
    rows = parse_availability_texts(
        [
            "**Updated May 23, 2026**",
            "**BAY FC**\\n\\n**OUT:** Alex Pfeiffer (Knee)  \\n**QUESTIONABLE:** Anouk Denton (Lower Leg)  \\n**INTERNATIONAL DUTY:** None",
        ],
        source_url="https://www.nwslsoccer.com/news/availability-report",
        fetched_at="2026-05-26T00:00:00Z",
    )

    assert rows[["team", "player_name", "status", "reason"]].to_dict("records") == [
        {"team": "Bay FC", "player_name": "Alex Pfeiffer", "status": "out", "reason": "Knee"},
        {
            "team": "Bay FC",
            "player_name": "Anouk Denton",
            "status": "questionable",
            "reason": "Lower Leg",
        },
    ]
    assert rows["report_date"].tolist() == ["2026-05-23", "2026-05-23"]


def test_parse_availability_texts_canonicalizes_expansion_team_names() -> None:
    rows = parse_availability_texts(
        ["**DENVER SUMMIT**\\n\\n**OUT:** Jasmine Aikey (Knee - SEI)"],
        fetched_at="2026-05-26T00:00:00Z",
    )

    assert rows.loc[0, "team"] == "Denver Summit"


def test_apply_availability_marks_projected_out_player_as_unavailable() -> None:
    projected = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "team": "Bay FC",
                "player_id": "p1",
                "projected_start": True,
                "projected_minutes": 88.0,
                "status": "available",
                "source": "official_recent_role_model",
            }
        ]
    )
    profiles = pd.DataFrame(
        [
            {
                "player_id": "p1",
                "media_first_name": "Alex",
                "media_last_name": "Pfeiffer",
                "short_name": "A. Pfeiffer",
            }
        ]
    )
    availability = pd.DataFrame(
        [{"team": "Bay FC", "player_name": "Alex Pfeiffer", "status": "out", "reason": "Knee"}]
    )

    updated = apply_availability_to_projected_lineups(projected, availability, profiles)

    row = updated.iloc[0]
    assert row["status"] == "out"
    assert bool(row["projected_start"]) is False
    assert row["projected_minutes"] == 0.0
    assert row["availability_reason"] == "Knee"


def test_lineup_strength_excludes_projected_out_players() -> None:
    matches = pd.DataFrame(
        [{"match_id": "m1", "home_team": "Bay FC", "away_team": "Current"}]
    )
    projected = pd.DataFrame(
        [
            {"match_id": "m1", "team": "Bay FC", "player_id": "p1", "projected_start": True, "status": "out"},
            {"match_id": "m1", "team": "Current", "player_id": "p2", "projected_start": True, "status": "available"},
        ]
    )

    with_strength = compute_projected_lineup_delta(
        matches,
        projected,
        player_ratings={"p1": 0.8, "p2": 0.6},
    )

    assert with_strength.loc[0, "home_lineup_strength"] == 0.0
    assert with_strength.loc[0, "away_lineup_strength"] == 0.6
