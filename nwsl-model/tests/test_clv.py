from __future__ import annotations

import pandas as pd
import pytest

from src.betting.clv import (
    clv_summary,
    compute_clv_report,
    match_closing_price,
    open_close_clv_report,
)


def test_compute_clv_report_preserves_bet_log_clv_when_close_rematch_missing() -> None:
    bet_log = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "market": "1x2_home",
                "side": "home",
                "market_odds": 2.1,
                "closing_market_odds": 2.1,
                "clv": 0.0,
            }
        ]
    )

    report = compute_clv_report(bet_log, closing_odds=pd.DataFrame())
    summary = clv_summary(report)

    assert report.loc[0, "closing_odds"] == 2.1
    assert report.loc[0, "clv"] == 0.0
    assert summary["n_bets_with_clv"] == 1
    assert summary["mean_clv"] == 0.0


def test_match_closing_price_requires_same_market_book_and_total_line() -> None:
    closes = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book A",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.90,
                "draw_odds": 3.40,
                "away_odds": 4.00,
                "source_type": "close",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book A",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.80,
                "under_odds": 2.00,
                "source_type": "close",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book A",
                "market_type": "total",
                "line": 3.5,
                "over_odds": 2.40,
                "under_odds": 1.55,
                "source_type": "close",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book B",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.25,
                "draw_odds": 3.20,
                "away_odds": 3.40,
                "source_type": "close",
            },
        ]
    )

    assert match_closing_price(
        closes,
        match_id="m1",
        market="1x2_home",
        side="home",
        sportsbook="Book A",
    ) == 1.90
    assert match_closing_price(
        closes,
        match_id="m1",
        market="total_over_2.5",
        side="over",
        sportsbook="Book A",
        line=2.5,
    ) == 1.80
    assert match_closing_price(
        closes,
        match_id="m1",
        market="1x2_home",
        side="home",
        sportsbook="Missing Book",
    ) is None
    assert match_closing_price(
        closes.drop(columns=["sportsbook"]),
        match_id="m1",
        market="1x2_home",
        side="home",
        sportsbook="Book A",
    ) is None
    assert match_closing_price(
        closes,
        match_id="m1",
        market="1x2_home",
        side="home",
    ) is None


def test_compute_clv_report_does_not_cross_match_market_or_sportsbook() -> None:
    bet_log = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "market": "total_over_2.5",
                "side": "over",
                "line": 2.5,
                "sportsbook": "Book A",
                "market_odds": 2.10,
                "closing_market_odds": float("nan"),
                "clv": float("nan"),
            }
        ]
    )
    closes = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book A",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.50,
                "draw_odds": 4.00,
                "away_odds": 7.00,
                "source_type": "close",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book B",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.10,
                "under_odds": 7.00,
                "source_type": "close",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-05-29T17:00:00+00:00",
                "sportsbook": "Book A",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.90,
                "under_odds": 1.95,
                "source_type": "close",
            },
        ]
    )

    report = compute_clv_report(bet_log, closes)

    assert report.loc[0, "closing_odds"] == 1.90
    assert report.loc[0, "clv"] == pytest.approx(2.10 / 1.90 - 1.0)


def _snap(match_id, ts, book, mtype, **odds):
    row = {
        "match_id": match_id, "timestamp": ts, "sportsbook": book,
        "market_type": mtype, "line": odds.get("line"),
        "home_odds": odds.get("home_odds"), "draw_odds": odds.get("draw_odds"),
        "away_odds": odds.get("away_odds"), "over_odds": odds.get("over_odds"),
        "under_odds": odds.get("under_odds"), "source_type": "current",
    }
    return row


def test_open_close_clv_report_computes_per_side_clv_for_moved_lines() -> None:
    # home drifted from 2.10 (open) to 1.90 (close): taking the open beats close.
    snaps = pd.DataFrame(
        [
            _snap("m1", "2026-05-25T12:00:00+00:00", "DraftKings", "1x2", home_odds=2.10, draw_odds=3.3, away_odds=3.5),
            _snap("m1", "2026-05-29T12:00:00+00:00", "DraftKings", "1x2", home_odds=1.90, draw_odds=3.4, away_odds=3.8),
        ]
    )

    report = open_close_clv_report(snaps)

    home = report[(report["match_id"] == "m1") & (report["side"] == "home")].iloc[0]
    assert home["open_odds"] == 2.10
    assert home["close_odds"] == 1.90
    assert abs(home["clv"] - (2.10 / 1.90 - 1.0)) < 1e-9


def test_open_close_clv_report_excludes_single_timestamp_groups() -> None:
    snaps = pd.DataFrame(
        [
            _snap("m1", "2026-05-25T12:00:00+00:00", "DraftKings", "1x2", home_odds=2.10, draw_odds=3.3, away_odds=3.5),
        ]
    )

    report = open_close_clv_report(snaps)

    assert report.empty


def test_open_close_clv_report_summary_aggregates_clv() -> None:
    snaps = pd.DataFrame(
        [
            _snap("m1", "2026-05-25T12:00:00+00:00", "DraftKings", "1x2", home_odds=2.10, draw_odds=3.3, away_odds=3.5),
            _snap("m1", "2026-05-29T12:00:00+00:00", "DraftKings", "1x2", home_odds=1.90, draw_odds=3.4, away_odds=3.8),
        ]
    )

    report = open_close_clv_report(snaps)
    summary = clv_summary(report)

    assert summary["n_bets_with_clv"] == 3  # home, draw, away
    assert "mean_clv" in summary


def test_open_close_clv_report_handles_mixed_timestamp_formats() -> None:
    # Regression: live captures carry microsecond precision while static close
    # rows do not. Naive pd.to_datetime(utc=True) infers one format and coerces
    # the odd-format rows to NaT, dropping exactly the movement we need. The two
    # rows below deliberately mix a non-microsecond timestamp (open) with a
    # microsecond one (close); both must parse so the group keeps two distinct
    # timestamps and the movement is measured.
    snaps = pd.DataFrame(
        [
            _snap("m1", "2026-05-25T12:00:00+00:00", "FootyStats", "1x2", home_odds=1.90, draw_odds=3.40, away_odds=3.74),
            _snap("m1", "2026-05-28T17:24:25.979625+00:00", "FootyStats", "1x2", home_odds=1.85, draw_odds=3.18, away_odds=3.61),
        ]
    )

    report = open_close_clv_report(snaps)

    assert not report.empty
    home = report[(report["match_id"] == "m1") & (report["side"] == "home")].iloc[0]
    assert home["open_odds"] == 1.90
    assert home["close_odds"] == 1.85
