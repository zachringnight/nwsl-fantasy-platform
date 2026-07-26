from __future__ import annotations

import json
from datetime import datetime, timezone

import pandas as pd
import pytest

from src.odds.api_football import (
    ApiFootballFeedClient,
    api_football_team_key,
    build_api_football_shadow_contract,
    flatten_api_football_totals,
    validate_feed,
)


def feed_payload() -> dict:
    return {
        "contractVersion": "nwsl-api-football-v1",
        "source": "api-football",
        "status": "ok",
        "generatedAt": "2026-07-26T20:00:00+00:00",
        "fixtureCount": 1,
        "quoteCount": 2,
        "fixtures": [
            {
                "fixtureId": "12345",
                "kickoff": "2026-07-31T02:30:00+00:00",
                "homeTeam": "Kansas City W",
                "awayTeam": "Portland Thorns W",
                "updatedAt": "2026-07-26T19:30:00+00:00",
                "books": [
                    {
                        "book": "Bet365",
                        "total": {"line": 2.5, "over": 1.91, "under": 1.95},
                    },
                    {
                        "book": "Pinnacle",
                        "total": {"line": 2.5, "over": 1.98, "under": 1.88},
                    },
                ],
            }
        ],
    }


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_feed_client_uses_fixed_json_endpoint_without_credentials() -> None:
    requests = []

    def opener(request, timeout):
        requests.append((request, timeout))
        return FakeResponse(feed_payload())

    client = ApiFootballFeedClient(
        "https://example.test/api/nwsl/odds",
        opener=opener,
        timeout_seconds=12,
    )
    output = client.fetch()

    assert output["status"] == "ok"
    assert len(requests) == 1
    request, timeout = requests[0]
    assert request.full_url == "https://example.test/api/nwsl/odds"
    assert request.get_header("X-apisports-key") is None
    assert request.get_header("User-agent") == "nwsl-model/0.1"
    assert timeout == 12


def test_validate_feed_rejects_contract_drift_and_unavailable_status() -> None:
    payload = feed_payload()
    payload["contractVersion"] = "unexpected"
    with pytest.raises(ValueError, match="contract version"):
        validate_feed(payload)

    payload = feed_payload()
    payload["status"] = "unavailable"
    with pytest.raises(ValueError, match="unavailable"):
        validate_feed(payload)


def test_team_aliases_cover_api_football_womens_suffixes() -> None:
    assert api_football_team_key("Kansas City W") == "kansas city current"
    assert api_football_team_key("Portland Thorns W") == "portland thorns fc"
    assert api_football_team_key("NJ/NY Gotham FC W") == "gotham fc"


def test_flattens_and_matches_multibook_totals_into_shadow_contract() -> None:
    flattened, rejected = flatten_api_football_totals(
        feed_payload(),
        captured_at=datetime(2026, 7, 26, 20, 0, tzinfo=timezone.utc),
    )
    upcoming = pd.DataFrame(
        [
            {
                "match_id": "401853953",
                # UTC kickoff is the following day; the one-day boundary is accepted.
                "match_date": "2026-07-30",
                "home_team": "Kansas City Current",
                "away_team": "Portland Thorns FC",
            }
        ]
    )

    contract, unmatched = build_api_football_shadow_contract(flattened, upcoming)

    assert rejected.empty
    assert unmatched.empty
    assert len(contract) == 2
    assert set(contract["sportsbook"]) == {"Bet365", "Pinnacle"}
    assert set(contract["source_type"]) == {"shadow"}
    assert set(contract["match_id"]) == {"401853953"}
    assert set(contract["line"]) == {2.5}


def test_invalid_or_unpaired_quotes_are_rejected() -> None:
    payload = feed_payload()
    payload["fixtures"][0]["books"] = [
        {"book": "Bet365", "total": {"line": 2.5, "over": 1.91, "under": None}},
        {"book": "Pinnacle", "total": {"line": 50, "over": 1.91, "under": 1.91}},
    ]

    flattened, rejected = flatten_api_football_totals(payload)

    assert flattened.empty
    assert len(rejected) == 2
    assert set(rejected["reason"]) == {"invalid_paired_total"}
