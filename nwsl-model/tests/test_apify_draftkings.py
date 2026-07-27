from __future__ import annotations

import math
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from src.odds.apify_draftkings import (
    DRAFTKINGS_NWSL_API_URL,
    american_to_decimal,
    build_current_odds_contract,
    build_draftkings_api_contract,
    fetch_draftkings_api_payload,
    merge_current_odds_contract,
    parse_draftkings_api_payload,
    parse_draftkings_odds_text,
)

UTC = timezone.utc


# Verbatim shape of one DraftKings NWSL moneyline block as rendered by the
# Apify web-scraper. Teams are suffixed " [W]"; American odds use the unicode
# minus sign U+2212 for favorites.
DK_SAMPLE_TEXT = """
SAT MAY 30th
Home
Draw
Away
Racing Louisville [W]
VS
Denver Summit FC [W]
+185
+225
+120
Sat May 30th 12:00 AM
More Bets
NJ/NY Gotham FC [W]
VS
Chicago Red Stars [W]
−140
+290
+360
Sat May 30th 7:30 PM
More Bets
"""

DK_API_PAYLOAD = {
    "success": True,
    "league": {
        "id": "37539",
        "name": "NWSL",
        "sport": "Soccer",
    },
    "eventCount": 1,
    "events": [
        {
            "id": "34426310",
            "name": "Angel City FC [W] vs Racing Louisville [W]",
            "startTime": "2026-07-27T01:08:31.0000000Z",
            "status": "STARTED",
            "homeTeam": {"id": "623941", "name": "Angel City FC [W]"},
            "awayTeam": {
                "id": "545134",
                "name": "Racing Louisville [W]",
            },
            "markets": [
                {
                    "name": "Moneyline",
                    "type": "moneyline",
                    "isMain": True,
                    "line": None,
                    "selections": [
                        {
                            "label": "Angel City FC [W]",
                            "outcome": "home",
                            "decimalOdds": 3.85,
                            "odds": "+285",
                        },
                        {
                            "label": "Draw",
                            "outcome": "tie",
                            "decimalOdds": 3.15,
                            "odds": "+215",
                        },
                        {
                            "label": "Racing Louisville [W]",
                            "outcome": "away",
                            "decimalOdds": 1.95238096,
                            "odds": "−105",
                        },
                    ],
                },
                {
                    "name": "Total",
                    "type": "total",
                    "isMain": True,
                    "line": 2.5,
                    "selections": [
                        {
                            "label": "Over 2.5",
                            "outcome": "over",
                            "points": 2.5,
                            "decimalOdds": 1.91,
                        },
                        {
                            "label": "Under 2.5",
                            "outcome": "under",
                            "points": 2.5,
                            "decimalOdds": 1.91,
                        },
                    ],
                },
            ],
        }
    ],
    "scrapedAt": "2026-07-27T01:59:46Z",
}


def test_american_to_decimal_handles_positive_negative_and_unicode_minus() -> None:
    assert american_to_decimal("+120") == pytest.approx(2.20)
    assert american_to_decimal("+100") == pytest.approx(2.00)
    # ASCII minus and unicode minus must both work.
    assert american_to_decimal("-140") == pytest.approx(1.7142857, rel=1e-6)
    assert american_to_decimal("−140") == pytest.approx(1.7142857, rel=1e-6)


def test_parse_draftkings_odds_text_extracts_three_way_moneyline() -> None:
    parsed = parse_draftkings_odds_text(DK_SAMPLE_TEXT)

    assert list(parsed.columns) == [
        "match_date",
        "home_team",
        "away_team",
        "home_odds",
        "draw_odds",
        "away_odds",
        "sportsbook",
    ]
    assert len(parsed) == 2

    first = parsed.iloc[0]
    assert first["match_date"] == "2026-05-30"
    assert first["home_team"] == "Racing Louisville [W]"
    assert first["away_team"] == "Denver Summit FC [W]"
    assert first["home_odds"] == pytest.approx(2.85)
    assert first["draw_odds"] == pytest.approx(3.25)
    assert first["away_odds"] == pytest.approx(2.20)
    assert first["sportsbook"] == "DraftKings"

    second = parsed.iloc[1]
    assert second["home_team"] == "NJ/NY Gotham FC [W]"
    assert second["away_team"] == "Chicago Red Stars [W]"
    assert second["home_odds"] == pytest.approx(1.7142857, rel=1e-6)


