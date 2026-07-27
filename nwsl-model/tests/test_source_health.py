from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from src.odds.source_health import (
    build_odds_source_health_report,
    filter_fresh_current_rows,
)

NOW = datetime(2026, 7, 26, 20, 0, tzinfo=timezone.utc)


def odds_row(
    match_id: str,
    timestamp: str,
    *,
    sportsbook: str = "FoxSports",
    source_type: str = "current",
) -> dict:
    return {
        "match_id": match_id,
        "timestamp": timestamp,
        "sportsbook": sportsbook,
        "market_type": "total",
        "line": 2.5,
        "over_odds": 1.91,
        "under_odds": 1.91,
        "source_type": source_type,
    }


def test_filter_fresh_current_rows_removes_stale_and_invalid_current_only() -> None:
    odds = pd.DataFrame(
        [
            odds_row("fresh", "2026-07-26T19:30:00+00:00"),
            odds_row("stale", "2026-07-26T12:00:00+00:00", sportsbook="DraftKings"),
            odds_row("invalid", "not-a-time", sportsbook="FootyStats"),
            odds_row(
                "historical",
                "2026-03-01T00:00:00+00:00",
                sportsbook="OddsPortalAvg",
                source_type="close",
            ),
            odds_row(
                "shadow",
                "2026-03-01T00:00:00+00:00",
                sportsbook="Bet365",
                source_type="shadow",
            ),
        ]
    )

    cleaned, report = filter_fresh_current_rows(
        odds,
        now=NOW,
        max_age_minutes=180,
    )

    assert set(cleaned["match_id"]) == {"fresh", "historical", "shadow"}
    assert report["current_rows_before"] == 3
    assert report["current_rows_after"] == 1
    assert report["removed_rows"] == 2
    assert report["removed_by_reason"] == {
        "stale_timestamp": 1,
        "invalid_timestamp": 1,
    }
    assert report["removed_by_sportsbook"] == {
        "DraftKings": 1,
        "FootyStats": 1,
    }


def test_shadow_gate_stays_manual_and_requires_forward_observation() -> None:
    upcoming = pd.DataFrame(
        [{"match_id": f"m{index}", "match_date": "2026-07-27"} for index in range(1, 6)]
    )
    authoritative = pd.DataFrame(
        [odds_row(f"m{index}", "2026-07-26T19:30:00+00:00") for index in range(1, 6)]
    )
    shadow_current = pd.DataFrame(
        [
            odds_row(
                f"m{index}",
                "2026-07-26T19:30:00+00:00",
                sportsbook=book,
                source_type="shadow",
            )
            for index in range(1, 6)
            for book in ("Bet365", "Pinnacle")
        ]
    )
    shadow_snapshots = pd.concat(
        [
            shadow_current.assign(timestamp=f"2026-07-{day:02d}T19:30:00+00:00")
            for day in range(20, 27)
        ],
        ignore_index=True,
    )

    report = build_odds_source_health_report(
        upcoming,
        authoritative,
        shadow_current,
        shadow_snapshots,
        shadow_status={"status": "ok"},
        unmatched_count=0,
        now=NOW,
        max_age_minutes=180,
    )

    gate = report["promotion_gate"]
    assert report["coverage"]["coverage_vs_fox_pct"] == 100.0
    assert gate["ready_for_manual_review"] is True
    assert gate["automatic_promotion"] is False
    assert gate["lane"] == "shadow_only"
    assert gate["reasons"] == []


def test_shadow_gate_reports_missing_provider_and_insufficient_evidence() -> None:
    report = build_odds_source_health_report(
        upcoming=pd.DataFrame([{"match_id": "m1", "match_date": "2026-07-27"}]),
        authoritative_odds=pd.DataFrame(),
        shadow_current=pd.DataFrame(),
        shadow_snapshots=pd.DataFrame(),
        shadow_status={"status": "failed"},
        unmatched_count=2,
        now=NOW,
    )

    reasons = set(report["promotion_gate"]["reasons"])
    assert report["promotion_gate"]["ready_for_manual_review"] is False
    assert "provider_status_not_ok" in reasons
    assert "insufficient_observation_days" in reasons
    assert "unmatched_rows_present" in reasons
    assert "stale_or_missing_shadow_rows" in reasons


def test_source_health_reports_apify_draftkings_fresh_totals() -> None:
    authoritative = pd.DataFrame(
        [
            odds_row(
                "m1",
                "2026-07-26T19:30:00+00:00",
                sportsbook="DraftKings",
            ),
            {
                **odds_row(
                    "m2",
                    "2026-07-26T12:00:00+00:00",
                    sportsbook="DraftKings",
                ),
                "over_odds": None,
            },
        ]
    )

    report = build_odds_source_health_report(
        upcoming=pd.DataFrame([{"match_id": "m1", "match_date": "2026-07-27"}]),
        authoritative_odds=authoritative,
        shadow_current=pd.DataFrame(),
        shadow_snapshots=pd.DataFrame(),
        draftkings_status={
            "status": "ok",
            "checked_at": "2026-07-26T19:31:00+00:00",
            "scraped_at": "2026-07-26T19:30:00+00:00",
            "event_count": 1,
            "parsed_rows": 2,
            "matched_rows": 2,
            "unmatched_rows": 0,
        },
        now=NOW,
    )

    draftkings = report["apify_draftkings"]
    assert draftkings["status"] == "healthy"
    assert draftkings["provider_status"] == "ok"
    assert draftkings["fresh_rows"] == 1
    assert draftkings["matches"] == 1
    assert draftkings["invalid_paired_total_rows"] == 1
    assert draftkings["scraped_at"] == "2026-07-26T19:30:00+00:00"
