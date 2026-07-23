from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from scripts.audit_model_inputs import _build_issues, _personnel_summary


def test_personnel_summary_flags_stale_synthetic_lineups_and_missing_injury_signal() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-05-01",
                "season": 2026,
                "home_team": "Home",
                "away_team": "Away",
            }
        ]
    )
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "m2",
                "match_date": "2026-05-29",
                "season": 2026,
                "home_team": "Home",
                "away_team": "Away",
            }
        ]
    )
    appearances = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "team": "Home",
                "player_id": "p1",
                "started_flag": True,
                "available_flag": True,
                "injury_flag": False,
                "suspension_flag": False,
                "national_team_absence_flag": False,
            }
        ]
    )
    projected = pd.DataFrame(
        [
            {
                "match_id": "m2",
                "team": "Home",
                "player_id": "p1",
                "projected_start": True,
                "status": "available",
                "source": "official_recent_role_model",
                "report_timestamp": "2026-04-07T00:00:00Z",
                "availability_report_date": "2026-05-23",
            }
        ]
    )

    summary = _personnel_summary(
        matches,
        upcoming,
        appearances,
        projected,
        now=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert summary["availability_signal_available"] is False
    assert summary["projected_lineups"]["stale"] is True
    assert summary["projected_lineups"]["synthetic_source_only"] is True
    assert summary["projected_lineups"]["upcoming_match_coverage_pct"] == 100.0
    assert summary["projected_lineups"]["latest_availability_report_date"] == "2026-05-23"


def test_build_issues_blocks_consumer_readiness_when_personnel_is_stale_or_synthetic() -> None:
    audit = {
        "matches": {"possible_postseason_flags": [], "rows": 1},
        "features": {},
        "joins": {
            "appearances": {"rows": 1, "overlap_completed_match_ids": 1},
            "projected_lineups": {"rows": 1, "overlap_completed_match_ids": 0, "overlap_upcoming_match_ids": 1},
        },
        "odds": {"rows": 1, "close_1x2_coverage": {}, "close_total_coverage_pct": 100.0},
        "artifact": {"odds_quality": {}, "dataset_manifest": {}},
        "fold_splits": {"same_date_splits": []},
        "loader_effective_counts": {
            "appearances": 1,
            "projected_lineups": 1,
            "feature_coverage": {},
        },
        "config": {"history_start_season": 2026},
        "personnel": {
            "availability_signal_available": False,
            "projected_lineups": {
                "rows": 1,
                "stale": True,
                "synthetic_source_only": True,
                "upcoming_match_coverage_pct": 100.0,
            },
        },
    }

    issues = _build_issues(audit)

    titles = {issue["title"] for issue in issues}
    assert "No real injury or availability signal is available" in titles
    assert "Projected lineups are stale or synthetic" in titles


def test_build_issues_warns_when_lineup_validation_is_forward_only() -> None:
    audit = {
        "matches": {"possible_postseason_flags": [], "rows": 20},
        "features": {},
        "joins": {
            "appearances": {"rows": 10, "overlap_completed_match_ids": 10},
            "projected_lineups": {"rows": 40, "overlap_completed_match_ids": 0, "overlap_upcoming_match_ids": 4},
        },
        "odds": {"rows": 1, "close_1x2_coverage": {}, "close_total_coverage_pct": 90.0},
        "artifact": {"odds_quality": {}, "dataset_manifest": {}},
        "fold_splits": {"same_date_splits": []},
        "loader_effective_counts": {
            "appearances": 10,
            "projected_lineups": 40,
            "feature_coverage": {},
        },
        "config": {"history_start_season": 2026},
        "personnel": {
            "availability_signal_available": True,
            "appearances": {"completed_match_coverage_pct": 25.0},
            "projected_lineups": {
                "rows": 40,
                "completed_match_coverage_pct": 0.0,
                "upcoming_match_coverage_pct": 100.0,
                "stale": False,
                "synthetic_source_only": False,
            },
        },
    }

    issues = _build_issues(audit)

    titles = {issue["title"] for issue in issues}
    assert "Historical player appearance coverage is sparse" in titles
    assert "Projected lineup coverage is forward-only" in titles
    assert "Historical totals close odds coverage is incomplete" in titles
