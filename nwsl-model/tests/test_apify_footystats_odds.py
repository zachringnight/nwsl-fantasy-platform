from __future__ import annotations

import json
from datetime import datetime, timezone

import pandas as pd

from src.odds.apify_footystats import (
    build_current_odds_contract,
    merge_current_odds_contract,
    parse_footystats_odds_text,
    update_dataset_manifest_odds,
)


APIFY_TEXT = """
Betting Odds For Next Fixtures - NWSL

May 30, 2026

Home
Away
1
X
2
Highest Odds at
Orlando Pride
1.40   vs   1.50
Bay
1.90
3.40
3.74
-
Racing Louisville
1.75   vs   1.14
Denver Summit W
2.93
3.28
2.22
-

May 31, 2026

Home
Away
1
X
2
Highest Odds at
Chicago Red Stars
1.20   vs   2.17
San Diego Wave
6.34
4.50
1.41
-

Odds - USA
"""


def test_parse_footystats_odds_text_extracts_fixture_prices() -> None:
    parsed = parse_footystats_odds_text(APIFY_TEXT)

    assert parsed.to_dict("records") == [
        {
            "match_date": "2026-05-30",
            "home_team": "Orlando Pride",
            "away_team": "Bay",
            "home_odds": 1.90,
            "draw_odds": 3.40,
            "away_odds": 3.74,
            "sportsbook": "FootyStats",
        },
        {
            "match_date": "2026-05-30",
            "home_team": "Racing Louisville",
            "away_team": "Denver Summit W",
            "home_odds": 2.93,
            "draw_odds": 3.28,
            "away_odds": 2.22,
            "sportsbook": "FootyStats",
        },
        {
            "match_date": "2026-05-31",
            "home_team": "Chicago Red Stars",
            "away_team": "San Diego Wave",
            "home_odds": 6.34,
            "draw_odds": 4.50,
            "away_odds": 1.41,
            "sportsbook": "FootyStats",
        },
    ]


def test_build_current_odds_contract_matches_espn_upcoming_with_date_tolerance() -> None:
    parsed = parse_footystats_odds_text(APIFY_TEXT)
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "match_date": "2026-05-29",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
            },
            {
                "match_id": "401854059",
                "match_date": "2026-05-30",
                "home_team": "Racing Louisville FC",
                "away_team": "Denver Summit FC",
            },
            {
                "match_id": "401853925",
                "match_date": "2026-05-31",
                "home_team": "Chicago Stars FC",
                "away_team": "San Diego Wave FC",
            },
        ]
    )

    captured_at = datetime(2026, 5, 25, 22, 0, tzinfo=timezone.utc)
    contract, unmatched = build_current_odds_contract(parsed, upcoming, captured_at=captured_at)

    assert unmatched.empty
    assert contract[["match_id", "sportsbook", "market_type", "source_type"]].to_dict("records") == [
        {
            "match_id": "401853922",
            "sportsbook": "FootyStats",
            "market_type": "1x2",
            "source_type": "current",
        },
        {
            "match_id": "401854059",
            "sportsbook": "FootyStats",
            "market_type": "1x2",
            "source_type": "current",
        },
        {
            "match_id": "401853925",
            "sportsbook": "FootyStats",
            "market_type": "1x2",
            "source_type": "current",
        },
    ]
    assert contract.loc[0, "timestamp"] == "2026-05-25T22:00:00+00:00"
    assert contract.loc[0, "home_odds"] == 1.90
    assert pd.isna(contract.loc[0, "line"])


def test_merge_current_odds_contract_preserves_historical_closes() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "completed-1",
                "timestamp": "2026-05-01T00:00:00+00:00",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "line": pd.NA,
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.5,
                "over_odds": pd.NA,
                "under_odds": pd.NA,
                "source_type": "close",
            },
            {
                "match_id": "old-current",
                "timestamp": "2026-05-25T00:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": pd.NA,
                "home_odds": 1.9,
                "draw_odds": 3.4,
                "away_odds": 4.0,
                "over_odds": pd.NA,
                "under_odds": pd.NA,
                "source_type": "current",
            },
        ]
    )
    current = pd.DataFrame(
        [
            {
                "match_id": "new-current",
                "timestamp": "2026-05-26T00:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": pd.NA,
                "home_odds": 2.1,
                "draw_odds": 3.1,
                "away_odds": 3.8,
                "over_odds": pd.NA,
                "under_odds": pd.NA,
                "source_type": "current",
            }
        ]
    )

    merged = merge_current_odds_contract(existing, current)

    assert merged["match_id"].tolist() == ["completed-1", "new-current"]
    assert merged["source_type"].tolist() == ["close", "current"]


def test_update_dataset_manifest_odds_records_current_feed_without_changing_training_gap(tmp_path) -> None:
    manifest_path = tmp_path / "dataset_manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "missing_feature_coverage": {
                    "odds_missing_pct": 100.0,
                    "xg_missing_pct": 100.0,
                },
                "odds": {
                    "rows": 0,
                    "source_available": False,
                    "markets": [],
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "timestamp": "2026-05-25T22:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "source_type": "current",
            }
        ]
    )

    update_dataset_manifest_odds(manifest_path, odds)

    updated = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert updated["odds"] == {
        "rows": 1,
        "source_available": True,
        "markets": ["1x2"],
        "sportsbooks": ["FootyStats"],
        "source_types": ["current"],
        "latest_timestamp": "2026-05-25T22:00:00+00:00",
    }
    assert updated["missing_feature_coverage"]["odds_missing_pct"] == 100.0


def test_update_dataset_manifest_odds_updates_close_coverage_gap(tmp_path) -> None:
    manifest_path = tmp_path / "dataset_manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "matches": {"rows": 4},
                "missing_feature_coverage": {
                    "odds_missing_pct": 100.0,
                    "xg_missing_pct": 100.0,
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )
    odds = pd.DataFrame(
        [
            {"match_id": "m1", "sportsbook": "OddsPortalAvg", "market_type": "1x2", "source_type": "close"},
            {"match_id": "m2", "sportsbook": "OddsPortalAvg", "market_type": "1x2", "source_type": "close"},
            {"match_id": "u1", "sportsbook": "FootyStats", "market_type": "1x2", "source_type": "current"},
        ]
    )

    update_dataset_manifest_odds(manifest_path, odds)

    updated = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert updated["missing_feature_coverage"]["odds_missing_pct"] == 50.0