def test_build_current_odds_contract_matches_upcoming_and_strips_w_suffix() -> None:
    parsed = parse_draftkings_odds_text(DK_SAMPLE_TEXT)
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "401812345",
                "match_date": "2026-05-30",
                "home_team": "Racing Louisville FC",
                "away_team": "Denver Summit FC",
            },
            {
                "match_id": "401812346",
                "match_date": "2026-05-30",
                "home_team": "Gotham FC",
                "away_team": "Chicago Stars FC",
            },
        ]
    )

    captured_at = datetime(2026, 5, 28, 12, 0, tzinfo=UTC)
    contract, unmatched = build_current_odds_contract(parsed, upcoming, captured_at=captured_at)

    assert unmatched.empty
    assert len(contract) == 2
    assert set(contract["sportsbook"]) == {"DraftKings"}
    assert set(contract["market_type"]) == {"1x2"}
    assert set(contract["source_type"]) == {"current"}
    assert all(math.isnan(value) for value in contract["over_odds"])
    assert all(math.isnan(value) for value in contract["under_odds"])

    louisville = contract[contract["match_id"] == "401812345"].iloc[0]
    assert louisville["home_odds"] == pytest.approx(2.85)
    assert louisville["draw_odds"] == pytest.approx(3.25)
    assert louisville["away_odds"] == pytest.approx(2.20)


def test_parse_structured_api_keeps_main_moneyline_and_paired_total() -> None:
    parsed, rejected = parse_draftkings_api_payload(DK_API_PAYLOAD)

    assert rejected.empty
    assert parsed["market_type"].tolist() == ["1x2", "total"]
    assert set(parsed["timestamp"]) == {"2026-07-27T01:59:46Z"}
    assert set(parsed["source_type"]) == {"live"}
    moneyline = parsed[parsed["market_type"].eq("1x2")].iloc[0]
    assert moneyline["home_odds"] == pytest.approx(3.85)
    assert moneyline["draw_odds"] == pytest.approx(3.15)
    assert moneyline["away_odds"] == pytest.approx(1.95238096)
    total = parsed[parsed["market_type"].eq("total")].iloc[0]
    assert total["line"] == pytest.approx(2.5)
    assert total["over_odds"] == pytest.approx(1.91)
    assert total["under_odds"] == pytest.approx(1.91)


def test_parse_structured_api_splits_total_lines_and_prefers_total_goals() -> None:
    payload = json.loads(json.dumps(DK_API_PAYLOAD))
    payload["events"][0]["markets"] = [
        {
            "name": "Total Goals",
            "type": "total",
            "isMain": True,
            "line": None,
            "selections": [
                {
                    "label": "Over",
                    "outcome": "over",
                    "points": 1.5,
                    "decimalOdds": 1.20,
                },
                {
                    "label": "Under",
                    "outcome": "under",
                    "points": 1.5,
                    "decimalOdds": 4.40,
                },
                {
                    "label": "Over",
                    "outcome": "over",
                    "points": 2.5,
                    "decimalOdds": 1.81,
                },
                {
                    "label": "Under",
                    "outcome": "under",
                    "points": 2.5,
                    "decimalOdds": 1.86,
                },
            ],
        },
        {
            "name": "Total",
            "type": "total",
            "isMain": True,
            "line": None,
            "selections": [
                {
                    "label": "Over",
                    "outcome": "over",
                    "points": 2.5,
                    "decimalOdds": 1.80,
                },
                {
                    "label": "Under",
                    "outcome": "under",
                    "points": 2.5,
                    "decimalOdds": 1.88,
                },
                {
                    "label": "Over",
                    "outcome": "over",
                    "points": 2.75,
                    "decimalOdds": 2.10,
                },
                {
                    "label": "Under",
                    "outcome": "under",
                    "points": 2.75,
                    "decimalOdds": 1.64,
                },
            ],
        },
    ]

    parsed, rejected = parse_draftkings_api_payload(payload)

    assert rejected.empty
    assert parsed["line"].tolist() == [1.5, 2.5, 2.75]
    main = parsed[parsed["line"].eq(2.5)].iloc[0]
    assert main["provider_market_name"] == "Total Goals"
    assert main["over_odds"] == pytest.approx(1.81)
    assert main["under_odds"] == pytest.approx(1.86)


