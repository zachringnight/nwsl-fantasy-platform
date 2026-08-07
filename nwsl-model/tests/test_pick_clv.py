from __future__ import annotations

import math

import pandas as pd

from src.tracking.pick_clv import (
    build_closing_price_index,
    pick_clv_rows,
    render_clv_line,
    summarize_pick_clv,
)


def _ledger() -> pd.DataFrame:
    return pd.DataFrame(
        [
            # locked 1.85, closed 1.65 -> we beat the close (positive CLV)
            {
                "pick_id": "a",
                "match_id": "401853922",
                "market": "1x2",
                "side": "home",
                "line": None,
                "odds": 1.85,
                "result": "win",
            },
            # locked 3.61, closed 4.25 -> the close was better than our price
            {
                "pick_id": "b",
                "match_id": "401853922",
                "market": "1x2",
                "side": "away",
                "line": None,
                "odds": 3.61,
                "result": "loss",
            },
            # totals carry a line and must match on it
            {
                "pick_id": "c",
                "match_id": "401853922",
                "market": "total",
                "side": "over",
                "line": 2.5,
                "odds": 1.77,
                "result": "win",
            },
            # still pending: must never be counted
            {
                "pick_id": "d",
                "match_id": "401853999",
                "market": "1x2",
                "side": "home",
                "line": None,
                "odds": 2.00,
                "result": "pending",
            },
        ]
    )


def _normalized_close() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "market_type": "1x2",
                "selection": "home",
                "line": "",
                "decimal_odds": 1.65,
                "source_type": "close",
                "quality_status": "valid",
            },
            {
                "match_id": "401853922",
                "market_type": "1x2",
                "selection": "away",
                "line": "",
                "decimal_odds": 4.25,
                "source_type": "close",
                "quality_status": "valid",
            },
            # an opening price for the same side must be ignored
            {
                "match_id": "401853922",
                "market_type": "1x2",
                "selection": "home",
                "line": "",
                "decimal_odds": 2.50,
                "source_type": "open",
                "quality_status": "valid",
            },
            # an invalid close must be ignored
            {
                "match_id": "401853922",
                "market_type": "total",
                "selection": "over",
                "line": "2.5",
                "decimal_odds": 9.99,
                "source_type": "close",
                "quality_status": "rejected",
            },
        ]
    )


def _materialized_close() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "market_type": "total",
                "line": 2.5,
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "over_odds": 1.545,
                "under_odds": 2.30,
                "source_type": "close",
            },
            {
                "match_id": "401853922",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.65,
                "draw_odds": 4.10,
                "away_odds": 4.25,
                "over_odds": None,
                "under_odds": None,
                "source_type": "close",
            },
        ]
    )


def test_index_reads_wide_and_long_close_sources():
    index = build_closing_price_index(_normalized_close(), _materialized_close())
    assert index[("401853922", "1x2", "home", "")] == [1.65, 1.65]
    assert index[("401853922", "total", "over", "2.5")] == [1.545]


def test_index_ignores_non_close_and_invalid_rows():
    index = build_closing_price_index(_normalized_close(), pd.DataFrame())
    # the 2.50 open price must not leak into the close index
    assert 2.50 not in index[("401853922", "1x2", "home", "")]
    # the rejected total close must not appear at all
    assert ("401853922", "total", "over", "2.5") not in index


def test_clv_rows_skip_pending_picks():
    rows = pick_clv_rows(_ledger(), build_closing_price_index(_normalized_close(), _materialized_close()))
    assert {r["pick_id"] for r in rows} == {"a", "b", "c"}


def test_clv_sign_and_magnitude():
    rows = {r["pick_id"]: r for r in pick_clv_rows(_ledger(), build_closing_price_index(_normalized_close(), _materialized_close()))}
    # locked 1.85 (54.05%) vs close 1.65 (60.61%) -> +6.55pp
    assert rows["a"]["clv"] == pytest_approx(1 / 1.65 - 1 / 1.85)
    assert rows["a"]["clv"] > 0
    # locked 3.61 vs close 4.25 -> negative
    assert rows["b"]["clv"] < 0


def test_summary_reports_interval_and_coverage():
    index = build_closing_price_index(_normalized_close(), _materialized_close())
    summary = summarize_pick_clv(_ledger(), index)
    assert summary["settled"] == 3
    assert summary["matched"] == 3
    assert summary["unmatched"] == 0
    assert summary["beat_close"] == 2
    assert summary["ci_low"] < summary["mean_clv"] < summary["ci_high"]


def test_summary_handles_no_matches_without_inventing_a_number():
    summary = summarize_pick_clv(_ledger(), {})
    assert summary["matched"] == 0
    assert summary["mean_clv"] is None
    assert summary["ci_low"] is None
    line = render_clv_line(summary)
    assert "unknown" in line.lower()
    # must never print a fabricated +0.00pp when nothing matched
    assert "+0.00pp" not in line


def test_render_line_flags_an_interval_that_includes_zero():
    index = build_closing_price_index(_normalized_close(), _materialized_close())
    summary = summarize_pick_clv(_ledger(), index)
    line = render_clv_line(summary)
    assert "CLV" in line
    assert "3/3" in line or "3 of 3" in line
    if summary["ci_low"] is not None and summary["ci_low"] <= 0 <= summary["ci_high"]:
        assert "not distinguishable from zero" in line


def pytest_approx(value: float, tol: float = 1e-9):
    class _Approx:
        def __eq__(self, other: object) -> bool:
            return isinstance(other, float) and math.isclose(other, value, rel_tol=tol, abs_tol=tol)

        def __repr__(self) -> str:  # pragma: no cover - debug aid
            return f"approx({value})"

    return _Approx()
