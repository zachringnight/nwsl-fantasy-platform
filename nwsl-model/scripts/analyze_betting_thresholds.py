#!/usr/bin/env python3
"""Analyze historical profitability across candidate edge/confidence thresholds."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.utils.artifacts import resolve_version_dir
from src.utils.io import save_csv, save_json


DEFAULT_EDGE_THRESHOLDS = [0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.10]
DEFAULT_CONFIDENCE_THRESHOLDS = [0.0, 0.03, 0.05, 0.08, 0.10, 0.15]


def _market_group(market: Any) -> str:
    text = str(market or "").lower()
    if text.startswith("1x2_"):
        return "moneyline"
    if text.startswith("total_"):
        return "totals"
    return "other"


def _settle_candidate(row: pd.Series) -> float:
    price = float(row.get("market_price", 0.0) or 0.0)
    if price <= 1.0:
        return 0.0

    home_goals = int(row.get("home_goals_90", 0))
    away_goals = int(row.get("away_goals_90", 0))
    side = str(row.get("side", "")).lower()
    market = str(row.get("market", "")).lower()

    if market.startswith("1x2_"):
        if home_goals > away_goals:
            winner = "home"
        elif home_goals < away_goals:
            winner = "away"
        else:
            winner = "draw"
        return price - 1.0 if side == winner else -1.0

    if market.startswith("total_"):
        line = pd.to_numeric(row.get("line"), errors="coerce")
        if pd.isna(line):
            return 0.0
        total_goals = home_goals + away_goals
        if total_goals == float(line):
            return 0.0
        if side == "over":
            return price - 1.0 if total_goals > float(line) else -1.0
        if side == "under":
            return price - 1.0 if total_goals < float(line) else -1.0

    return 0.0


def _prepare_candidates(decisions: pd.DataFrame, predictions: pd.DataFrame) -> pd.DataFrame:
    if decisions.empty:
        return pd.DataFrame()
    required = {"match_id", "market", "side", "market_price", "edge", "confidence"}
    missing = required - set(decisions.columns)
    if missing:
        raise ValueError(f"decision log missing required columns: {sorted(missing)}")
    if predictions.empty or not {"match_id", "home_goals_90", "away_goals_90"}.issubset(predictions.columns):
        raise ValueError("predictions must include match_id, home_goals_90, and away_goals_90")

    preds = predictions[["match_id", "home_goals_90", "away_goals_90"]].drop_duplicates("match_id")
    frame = decisions.copy()
    frame["match_id"] = frame["match_id"].astype(str)
    preds = preds.copy()
    preds["match_id"] = preds["match_id"].astype(str)
    frame = frame.merge(preds, on="match_id", how="inner")
    frame["market_group"] = frame["market"].map(_market_group)
    frame["edge"] = pd.to_numeric(frame["edge"], errors="coerce").fillna(0.0)
    frame["confidence"] = pd.to_numeric(frame["confidence"], errors="coerce").fillna(0.0)
    frame["market_price"] = pd.to_numeric(frame["market_price"], errors="coerce").fillna(0.0)
    frame["pnl_unit"] = frame.apply(_settle_candidate, axis=1)
    return frame


def analyze_thresholds(
    decisions: pd.DataFrame,
    predictions: pd.DataFrame,
    *,
    edge_thresholds: Iterable[float] = DEFAULT_EDGE_THRESHOLDS,
    confidence_thresholds: Iterable[float] = DEFAULT_CONFIDENCE_THRESHOLDS,
) -> pd.DataFrame:
    """Return flat-stake profitability by market group and threshold pair."""
    candidates = _prepare_candidates(decisions, predictions)
    rows: list[dict[str, Any]] = []
    if candidates.empty:
        return pd.DataFrame(
            columns=[
                "market_group",
                "min_edge",
                "min_confidence",
                "n_bets",
                "wins",
                "losses",
                "pushes",
                "pnl_units",
                "roi_units",
                "hit_rate",
                "avg_edge",
                "avg_confidence",
            ]
        )

    for market_group, group in candidates.groupby("market_group", sort=True):
        if market_group == "other":
            continue
        for min_edge in edge_thresholds:
            for min_confidence in confidence_thresholds:
                selected = group[
                    group["edge"].ge(float(min_edge))
                    & group["confidence"].ge(float(min_confidence))
                    & group["market_price"].gt(1.0)
                ]
                n_bets = int(len(selected))
                pnl = float(selected["pnl_unit"].sum()) if n_bets else 0.0
                wins = int(selected["pnl_unit"].gt(0).sum()) if n_bets else 0
                losses = int(selected["pnl_unit"].lt(0).sum()) if n_bets else 0
                pushes = int(selected["pnl_unit"].eq(0).sum()) if n_bets else 0
                rows.append(
                    {
                        "market_group": market_group,
                        "min_edge": float(min_edge),
                        "min_confidence": float(min_confidence),
                        "n_bets": n_bets,
                        "wins": wins,
                        "losses": losses,
                        "pushes": pushes,
                        "pnl_units": round(pnl, 6),
                        "roi_units": round(float(pnl / n_bets), 6) if n_bets else 0.0,
                        "hit_rate": round(float(wins / n_bets), 6) if n_bets else 0.0,
                        "avg_edge": round(float(selected["edge"].mean()), 6) if n_bets else 0.0,
                        "avg_confidence": round(float(selected["confidence"].mean()), 6) if n_bets else 0.0,
                    }
                )
    return pd.DataFrame(rows)


def _read_model_logs(backtest_dir: Path) -> dict[str, tuple[pd.DataFrame, pd.DataFrame]]:
    logs: dict[str, tuple[pd.DataFrame, pd.DataFrame]] = {}
    for decision_path in sorted(backtest_dir.glob("decision_log_*.csv")):
        model = decision_path.stem.replace("decision_log_", "", 1)
        predictions_path = backtest_dir / f"predictions_{model}.csv"
        if not predictions_path.exists():
            continue
        logs[model] = (pd.read_csv(decision_path), pd.read_csv(predictions_path))
    return logs


def _top_configs(summary: pd.DataFrame, *, min_bets: int) -> list[dict[str, Any]]:
    if summary.empty:
        return []
    eligible = summary[summary["n_bets"].ge(min_bets)].copy()
    if eligible.empty:
        eligible = summary[summary["n_bets"].gt(0)].copy()
    if eligible.empty:
        return []
    ranked = eligible.sort_values(["roi_units", "pnl_units", "n_bets"], ascending=[False, False, False])
    return ranked.head(10).to_dict("records")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze betting threshold profitability")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", default="")
    parser.add_argument("--backtest-dir", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--min-bets", type=int, default=5)
    args = parser.parse_args()

    version_dir = resolve_version_dir(args.version or None, Path(args.artifact_root))
    backtest_dir = Path(args.backtest_dir) if args.backtest_dir else version_dir / "backtest"
    output_dir = Path(args.output_dir) if args.output_dir else version_dir / "betting_analysis"
    output_dir.mkdir(parents=True, exist_ok=True)

    model_logs = _read_model_logs(backtest_dir)
    all_rows: list[pd.DataFrame] = []
    model_summaries: dict[str, Any] = {}
    for model, (decisions, predictions) in model_logs.items():
        summary = analyze_thresholds(decisions, predictions)
        if summary.empty:
            continue
        summary.insert(0, "model", model)
        all_rows.append(summary)
        model_summaries[model] = {
            "candidate_rows": int(len(decisions)),
            "top_configs": _top_configs(summary, min_bets=args.min_bets),
        }

    combined = pd.concat(all_rows, ignore_index=True) if all_rows else pd.DataFrame()
    save_csv(combined, output_dir / "threshold_profitability.csv")
    payload = {
        "version": version_dir.name,
        "backtest_dir": str(backtest_dir),
        "min_bets": int(args.min_bets),
        "models": model_summaries,
    }
    save_json(payload, output_dir / "threshold_profitability_summary.json")
    print(f"Wrote threshold profitability CSV to {output_dir / 'threshold_profitability.csv'}")
    print(f"Wrote threshold profitability summary to {output_dir / 'threshold_profitability_summary.json'}")
    if combined.empty:
        print("No decision logs found. Run backtest after decision-log support is enabled.")
    else:
        print(json.dumps(payload, indent=2, default=str)[:4000])


if __name__ == "__main__":
    main()