def test_parse_structured_api_ignores_tie_no_bet_market() -> None:
    payload = json.loads(json.dumps(DK_API_PAYLOAD))
    payload["events"][0]["markets"].append(
        {
            "name": "Tie No Bet",
            "type": "moneyline",
            "isMain": True,
            "selections": [
                {
                    "label": "Angel City FC [W]",
                    "outcome": "home",
                    "decimalOdds": 2.20,
                },
                {
                    "label": "Racing Louisville [W]",
                    "outcome": "away",
                    "decimalOdds": 1.65,
                },
            ],
        }
    )

    parsed, rejected = parse_draftkings_api_payload(payload)

    assert rejected.empty
    assert parsed["market_type"].tolist() == ["1x2", "total"]


@pytest.mark.parametrize("status", ["COMPLETED", "CANCELED", "SUSPENDED", "mystery"])
def test_parse_structured_api_rejects_terminal_or_unknown_event_status(
    status: str,
) -> None:
    payload = json.loads(json.dumps(DK_API_PAYLOAD))
    payload["events"][0]["status"] = status

    parsed, rejected = parse_draftkings_api_payload(payload)

    assert parsed.empty
    assert rejected["reason"].tolist() == ["unsupported_event_status"]


@pytest.mark.parametrize("status", ["NOT_STARTED", "SCHEDULED", "PRE_GAME", "OPEN"])
def test_parse_structured_api_keeps_whitelisted_prematch_event_status(
    status: str,
) -> None:
    payload = json.loads(json.dumps(DK_API_PAYLOAD))
    payload["events"][0]["status"] = status

    parsed, rejected = parse_draftkings_api_payload(payload)

    assert rejected.empty
    assert set(parsed["source_type"]) == {"current"}


def test_structured_api_contract_maps_w_teams_with_date_tolerance() -> None:
    parsed, _ = parse_draftkings_api_payload(DK_API_PAYLOAD)
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "401853952",
                "match_date": "2026-07-26",
                "home_team": "Angel City FC",
                "away_team": "Racing Louisville FC",
            }
        ]
    )

    contract, unmatched = build_draftkings_api_contract(
        parsed,
        upcoming,
    )

    assert unmatched.empty
    assert len(contract) == 2
    assert set(contract["match_id"]) == {"401853952"}
    assert set(contract["timestamp"]) == {"2026-07-27T01:59:46Z"}
    assert set(contract["source_type"]) == {"live"}


def test_fetch_structured_api_uses_bearer_header_not_query_token() -> None:
    observed = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self) -> bytes:
            return json.dumps(DK_API_PAYLOAD).encode("utf-8")

    def opener(request, *, timeout):
        observed["url"] = request.full_url
        observed["authorization"] = request.get_header("Authorization")
        observed["timeout"] = timeout
        return Response()

    payload = fetch_draftkings_api_payload(
        "secret-token",
        opener=opener,
        timeout_seconds=12,
    )

    assert payload["success"] is True
    assert observed == {
        "url": DRAFTKINGS_NWSL_API_URL,
        "authorization": "Bearer secret-token",
        "timeout": 12,
    }
    assert "secret-token" not in observed["url"]


def test_successful_empty_contract_replaces_stale_draftkings_rows() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "old",
                "timestamp": "2026-07-26T00:00:00Z",
                "sportsbook": "DraftKings",
                "market_type": "total",
                "line": 2.5,
                "source_type": "current",
            },
            {
                "match_id": "close",
                "timestamp": "2026-03-01T00:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "total",
                "line": 2.5,
                "source_type": "close",
            },
        ]
    )
    empty = pd.DataFrame(
        columns=[
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
    )

    merged = merge_current_odds_contract(
        existing,
        empty,
        replace_source_types=("current", "live"),
        replace_when_empty=True,
    )

    assert merged["match_id"].tolist() == ["close"]


def test_odds_poller_runs_api_and_keeps_browser_actor_opt_in() -> None:
    source = (
        Path(__file__).resolve().parent.parent / "scripts" / "poll_current_odds.sh"
    ).read_text(encoding="utf-8")

    assert 'run_step "draftkings_api"' in source
    legacy_gate = source.index('if [ "${ENABLE_LEGACY_APIFY_ODDS:-0}" = "1" ]')
    api_step = source.index('run_step "draftkings_api"')
    legacy_step = source.index('run_step "draftkings_browser_legacy"')
    assert api_step < legacy_gate < legacy_step
