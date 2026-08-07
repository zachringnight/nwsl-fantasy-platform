"""Closing-line value for the picks the model actually made.

This answers a narrower and more useful question than the league-wide CLV
report: for every pick we locked into the forward ledger, did the price we
locked beat the price the market closed at?

CLV converges on far fewer samples than ROI, so on a forward log this small it
is the better read on whether an edge exists. It is reported with an explicit
confidence interval and explicit coverage, because a mean CLV computed from a
handful of matched picks is not evidence of anything on its own.

Closing prices are read from two stores, because neither alone is complete:
  * data/raw/odds_normalized.csv -- long/selection-level rows, source_type=close
  * data/raw/closing_odds.csv    -- wide rows materialized from snapshot history

Nothing here re-prices, re-simulates, or drops a losing pick.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Mapping

import pandas as pd

# (match_id, market, side, line_key) -> [decimal close prices]
ClosingIndex = Mapping[tuple[str, str, str, str], list[float]]

SETTLED_RESULTS = frozenset({"win", "loss", "push"})

_WIDE_SIDE_COLUMNS = {
    "1x2": {"home": "home_odds", "draw": "draw_odds", "away": "away_odds"},
    "total": {"over": "over_odds", "under": "under_odds"},
}


def _line_key(value: Any) -> str:
    """Normalize a line to a single comparable key ('' when there is none).

    The ledger writes 2.5, the odds stores variously write 2.5, 2.50 or blank,
    so every lookup goes through this.
    """
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none"}:
        return ""
    try:
        return f"{float(text):g}"
    except ValueError:
        return text


def _decimal(value: Any) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    # A decimal price at or below 1.0 pays nothing; treat it as missing rather
    # than letting it silently distort a mean.
    if not math.isfinite(price) or price <= 1.0:
        return None
    return price


def build_closing_price_index(
    normalized: pd.DataFrame | None,
    materialized: pd.DataFrame | None,
) -> dict[tuple[str, str, str, str], list[float]]:
    """Index every trustworthy closing price by (match, market, side, line)."""
    index: dict[tuple[str, str, str, str], list[float]] = defaultdict(list)

    if normalized is not None and not normalized.empty:
        for row in normalized.to_dict("records"):
            if str(row.get("source_type") or "").lower() != "close":
                continue
            # quality_status is optional in some historical exports; when it is
            # present anything other than 'valid' is excluded on purpose.
            status = row.get("quality_status")
            if status is not None and not pd.isna(status) and str(status).lower() != "valid":
                continue
            price = _decimal(row.get("decimal_odds"))
            if price is None:
                continue
            key = (
                str(row.get("match_id")),
                str(row.get("market_type")),
                str(row.get("selection")),
                _line_key(row.get("line")),
            )
            index[key].append(price)

    if materialized is not None and not materialized.empty:
        for row in materialized.to_dict("records"):
            if str(row.get("source_type") or "").lower() != "close":
                continue
            market = str(row.get("market_type"))
            for side, column in _WIDE_SIDE_COLUMNS.get(market, {}).items():
                price = _decimal(row.get(column))
                if price is None:
                    continue
                key = (str(row.get("match_id")), market, side, _line_key(row.get("line")))
                index[key].append(price)

    return dict(index)


def _lookup(index: ClosingIndex, match_id: str, market: str, side: str, line: Any) -> float | None:
    prices = index.get((match_id, market, side, _line_key(line)))
    if not prices:
        return None
    return sum(prices) / len(prices)


def pick_clv_rows(ledger: pd.DataFrame, index: ClosingIndex) -> list[dict[str, Any]]:
    """Per-pick CLV for every settled pick that has a closing price.

    CLV is expressed in probability points: (1/close) - (1/locked). Positive
    means the locked price was better than where the market closed.
    """
    if ledger is None or ledger.empty:
        return []

    rows: list[dict[str, Any]] = []
    for record in ledger.to_dict("records"):
        if str(record.get("result") or "").lower() not in SETTLED_RESULTS:
            continue
        locked = _decimal(record.get("odds"))
        if locked is None:
            continue
        closing = _lookup(
            index,
            str(record.get("match_id")),
            str(record.get("market")),
            str(record.get("side")),
            record.get("line"),
        )
        if closing is None:
            continue
        rows.append(
            {
                "pick_id": record.get("pick_id"),
                "match_id": str(record.get("match_id")),
                "market": record.get("market"),
                "side": record.get("side"),
                "locked_odds": locked,
                "closing_odds": closing,
                "clv": (1.0 / closing) - (1.0 / locked),
                "result": record.get("result"),
            }
        )
    return rows


def summarize_pick_clv(ledger: pd.DataFrame, index: ClosingIndex) -> dict[str, Any]:
    """Mean pick-level CLV with a 95% interval and honest coverage counts."""
    settled = 0
    if ledger is not None and not ledger.empty and "result" in ledger.columns:
        settled = int(ledger["result"].astype(str).str.lower().isin(SETTLED_RESULTS).sum())

    rows = pick_clv_rows(ledger, index)
    matched = len(rows)
    summary: dict[str, Any] = {
        "settled": settled,
        "matched": matched,
        "unmatched": max(0, settled - matched),
        "beat_close": sum(1 for row in rows if row["clv"] > 0),
        "mean_clv": None,
        "ci_low": None,
        "ci_high": None,
    }
    if matched == 0:
        return summary

    values = [row["clv"] for row in rows]
    mean = sum(values) / matched
    summary["mean_clv"] = mean
    if matched > 1:
        variance = sum((value - mean) ** 2 for value in values) / (matched - 1)
        stderr = math.sqrt(variance) / math.sqrt(matched)
        summary["ci_low"] = mean - 1.96 * stderr
        summary["ci_high"] = mean + 1.96 * stderr
    return summary


def render_clv_line(summary: Mapping[str, Any]) -> str:
    """One report line. Never invents a number it does not have."""
    matched = summary.get("matched", 0)
    settled = summary.get("settled", 0)
    if not matched:
        return (
            f"CLV: unknown (0 of {settled} settled picks could be matched to a closing price)"
        )

    mean = summary.get("mean_clv") or 0.0
    beat = summary.get("beat_close", 0)
    text = (
        f"CLV: {100 * mean:+.2f}pp mean on {matched}/{settled} settled picks "
        f"| beat close {beat}/{matched}"
    )
    low, high = summary.get("ci_low"), summary.get("ci_high")
    if low is None or high is None:
        return text + " | single pick, no interval"
    text += f" | 95% CI [{100 * low:+.2f}pp, {100 * high:+.2f}pp]"
    if low <= 0 <= high:
        text += " (not distinguishable from zero)"
    elif low > 0:
        text += " (positive, interval excludes zero)"
    else:
        text += " (negative, interval excludes zero)"
    return text
