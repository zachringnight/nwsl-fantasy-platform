import pandas as pd

from src.odds.snapshots import append_snapshot_file, append_snapshot_rows, materialize_closing_odds


EXPECTED_SNAPSHOT_COLUMNS = [
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


def test_append_snapshot_rows_returns_stable_columns_when_empty() -> None:
    combined = append_snapshot_rows(pd.DataFrame(), pd.DataFrame())

    assert combined.empty
    assert combined.columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_append_snapshot_rows_uses_fixed_output_column_order() -> None:
    incoming = pd.DataFrame(
        [
            {
                "source_type": "current",
                "away_odds": 3.6,
                "draw_odds": 3.2,
                "home_odds": 2.0,
                "line": None,
                "market_type": "1x2",
                "sportsbook": "FootyStats",
                "timestamp": "2026-05-25T23:01:00+00:00",
                "match_id": "1",
            }
        ]
    )

    combined = append_snapshot_rows(pd.DataFrame(), incoming)

    assert combined.columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_append_snapshot_file_dedupes_blank_odds_fields_and_creates_parent(tmp_path) -> None:
    incoming_path = tmp_path / "incoming.csv"
    snapshot_path = tmp_path / "nested" / "odds_snapshots.csv"
    incoming_path.write_text(
        "match_id,timestamp,sportsbook,market_type,line,home_odds,draw_odds,away_odds,"
        "over_odds,under_odds,source_type\n"
        "1,2026-05-25T23:01:00+00:00,FootyStats,1x2,,2.0,3.2,3.6,,,current\n"
    )

    first = append_snapshot_file(snapshot_path, incoming_path)
    second = append_snapshot_file(snapshot_path, incoming_path)

    assert snapshot_path.exists()
    assert len(first) == 1
    assert len(second) == 1
    assert pd.read_csv(snapshot_path).columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_materialize_closing_odds_picks_latest_snapshot_before_match() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.05,
                "draw_odds": 3.25,
                "away_odds": 3.45,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-05-29T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.95,
                "draw_odds": 3.30,
                "away_odds": 3.70,
                "source_type": "current",
            },
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.to_dict("records")[0]["source_type"] == "close"
    assert close.to_dict("records")[0]["home_odds"] == 1.95
