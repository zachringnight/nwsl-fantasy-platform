"""CSV-backed ledger for candidate and placed bets."""

from __future__ import annotations

from datetime import datetime, timezone

UTC = timezone.utc
from pathlib import Path
from typing import Any

import pandas as pd

from src.betting.clv import compute_clv_report
from src.betting.recommendations import BetDecision
from src.betting.settlement import settle_1x2, settle_total
from src.utils.io import load_csv, save_csv

LEDGER_COLUMNS = [
    "run_id",
    "status",
    "decision_reason",
    "match_id",
    "slate_key",
    "sportsbook",
    "market",
    "side",
    "line",
    "source_type",
    "timestamp",
    "model_probability",
    "model_price",
    "market_price",
    "edge",
    "confidence",
    "confidence_band",
    "stake",
    "stake_pct",
    "model_version",
    "model_family",
    "blended",
    "gating_status",
    "placed_at",
    "closing_price",
    "result",
    "pnl",
    "clv",
]


def decisions_to_ledger_rows(decisions: list[BetDecision], run_id: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for decision in decisions:
        rows.append(
            {
                "run_id": run_id,
                "status": "candidate",
                "decision_reason": decision.reason,
                "match_id": decision.match_id,
                "slate_key": decision.slate_key,
                "sportsbook": decision.sportsbook,
                "market": decision.market,
                "side": decision.side,
                "line": decision.line,
                "source_type": decision.source_type,
                "timestamp": decision.timestamp,
                "model_probability": decision.model_probability,
                "model_price": decision.model_price,
                "market_price": decision.market_price,
                "edge": decision.edge,
                "confidence": decision.confidence,
                "confidence_band": decision.confidence_band,
                "stake": decision.stake,
                "stake_pct": decision.stake_pct,
                "model_version": decision.model_version,
                "model_family": decision.model_family,
                "blended": decision.blended,
                "gating_status": decision.gating_status,
                "placed_at": None,
                "closing_price": None,
                "result": None,
                "pnl": None,
                "clv": None,
            }
        )
    return pd.DataFrame(rows, columns=LEDGER_COLUMNS)


def load_ledger(path: str | Path) -> pd.DataFrame:
    ledger_path = Path(path)
    if not ledger_path.exists():
        return pd.DataFrame(columns=LEDGER_COLUMNS)
    ledger = load_csv(ledger_path)
    for column in LEDGER_COLUMNS:
        if column not in ledger.columns:
            ledger[column] = None
    return ledger[LEDGER_COLUMNS].copy()


def append_ledger_rows(path: str | Path, rows: pd.DataFrame) -> pd.DataFrame:
    ledger = load_ledger(path)
    if rows.empty:
        return ledger
    if ledger.empty:
        combined = rows[LEDGER_COLUMNS].copy()
    else:
        combined = pd.concat([ledger, rows[LEDGER_COLUMNS]], ignore_index=True)
    save_csv(combined, path)
    return combined


def record_manual_placement(
    path: str | Path,
    *,
    run_id: str,
    match_id: str,
    sportsbook: str,
    market: str,
    side: str,
    line: float | None,
    placed_at: datetime | None = None,
    market_price: float | None = None,
) -> pd.DataFrame:
    ledger = load_ledger(path)
    mask = (
        (ledger["run_id"] == run_id)
        & (ledger["match_id"] == match_id)
        & (ledger["sportsbook"] == sportsbook)
        & (ledger["market"] == market)
        & (ledger["side"] == side)
    )
    if line is None:
        mask &= ledger["line"].isna()
    else:
        mask &= (ledger["line"].fillna(line) - float(line)).abs() < 1e-9
    if not mask.any():
        raise ValueError("No candidate ledger row matched the manual placement request.")

    ledger["placed_at"] = ledger["placed_at"].astype(object)
    ledger.loc[mask, "status"] = "placed"
    ledger.loc[mask, "placed_at"] = (placed_at or datetime.now(UTC)).isoformat()
    if market_price is not None:
        ledger.loc[mask, "market_price"] = float(market_price)
    save_csv(ledger, path)
    return ledger


def reconcile_closing_prices(path: str | Path, closing_odds: pd.DataFrame) -> pd.DataFrame:
    ledger = load_ledger(path)
    if ledger.empty:
        return ledger
    placed = ledger[ledger["status"].isin(["candidate", "placed", "settled"])].copy()
    clv_report = compute_clv_report(placed, closing_odds)
    ledger.loc[clv_report.index, "closing_price"] = clv_report["closing_odds"]
    ledger.loc[clv_report.index, "clv"] = clv_report["clv"]
    save_csv(ledger, path)
    return ledger


def settle_ledger(path: str | Path, matches: pd.DataFrame) -> pd.DataFrame:
    ledger = load_ledger(path)
    if ledger.empty:
        return ledger

    matches = matches.copy()
    matches["match_id"] = matches["match_id"].astype(str)
    match_lookup = matches.set_index("match_id")[["home_goals_90", "away_goals_90"]].to_dict("index")

    for idx, row in ledger.iterrows():
        if row["status"] not in {"placed", "settled"}:
            continue
        match_data = match_lookup.get(str(row["match_id"]))
        if not match_data:
            continue
        home_goals = int(match_data["home_goals_90"])
        away_goals = int(match_data["away_goals_90"])
        market_price = float(row["market_price"]) if pd.notna(row["market_price"]) else 0.0
        stake = float(row["stake"]) if pd.notna(row["stake"]) else 0.0
        if market_price <= 1.0 or stake <= 0:
            continue

        if str(row["market"]).startswith("1x2_"):
            result = settle_1x2(str(row["side"])[0].upper(), home_goals, away_goals, market_price, stake)
        elif str(row["market"]).startswith("total_"):
            result = settle_total(str(row["side"]), home_goals + away_goals, float(row["line"]), market_price, stake)
        else:
            continue

        ledger["result"] = ledger["result"].astype(object)
        ledger.at[idx, "status"] = "settled"
        ledger.at[idx, "result"] = result.result.value
        ledger.at[idx, "pnl"] = result.pnl

    save_csv(ledger, path)
    return ledger
