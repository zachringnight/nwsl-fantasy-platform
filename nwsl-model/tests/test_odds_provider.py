from __future__ import annotations

from src.odds.provider import OddsProviderConfig, build_consensus_match_odds, normalize_provider_payload

import pandas as pd
import pytest


def test_normalize_provider_payload_matches_official_fixture_and_builds_consensus() -> None:
    match_reference = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_datetime": "2026-04-10T02:00:00Z",
                "home_team": "Portland Thorns",
                "away_team": "Reign",
                "status": "SCHEDULED",
            }
        ]
    )
    payload = {
        "timestamp": "2026-04-09T18:00:00Z",
        "data": [
            {
                "id": "evt-1",
                "home_team": "Portland Thorns FC",
                "away_team": "Seattle Reign FC",
                "commence_time": "2026-04-10T02:00:00Z",
                "bookmakers": [
                    {
                        "key": "draftkings",
                        "title": "DraftKings",
                        "last_update": "2026-04-09T17:55:00Z",
                        "markets": [
                            {
                                "key": "h2h",
                                "outcomes": [
                                    {"name": "Portland Thorns FC", "price": 1.92},
                                    {"name": "Draw", "price": 3.45},
                                    {"name": "Seattle Reign FC", "price": 3.85},
                                ],
                            },
                            {
                                "key": "totals",
                                "outcomes": [
                                    {"name": "Over", "price": 1.98, "point": 2.5},
                                    {"name": "Under", "price": 1.84, "point": 2.5},
                                ],
                            },
                        ],
                    },
                    {
                        "key": "fanduel",
                        "title": "FanDuel",
                        "last_update": "2026-04-09T17:58:00Z",
                        "markets": [
                            {
                                "key": "h2h",
                                "outcomes": [
                                    {"name": "Portland Thorns FC", "price": 1.95},
                                    {"name": "Draw", "price": 3.40},
                                    {"name": "Seattle Reign FC", "price": 3.80},
                                ],
                            },
                            {
                                "key": "totals",
                                "outcomes": [
                                    {"name": "Over", "price": 2.01, "point": 2.5},
                                    {"name": "Under", "price": 1.82, "point": 2.5},
                                ],
                            },
                        ],
                    },
                ],
            }
        ],
    }

    odds = normalize_provider_payload(
        payload,
        match_reference=match_reference,
        source_type="current",
        config=OddsProviderConfig(),
    )

    assert set(odds["market_type"]) == {"1x2", "total"}
    assert odds["match_id"].nunique() == 1
    assert odds["match_id"].iloc[0] == "m1"
    assert set(odds["sportsbook"]) == {"DraftKings", "FanDuel"}
    assert set(odds["source_type"]) == {"current"}

    consensus = build_consensus_match_odds(odds, source_type="current")
    assert len(consensus) == 1
    assert consensus.loc[0, "home_odds"] == pytest.approx((1.92 + 1.95) / 2, rel=1e-6)
    assert consensus.loc[0, "draw_odds"] == pytest.approx((3.45 + 3.40) / 2, rel=1e-6)
    assert consensus.loc[0, "away_odds"] == pytest.approx((3.85 + 3.80) / 2, rel=1e-6)
    assert consensus.loc[0, "total_line"] == pytest.approx(2.5)
    assert consensus.loc[0, "over_odds"] == pytest.approx((1.98 + 2.01) / 2, rel=1e-6)
    assert consensus.loc[0, "under_odds"] == pytest.approx((1.84 + 1.82) / 2, rel=1e-6)
