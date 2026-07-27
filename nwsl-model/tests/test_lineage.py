from __future__ import annotations

import pandas as pd

from src.data.lineage import build_daily_lineage_quality


def test_daily_lineage_records_xg_fallbacks_and_passes_matching_dates() -> None:
    quality = build_daily_lineage_quality(
        espn_matches=[
            {"matchId": "m1", "date": "2026-07-27", "status": "completed"},
            {"matchId": "m2", "date": "2026-07-30", "status": "upcoming"},
        ],
        completed=pd.DataFrame(
            [{"match_id": "m1", "match_date": "2026-07-27"}]
        ),
        upcoming=pd.DataFrame(
            [{"match_id": "m2", "match_date": "2026-07-30"}]
        ),
        manifest={
            "generated_at": "2026-07-27T18:00:00Z",
            "asa": {
                "coverage_by_season": {
                    "2026": {
                        "covered_matches": 126,
                        "reference_matches": 127,
                        "coverage_pct": 99.21,
                        "fallback_match_ids": ["fallback-1"],
                    }
                }
            },
        },
    )

    assert quality["status"] == "ready"
    assert quality["asa_xg_2026"]["fallback_match_ids"] == ["fallback-1"]


def test_daily_lineage_blocks_stale_raw_results_and_identity_overlap() -> None:
    quality = build_daily_lineage_quality(
        espn_matches=[
            {"matchId": "m1", "date": "2026-07-27", "status": "completed"}
        ],
        completed=pd.DataFrame(
            [{"match_id": "same", "match_date": "2026-07-26"}]
        ),
        upcoming=pd.DataFrame(
            [{"match_id": "same", "match_date": "2026-07-30"}]
        ),
        manifest={
            "asa": {
                "coverage_by_season": {
                    "2026": {
                        "covered_matches": 1,
                        "reference_matches": 1,
                        "coverage_pct": 100,
                        "fallback_match_ids": [],
                    }
                }
            }
        },
    )

    assert quality["status"] == "blocked"
    assert quality["blockers"] == [
        "raw_completed_max_date_does_not_match_espn",
        "completed_upcoming_match_ids_overlap",
    ]
