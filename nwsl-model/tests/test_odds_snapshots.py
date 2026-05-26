import pandas as pd

from src.odds.snapshots import append_snapshot_rows


def test_append_snapshot_rows_deduplicates_same_capture() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T23:01:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.6,
                "source_type": "current",
            }
        ]
    )
    incoming = existing.copy()

    combined = append_snapshot_rows(existing, incoming)

    assert len(combined) == 1
    assert combined.loc[0, "home_odds"] == 2.0


def test_append_snapshot_rows_keeps_new_price_change() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T23:01:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.6,
                "source_type": "current",
            }
        ]
    )
    incoming = existing.copy()
    incoming.loc[0, "timestamp"] = "2026-05-26T23:01:00+00:00"
    incoming.loc[0, "home_odds"] = 1.95

    combined = append_snapshot_rows(existing, incoming)

    assert len(combined) == 2
    assert combined["timestamp"].tolist() == [
        "2026-05-25T23:01:00+00:00",
        "2026-05-26T23:01:00+00:00",
    ]
