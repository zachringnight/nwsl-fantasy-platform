from __future__ import annotations

import math
from datetime import datetime, timezone

import pandas as pd
import pytest

from src.odds.apify_draftkings import (
    american_to_decimal,
    build_current_odds_contract,
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
