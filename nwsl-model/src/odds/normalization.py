"""Normalize wide odds rows into one row per market selection."""

from __future__ import annotations

from typing import Any

import pandas as pd

NORMALIZED_ODDS_COLUMNS = [
    "match_id",
    "observed_at",
    "sportsbook",
    "market_type",
    "selection",
    "line",
    "american_odds",
    "decimal_odds",
    "source_type",
    "quality_status",
]


def decimal_to_american(decimal_odds: float) -> int | None:
    if pd.isna(decimal_odds) or float(decimal_odds) <= 1.0:
        return None
    value = float(decimal_odds)
    if value >= 2.0:
        return int(round((value - 1.0) * 100))
    return int(round(-100.0 / (value - 1.0)))


def _quality_status(market_type: str, selection: str, line: Any, decimal_odds: Any) -> str:
    price = pd.to_numeric(pd.Series([decimal_odds]), errors="coerce").iloc[0]
    if pd.isna(price):
        return "rejected_missing_price"
    if float(price) <= 1.0:
        return "rejected_invalid_price"
    if market_type == "total" and pd.isna(line):
        return "rejected_missing_line"
    if selection not in {"home", "draw", "away", "over", "under"}:
        return "rejected_unknown_selection"
    return "valid"


def _selection_specs(row: pd.Series) -> list[tuple[str, Any]]:
    market_type = str(row.get("market_type", "")).lower()
    if market_type == "1x2":
        return [
            ("home", row.get("home_odds")),
            ("draw", row.get("draw_odds")),
            ("away", row.get("away_odds")),
        ]
    if market_type in {"total", "totals"}:
        return [
            ("over", row.get("over_odds")),
            ("under", row.get("under_odds")),
        ]
    return []


def normalize_odds_frame(
    odds: pd.DataFrame,
    *,
    include_rejected: bool = False,
) -> pd.DataFrame:
    """Return a model-ready long odds table.

    Existing ingestion stores one row per market with wide price columns. This
    function creates the safer product schema: one row per selection with a
    quality status that downstream tools can filter on.
    """
    if odds is None or odds.empty:
        return pd.DataFrame(columns=NORMALIZED_ODDS_COLUMNS)

    records: list[dict[str, Any]] = []
    for _, row in odds.iterrows():
        market_type = str(row.get("market_type", "")).lower()
        if market_type == "totals":
            market_type = "total"
        for selection, decimal_odds in _selection_specs(row):
            status = _quality_status(market_type, selection, row.get("line"), decimal_odds)
            if status != "valid" and not include_rejected:
                continue
            decimal_value = pd.to_numeric(pd.Series([decimal_odds]), errors="coerce").iloc[0]
            records.append(
                {
                    "match_id": str(row.get("match_id", "")),
                    "observed_at": row.get("timestamp"),
                    "sportsbook": row.get("sportsbook", ""),
                    "market_type": market_type,
                    "selection": selection,
                    "line": row.get("line") if market_type == "total" else pd.NA,
                    "american_odds": decimal_to_american(float(decimal_value)) if pd.notna(decimal_value) else None,
                    "decimal_odds": float(decimal_value) if pd.notna(decimal_value) else pd.NA,
                    "source_type": str(row.get("source_type", "")).lower(),
                    "quality_status": status,
                }
            )

    return pd.DataFrame(records, columns=NORMALIZED_ODDS_COLUMNS)
