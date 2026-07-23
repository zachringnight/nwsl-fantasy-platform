import pandas as pd

from src.odds.snapshots import (
    append_snapshot_file,
    append_snapshot_rows,
    extract_live_snapshot_rows,
    materialize_closing_odds,
)


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


def test_materialize_closing_odds_allows_same_day_snapshots_for_date_only_matches() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-30T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.90,
                "draw_odds": 3.40,
                "away_odds": 4.10,
                "source_type": "current",
            }
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.to_dict("records")[0]["source_type"] == "close"
    assert close.to_dict("records")[0]["home_odds"] == 1.90


def test_materialize_closing_odds_excludes_snapshots_after_date_only_end_of_day() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-30T22:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.90,
                "draw_odds": 3.40,
                "away_odds": 4.10,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-05-31T00:01:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.80,
                "draw_odds": 3.50,
                "away_odds": 4.30,
                "source_type": "current",
            },
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.to_dict("records")[0]["timestamp"] == "2026-05-30T22:00:00+00:00"
    assert close.to_dict("records")[0]["home_odds"] == 1.90


def test_materialize_closing_odds_uses_match_datetime_when_present() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "match_datetime": "2026-05-30T18:00:00+00:00",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-30T17:30:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.90,
                "draw_odds": 3.40,
                "away_odds": 4.10,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-05-30T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.80,
                "draw_odds": 3.50,
                "away_odds": 4.30,
                "source_type": "current",
            },
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.to_dict("records")[0]["timestamp"] == "2026-05-30T17:30:00+00:00"
    assert close.to_dict("records")[0]["home_odds"] == 1.90


def test_materialize_closing_odds_excludes_outside_window_snapshots() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-22T23:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.10,
                "draw_odds": 3.20,
                "away_odds": 3.50,
                "source_type": "current",
            }
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.empty
    assert close.columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_materialize_closing_odds_preserves_all_rows_at_latest_timestamp() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-29T20:00:00+00:00",
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
                "timestamp": "2026-05-30T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.95,
                "draw_odds": 3.30,
                "away_odds": 3.70,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-05-30T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "total_goals",
                "line": 2.5,
                "over_odds": 2.05,
                "under_odds": 1.75,
                "source_type": "current",
            },
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert len(close) == 2
    assert close["source_type"].tolist() == ["close", "close"]
    assert close["market_type"].tolist() == ["1x2", "total_goals"]


def test_materialize_closing_odds_returns_stable_columns_when_no_close_is_eligible() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "2",
                "timestamp": "2026-05-30T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.90,
                "draw_odds": 3.40,
                "away_odds": 4.10,
                "source_type": "current",
            }
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.empty
    assert close.columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_extract_live_snapshot_rows_keeps_only_live_source_types() -> None:
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T23:01:00+00:00",
                "sportsbook": "DraftKings",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.6,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-03-14T00:00:00+00:00",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.41,
                "draw_odds": 4.1,
                "away_odds": 6.25,
                "source_type": "close",
            },
        ]
    )

    live = extract_live_snapshot_rows(odds)

    assert len(live) == 1
    assert live.iloc[0]["sportsbook"] == "DraftKings"
    assert live.columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_extract_live_snapshot_rows_returns_stable_columns_when_no_live_rows() -> None:
    odds = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-03-14T00:00:00+00:00",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "home_odds": 1.41,
                "source_type": "close",
            }
        ]
    )

    live = extract_live_snapshot_rows(odds)

    assert live.empty
    assert live.columns.tolist() == EXPECTED_SNAPSHOT_COLUMNS


def test_extract_live_snapshot_rows_treats_open_and_live_as_live() -> None:
    odds = pd.DataFrame(
        [
            {"match_id": "1", "timestamp": "t1", "sportsbook": "DK", "market_type": "1x2", "source_type": "open"},
            {"match_id": "1", "timestamp": "t2", "sportsbook": "DK", "market_type": "1x2", "source_type": "LIVE"},
            {"match_id": "1", "timestamp": "t3", "sportsbook": "DK", "market_type": "1x2", "source_type": "close"},
        ]
    )

    live = extract_live_snapshot_rows(odds)

    assert len(live) == 2
    assert set(live["timestamp"]) == {"t1", "t2"}
