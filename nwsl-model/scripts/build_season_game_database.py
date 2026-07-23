#!/usr/bin/env python3
"""Build a season database of fixtures, projections, market lines, and results."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.betting.recommendations import BetSelectionConfig, load_bet_selection_config
from src.odds.normalization import normalize_odds_frame
from src.utils.artifacts import resolve_version_dir
from src.utils.dates import parse_mixed_utc_datetime
from src.utils.io import load_config

UTC = timezone.utc
MAIN_TABLE = "season_game_model_lines_results"
ODDS_TABLE = "odds_lines"
METADATA_TABLE = "metadata"


def _read_csv(path: Path, *, dtype: dict[str, str] | None = None) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype=dtype)


def _safe_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        output = float(value)
    except (TypeError, ValueError):
        return None
    return output


def _fair_odds(probability: Any) -> float | None:
    value = _safe_float(probability)
    if value is None or value <= 0.0:
        return None
    return 1.0 / value


def _expected_value(probability: Any, odds: Any) -> float | None:
    prob = _safe_float(probability)
    price = _safe_float(odds)
    if prob is None or price is None or price <= 1.0:
        return None
    return float(prob) * float(price) - 1.0


def _result_side(home_goals: Any, away_goals: Any) -> str | None:
    home = _safe_float(home_goals)
    away = _safe_float(away_goals)
    if home is None or away is None:
        return None
    if home > away:
        return "home"
    if away > home:
        return "away"
    return "draw"


def _total_result(total_goals: Any, line: Any) -> str | None:
    total = _safe_float(total_goals)
    threshold = _safe_float(line)
    if total is None or threshold is None:
        return None
    if total > threshold:
        return "over"
    if total < threshold:
        return "under"
    return "push"


def _devig(prices: list[Any]) -> list[float | None]:
    numeric = [_safe_float(price) for price in prices]
    if any(price is None or price <= 1.0 for price in numeric):
        return [None for _ in numeric]
    implied = [1.0 / float(price) for price in numeric]
    total = sum(implied)
    if total <= 0.0:
        return [None for _ in numeric]
    return [value / total for value in implied]


def _model_pick(row: pd.Series) -> tuple[str | None, float | None]:
    probs = {
        "home": _safe_float(row.get("projected_home_win_prob")),
        "draw": _safe_float(row.get("projected_draw_prob")),
        "away": _safe_float(row.get("projected_away_win_prob")),
    }
    valid = {side: prob for side, prob in probs.items() if prob is not None}
    if not valid:
        return None, None
    side, prob = max(valid.items(), key=lambda item: item[1])
    return side, float(prob)


def _total_probabilities_for_market_line(row: pd.Series) -> tuple[float | None, float | None]:
    line = _safe_float(row.get("market_total_line"))
    projected_line = _safe_float(row.get("projected_market_total_line"))
    projected_over = _safe_float(row.get("projected_over_market_total_prob"))
    projected_under = _safe_float(row.get("projected_under_market_total_prob"))
    if (
        line is not None
        and projected_line is not None
        and abs(line - projected_line) < 1e-9
        and projected_over is not None
    ):
        return projected_over, projected_under if projected_under is not None else 1.0 - projected_over
    if line is not None and abs(line - 2.5) < 1e-9:
        over = _safe_float(row.get("projected_over_2_5_prob"))
        under = _safe_float(row.get("projected_under_2_5_prob"))
        if over is not None:
            return over, under if under is not None else 1.0 - over
    if projected_over is not None:
        return projected_over, projected_under if projected_under is not None else 1.0 - projected_over
    return None, None


def _confidence_score(market_type: str, probability: float) -> float:
    baseline = 1.0 / 3.0 if market_type == "1x2" else 0.5
    return max(0.0, abs(float(probability) - baseline))


def _passes_selection_rules(candidate: dict[str, Any], selection_config: BetSelectionConfig | None) -> bool:
    if selection_config is None:
        return True
    market_type = str(candidate["market"])
    side = str(candidate["pick"])
    if market_type not in selection_config.allowed_markets:
        return False
    rule = selection_config.rule_for(market_type, side)
    if not rule.enabled:
        return False
    price = _safe_float(candidate.get("odds"))
    ev = _safe_float(candidate.get("expected_value"))
    probability = _safe_float(candidate.get("probability"))
    probability_edge = _safe_float(candidate.get("probability_edge"))
    if price is None or ev is None or probability is None:
        return False
    if rule.allowed_sides and side.lower() not in rule.allowed_sides:
        return False
    if rule.min_market_price is not None and price < float(rule.min_market_price):
        return False
    if rule.max_market_price is not None and price > float(rule.max_market_price):
        return False
    if ev < float(rule.min_edge):
        return False
    if _confidence_score(market_type, probability) < float(rule.min_confidence):
        return False
    if rule.min_probability_edge is not None:
        if probability_edge is None or probability_edge < float(rule.min_probability_edge):
            return False
    if rule.max_probability_edge is not None and probability_edge is not None:
        if probability_edge > float(rule.max_probability_edge):
            return False
    return True


def _ev_pick(row: pd.Series, selection_config: BetSelectionConfig | None = None) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []

    for side, prob_col, odds_col, no_vig_col in [
        ("home", "projected_home_win_prob", "market_home_odds", "market_no_vig_home_prob"),
        ("draw", "projected_draw_prob", "market_draw_odds", "market_no_vig_draw_prob"),
        ("away", "projected_away_win_prob", "market_away_odds", "market_no_vig_away_prob"),
    ]:
        prob = _safe_float(row.get(prob_col))
        price = _safe_float(row.get(odds_col))
        ev = _expected_value(prob, price)
        if prob is None or price is None or ev is None:
            continue
        no_vig = _safe_float(row.get(no_vig_col))
        candidates.append(
            {
                "market": "1x2",
                "pick": side,
                "line": None,
                "probability": prob,
                "odds": price,
                "no_vig_probability": no_vig,
                "probability_edge": None if no_vig is None else prob - no_vig,
                "expected_value": ev,
            }
        )

    over_prob, under_prob = _total_probabilities_for_market_line(row)
    total_line = _safe_float(row.get("market_total_line"))
    for side, prob, odds_col, no_vig_col in [
        ("over", over_prob, "market_over_odds", "market_no_vig_over_prob"),
        ("under", under_prob, "market_under_odds", "market_no_vig_under_prob"),
    ]:
        price = _safe_float(row.get(odds_col))
        ev = _expected_value(prob, price)
        if prob is None or price is None or ev is None:
            continue
        no_vig = _safe_float(row.get(no_vig_col))
        candidates.append(
            {
                "market": "total",
                "pick": side,
                "line": total_line,
                "probability": prob,
                "odds": price,
                "no_vig_probability": no_vig,
                "probability_edge": None if no_vig is None else prob - no_vig,
                "expected_value": ev,
            }
        )

    if not candidates:
        return {
            "model_pick_market": None,
            "model_pick": None,
            "model_pick_line": None,
            "model_pick_prob": None,
            "model_pick_odds": None,
            "model_pick_no_vig_prob": None,
            "model_pick_probability_edge": None,
            "model_pick_expected_value": None,
            "model_pick_reason": "missing_market_or_projection",
        }

    eligible = [
        candidate
        for candidate in candidates
        if _passes_selection_rules(candidate, selection_config)
    ]
    if not eligible:
        best_candidate = max(candidates, key=lambda item: item["expected_value"])
        return {
            "model_pick_market": None,
            "model_pick": None,
            "model_pick_line": None,
            "model_pick_prob": None,
            "model_pick_odds": None,
            "model_pick_no_vig_prob": None,
            "model_pick_probability_edge": None,
            "model_pick_expected_value": float(best_candidate["expected_value"]),
            "model_pick_reason": "no_eligible_ev_after_market_rules",
        }

    best = max(eligible, key=lambda item: item["expected_value"])
    if float(best["expected_value"]) <= 0.0:
        return {
            "model_pick_market": None,
            "model_pick": None,
            "model_pick_line": None,
            "model_pick_prob": None,
            "model_pick_odds": None,
            "model_pick_no_vig_prob": None,
            "model_pick_probability_edge": None,
            "model_pick_expected_value": float(best["expected_value"]),
            "model_pick_reason": "no_positive_ev",
        }
    return {
        "model_pick_market": best["market"],
        "model_pick": best["pick"],
        "model_pick_line": best["line"],
        "model_pick_prob": best["probability"],
        "model_pick_odds": best["odds"],
        "model_pick_no_vig_prob": best["no_vig_probability"],
        "model_pick_probability_edge": best["probability_edge"],
        "model_pick_expected_value": best["expected_value"],
        "model_pick_reason": "positive_ev",
    }


def _pick_outcome(row: pd.Series) -> str | None:
    pick = row.get("model_pick")
    market = row.get("model_pick_market")
    if pick is None or pd.isna(pick) or market is None or pd.isna(market):
        return None
    if str(market) == "1x2":
        actual = row.get("actual_result")
        if actual is None or pd.isna(actual):
            return None
        return "win" if str(actual) == str(pick) else "loss"
    if str(market) == "total":
        total_result = _total_result(row.get("actual_total_goals"), row.get("model_pick_line"))
        if total_result is None:
            return None
        if total_result == "push":
            return "push"
        return "win" if total_result == str(pick) else "loss"
    return None


def _pick_correct(row: pd.Series) -> bool | None:
    outcome = _pick_outcome(row)
    if outcome is None or outcome == "push":
        return None
    return outcome == "win"


def _pick_pnl_per_unit(row: pd.Series) -> float | None:
    outcome = row.get("model_pick_result")
    if outcome is None or pd.isna(outcome):
        return None
    if outcome == "push":
        return 0.0
    if outcome == "loss":
        return -1.0
    price = _safe_float(row.get("model_pick_odds"))
    if outcome == "win" and price is not None:
        return price - 1.0
    return None


def _season_fixtures(matches: pd.DataFrame, upcoming: pd.DataFrame, season: int) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for frame in (matches, upcoming):
        if frame.empty or "season" not in frame.columns:
            continue
        subset = frame.loc[pd.to_numeric(frame["season"], errors="coerce").eq(int(season))].copy()
        if not subset.empty:
            frames.append(subset)
    if not frames:
        return pd.DataFrame()

    fixtures = pd.concat(frames, ignore_index=True, sort=False)
    fixtures["match_id"] = fixtures["match_id"].astype(str)
    status_rank = fixtures.get("match_status", pd.Series("", index=fixtures.index)).astype(str).map(
        {"completed": 0, "final": 0, "scheduled": 1}
    ).fillna(2)
    fixtures["_status_rank"] = status_rank
    fixtures = fixtures.sort_values(["match_id", "_status_rank"]).drop_duplicates("match_id", keep="first")
    fixtures = fixtures.drop(columns=["_status_rank"])
    fixtures["match_date"] = pd.to_datetime(fixtures["match_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    return fixtures.sort_values(["match_date", "match_id"]).reset_index(drop=True)


def _prepare_projection_table(
    predictions: pd.DataFrame,
    *,
    projection_source: str,
    model_version: str,
    model_family: str,
) -> pd.DataFrame:
    columns = [
        "match_id",
        "prob_home",
        "prob_draw",
        "prob_away",
        "lambda_home",
        "lambda_away",
        "prob_over_2.5",
        "prob_under_2.5",
        "fair_over_2.5",
        "fair_under_2.5",
        "main_total_line",
        "prob_over_main_total",
        "prob_under_main_total",
        "fair_over_main_total",
        "fair_under_main_total",
        "top_pick_tier",
        "recommended_bets",
        "recommended_leans",
        "actionable_picks",
        "rejected_bet_reasons",
    ]
    if predictions.empty:
        return pd.DataFrame(columns=columns)

    output = predictions.copy()
    output["match_id"] = output["match_id"].astype(str)
    for column in columns:
        if column not in output.columns:
            output[column] = pd.NA
    if "prob_under_2.5" not in predictions.columns and "prob_over_2.5" in predictions.columns:
        output["prob_under_2.5"] = 1.0 - pd.to_numeric(output["prob_over_2.5"], errors="coerce")

    output = output[columns].copy()
    output = output.rename(
        columns={
            "prob_home": "projected_home_win_prob",
            "prob_draw": "projected_draw_prob",
            "prob_away": "projected_away_win_prob",
            "lambda_home": "projected_home_goals",
            "lambda_away": "projected_away_goals",
            "prob_over_2.5": "projected_over_2_5_prob",
            "prob_under_2.5": "projected_under_2_5_prob",
            "fair_over_2.5": "projected_fair_over_2_5_odds",
            "fair_under_2.5": "projected_fair_under_2_5_odds",
            "main_total_line": "projected_market_total_line",
            "prob_over_main_total": "projected_over_market_total_prob",
            "prob_under_main_total": "projected_under_market_total_prob",
            "fair_over_main_total": "projected_fair_over_market_total_odds",
            "fair_under_main_total": "projected_fair_under_market_total_odds",
        }
    )
    output["projection_source"] = projection_source
    output["model_version"] = model_version
    output["model_family"] = model_family
    return output


def _pick_projection_source(row: pd.Series) -> str:
    status = str(row.get("match_status", "")).lower()
    existing = row.get("projection_source")
    if isinstance(existing, str) and existing:
        return existing
    if status in {"completed", "final"}:
        return "unavailable_pre_backtest_training_window"
    return "missing_current_projection"


def _select_market_rows(fixtures: pd.DataFrame, odds: pd.DataFrame, market_type: str) -> pd.DataFrame:
    if odds.empty:
        return pd.DataFrame(columns=["match_id"])
    frame = odds.copy()
    frame["match_id"] = frame["match_id"].astype(str)
    frame["market_type"] = frame["market_type"].astype(str).str.lower()
    frame["source_type"] = frame.get("source_type", "close").astype(str).str.lower()
    frame = frame.loc[frame["market_type"].eq(market_type)].copy()
    if frame.empty:
        return pd.DataFrame(columns=["match_id"])

    status = fixtures[["match_id", "match_status"]].copy()
    status["match_id"] = status["match_id"].astype(str)
    status["preferred_source_type"] = status["match_status"].astype(str).str.lower().map(
        lambda value: "close" if value in {"completed", "final"} else "current"
    )
    frame = frame.merge(status[["match_id", "preferred_source_type"]], on="match_id", how="inner")
    frame["_source_rank"] = (frame["source_type"] != frame["preferred_source_type"]).astype(int)
    frame["timestamp"] = parse_mixed_utc_datetime(frame.get("timestamp"))
    frame = frame.sort_values(["match_id", "_source_rank", "timestamp"])
    return frame.groupby("match_id", as_index=False).tail(1).drop(columns=["_source_rank"])


def _market_tables(fixtures: pd.DataFrame, odds: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    moneyline = _select_market_rows(fixtures, odds, "1x2")
    total = _select_market_rows(fixtures, odds, "total")

    if not moneyline.empty:
        moneyline_probs = moneyline.apply(
            lambda row: _devig([row.get("home_odds"), row.get("draw_odds"), row.get("away_odds")]),
            axis=1,
            result_type="expand",
        )
        moneyline_probs.columns = [
            "market_no_vig_home_prob",
            "market_no_vig_draw_prob",
            "market_no_vig_away_prob",
        ]
        moneyline = pd.concat([moneyline.reset_index(drop=True), moneyline_probs.reset_index(drop=True)], axis=1)
        moneyline = moneyline.rename(
            columns={
                "timestamp": "moneyline_observed_at",
                "sportsbook": "moneyline_sportsbook",
                "source_type": "moneyline_source_type",
                "home_odds": "market_home_odds",
                "draw_odds": "market_draw_odds",
                "away_odds": "market_away_odds",
            }
        )
        moneyline = moneyline[
            [
                "match_id",
                "moneyline_observed_at",
                "moneyline_sportsbook",
                "moneyline_source_type",
                "market_home_odds",
                "market_draw_odds",
                "market_away_odds",
                "market_no_vig_home_prob",
                "market_no_vig_draw_prob",
                "market_no_vig_away_prob",
            ]
        ]

    if not total.empty:
        total_probs = total.apply(
            lambda row: _devig([row.get("over_odds"), row.get("under_odds")]),
            axis=1,
            result_type="expand",
        )
        total_probs.columns = ["market_no_vig_over_prob", "market_no_vig_under_prob"]
        total = pd.concat([total.reset_index(drop=True), total_probs.reset_index(drop=True)], axis=1)
        total = total.rename(
            columns={
                "timestamp": "total_observed_at",
                "sportsbook": "total_sportsbook",
                "source_type": "total_source_type",
                "line": "market_total_line",
                "over_odds": "market_over_odds",
                "under_odds": "market_under_odds",
            }
        )
        total = total[
            [
                "match_id",
                "total_observed_at",
                "total_sportsbook",
                "total_source_type",
                "market_total_line",
                "market_over_odds",
                "market_under_odds",
                "market_no_vig_over_prob",
                "market_no_vig_under_prob",
            ]
        ]

    return moneyline, total


def build_season_game_table(
    *,
    fixtures: pd.DataFrame,
    odds: pd.DataFrame,
    completed_predictions: pd.DataFrame,
    upcoming_predictions: pd.DataFrame,
    season: int,
    model_version: str,
    model_family: str,
    completed_projection_source: str | None = None,
    selection_config: BetSelectionConfig | None = None,
) -> pd.DataFrame:
    if fixtures.empty:
        return pd.DataFrame()

    table = fixtures.copy()
    table["match_id"] = table["match_id"].astype(str)
    completed_proj = _prepare_projection_table(
        completed_predictions,
        projection_source=completed_projection_source or f"chronological_backtest_{model_family}",
        model_version=model_version,
        model_family=model_family,
    )
    upcoming_proj = _prepare_projection_table(
        upcoming_predictions,
        projection_source="current_forward_projection",
        model_version=model_version,
        model_family=model_family,
    )
    projection_frames = [
        frame.dropna(axis=1, how="all")
        for frame in (completed_proj, upcoming_proj)
        if not frame.empty
    ]
    projections = (
        pd.concat(projection_frames, ignore_index=True, sort=False)
        if projection_frames
        else pd.DataFrame()
    )
    if not projections.empty:
        projections = projections.drop_duplicates("match_id", keep="first")
        table = table.merge(projections, on="match_id", how="left")

    moneyline, total = _market_tables(table, odds)
    for market_frame in (moneyline, total):
        if not market_frame.empty:
            table = table.merge(market_frame, on="match_id", how="left")

    table["season"] = int(season)
    table["projection_source"] = table.apply(_pick_projection_source, axis=1)
    table["actual_result"] = table.apply(lambda row: _result_side(row.get("home_goals_90"), row.get("away_goals_90")), axis=1)
    table["actual_total_goals"] = (
        pd.to_numeric(table.get("home_goals_90"), errors="coerce")
        + pd.to_numeric(table.get("away_goals_90"), errors="coerce")
    )
    scheduled = ~table["match_status"].astype(str).str.lower().isin({"completed", "final"})
    table.loc[scheduled, ["home_goals_90", "away_goals_90", "actual_result", "actual_total_goals"]] = pd.NA
    table["actual_over_2_5"] = table["actual_total_goals"].map(
        lambda value: None if pd.isna(value) else bool(float(value) > 2.5)
    )
    table["market_total_result"] = table.apply(
        lambda row: _total_result(row.get("actual_total_goals"), row.get("market_total_line")),
        axis=1,
    )
    table["projected_total_goals"] = (
        pd.to_numeric(table.get("projected_home_goals"), errors="coerce")
        + pd.to_numeric(table.get("projected_away_goals"), errors="coerce")
    )
    table["projected_fair_home_odds"] = table["projected_home_win_prob"].map(_fair_odds)
    table["projected_fair_draw_odds"] = table["projected_draw_prob"].map(_fair_odds)
    table["projected_fair_away_odds"] = table["projected_away_win_prob"].map(_fair_odds)
    probability_pick_values = table.apply(_model_pick, axis=1)
    table["probability_pick"] = [item[0] for item in probability_pick_values]
    table["probability_pick_prob"] = [item[1] for item in probability_pick_values]
    table["probability_pick_correct"] = table.apply(
        lambda row: None
        if row.get("actual_result") is None or pd.isna(row.get("actual_result")) or row.get("probability_pick") is None
        else row.get("actual_result") == row.get("probability_pick"),
        axis=1,
    )
    table["home_probability_edge_vs_market"] = (
        pd.to_numeric(table.get("projected_home_win_prob"), errors="coerce")
        - pd.to_numeric(table.get("market_no_vig_home_prob"), errors="coerce")
    )
    table["draw_probability_edge_vs_market"] = (
        pd.to_numeric(table.get("projected_draw_prob"), errors="coerce")
        - pd.to_numeric(table.get("market_no_vig_draw_prob"), errors="coerce")
    )
    table["away_probability_edge_vs_market"] = (
        pd.to_numeric(table.get("projected_away_win_prob"), errors="coerce")
        - pd.to_numeric(table.get("market_no_vig_away_prob"), errors="coerce")
    )
    table["over_2_5_probability_edge_vs_market"] = (
        pd.to_numeric(table.get("projected_over_2_5_prob"), errors="coerce")
        - pd.to_numeric(table.get("market_no_vig_over_prob"), errors="coerce")
    )
    ev_pick_values = table.apply(lambda row: _ev_pick(row, selection_config), axis=1)
    for column in [
        "model_pick_market",
        "model_pick",
        "model_pick_line",
        "model_pick_prob",
        "model_pick_odds",
        "model_pick_no_vig_prob",
        "model_pick_probability_edge",
        "model_pick_expected_value",
        "model_pick_reason",
    ]:
        table[column] = [item[column] for item in ev_pick_values]
    table["model_pick_result"] = table.apply(_pick_outcome, axis=1)
    table["model_pick_correct"] = table.apply(_pick_correct, axis=1)
    table["model_pick_pnl_per_unit"] = table.apply(_pick_pnl_per_unit, axis=1)

    preferred_columns = [
        "match_id",
        "season",
        "match_date",
        "match_status",
        "home_team",
        "away_team",
        "venue",
        "projection_source",
        "model_version",
        "model_family",
        "projected_home_win_prob",
        "projected_draw_prob",
        "projected_away_win_prob",
        "projected_fair_home_odds",
        "projected_fair_draw_odds",
        "projected_fair_away_odds",
        "projected_home_goals",
        "projected_away_goals",
        "projected_total_goals",
        "projected_over_2_5_prob",
        "projected_under_2_5_prob",
        "projected_fair_over_2_5_odds",
        "projected_fair_under_2_5_odds",
        "projected_market_total_line",
        "projected_over_market_total_prob",
        "projected_under_market_total_prob",
        "projected_fair_over_market_total_odds",
        "projected_fair_under_market_total_odds",
        "probability_pick",
        "probability_pick_prob",
        "probability_pick_correct",
        "model_pick_market",
        "model_pick",
        "model_pick_line",
        "model_pick_prob",
        "model_pick_odds",
        "model_pick_no_vig_prob",
        "model_pick_probability_edge",
        "model_pick_expected_value",
        "model_pick_reason",
        "model_pick_result",
        "model_pick_correct",
        "model_pick_pnl_per_unit",
        "moneyline_observed_at",
        "moneyline_sportsbook",
        "moneyline_source_type",
        "market_home_odds",
        "market_draw_odds",
        "market_away_odds",
        "market_no_vig_home_prob",
        "market_no_vig_draw_prob",
        "market_no_vig_away_prob",
        "home_probability_edge_vs_market",
        "draw_probability_edge_vs_market",
        "away_probability_edge_vs_market",
        "total_observed_at",
        "total_sportsbook",
        "total_source_type",
        "market_total_line",
        "market_over_odds",
        "market_under_odds",
        "market_no_vig_over_prob",
        "market_no_vig_under_prob",
        "over_2_5_probability_edge_vs_market",
        "home_goals_90",
        "away_goals_90",
        "actual_result",
        "actual_total_goals",
        "actual_over_2_5",
        "market_total_result",
        "top_pick_tier",
        "recommended_bets",
        "recommended_leans",
        "actionable_picks",
        "rejected_bet_reasons",
    ]
    for column in preferred_columns:
        if column not in table.columns:
            table[column] = pd.NA
    return table[preferred_columns].sort_values(["match_date", "match_id"]).reset_index(drop=True)


def write_database(
    *,
    main_table: pd.DataFrame,
    odds: pd.DataFrame,
    output_path: Path,
    metadata: dict[str, Any],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    odds_lines = normalize_odds_frame(odds)
    fixture_ids = set(main_table["match_id"].astype(str))
    if not odds_lines.empty:
        odds_lines = odds_lines.loc[odds_lines["match_id"].astype(str).isin(fixture_ids)].copy()

    metadata_table = pd.DataFrame(
        [{"key": str(key), "value": str(value)} for key, value in sorted(metadata.items())]
    )
    with sqlite3.connect(output_path) as conn:
        main_table.to_sql(MAIN_TABLE, conn, if_exists="replace", index=False)
        odds_lines.to_sql(ODDS_TABLE, conn, if_exists="replace", index=False)
        metadata_table.to_sql(METADATA_TABLE, conn, if_exists="replace", index=False)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{MAIN_TABLE}_match_id ON {MAIN_TABLE}(match_id)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{MAIN_TABLE}_date ON {MAIN_TABLE}(match_date)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{ODDS_TABLE}_match_id ON {ODDS_TABLE}(match_id)")


def build_from_paths(
    *,
    model_root: Path,
    season: int,
    artifact_root: Path,
    version: str | None,
    model_family: str,
    config_path: Path | None = None,
    completed_predictions_path: Path | None = None,
    completed_projection_source: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    version_dir = resolve_version_dir(version, artifact_root)
    raw_dir = model_root / "data" / "raw"
    processed_dir = model_root / "data" / "processed"
    matches = _read_csv(raw_dir / "matches.csv", dtype={"match_id": str})
    upcoming = _read_csv(raw_dir / "upcoming.csv", dtype={"match_id": str})
    odds = _read_csv(raw_dir / "odds.csv", dtype={"match_id": str})
    fixtures = _season_fixtures(matches, upcoming, season)
    completed_source_path = (
        completed_predictions_path
        if completed_predictions_path is not None
        else version_dir / "backtest" / f"predictions_{model_family}.csv"
    )
    completed_predictions = _read_csv(completed_source_path, dtype={"match_id": str})
    upcoming_predictions = _read_csv(processed_dir / "predictions.csv", dtype={"match_id": str})
    selection_config = None
    if config_path is not None:
        resolved_config = config_path if config_path.is_absolute() else model_root / config_path
        selection_config = load_bet_selection_config(load_config(resolved_config))
    main_table = build_season_game_table(
        fixtures=fixtures,
        odds=odds,
        completed_predictions=completed_predictions,
        upcoming_predictions=upcoming_predictions,
        season=season,
        model_version=version_dir.name,
        model_family=model_family,
        completed_projection_source=completed_projection_source,
        selection_config=selection_config,
    )
    completed_mask = main_table["match_status"].astype(str).str.lower().isin({"completed", "final"})
    metadata = {
        "generated_at": datetime.now(UTC).isoformat(),
        "season": season,
        "artifact_version": version_dir.name,
        "model_family": model_family,
        "completed_predictions_path": str(completed_source_path),
        "fixture_count": len(main_table),
        "completed_count": int(completed_mask.sum()),
        "upcoming_count": int((~completed_mask).sum()),
        "completed_projection_count": int(
            (completed_mask & main_table["projected_home_win_prob"].notna()).sum()
        ),
        "chronological_projection_count": int(main_table["projection_source"].astype(str).str.startswith("chronological_backtest").sum()),
        "season_holdout_projection_count": int(main_table["projection_source"].astype(str).str.startswith("season_holdout").sum()),
        "current_forward_projection_count": int(main_table["projection_source"].astype(str).eq("current_forward_projection").sum()),
        "moneyline_line_count": int(main_table["market_home_odds"].notna().sum()),
        "total_line_count": int(main_table["market_total_line"].notna().sum()),
    }
    return main_table, odds, metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NWSL season model/odds/results SQLite database")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--config", default="configs/default.yaml")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", default="")
    parser.add_argument("--model-family", default="spi_lite_baseline")
    parser.add_argument("--completed-predictions", default="")
    parser.add_argument("--completed-projection-source", default="")
    parser.add_argument("--output", default="data/processed/season_game_database.sqlite")
    parser.add_argument("--csv-output", default="data/processed/season_game_model_lines_results.csv")
    args = parser.parse_args()

    model_root = Path(__file__).resolve().parent.parent
    artifact_root = Path(args.artifact_root)
    if not artifact_root.is_absolute():
        artifact_root = model_root / artifact_root
    completed_predictions_path = Path(args.completed_predictions) if args.completed_predictions else None
    if completed_predictions_path is not None and not completed_predictions_path.is_absolute():
        completed_predictions_path = model_root / completed_predictions_path
    main_table, odds, metadata = build_from_paths(
        model_root=model_root,
        season=args.season,
        artifact_root=artifact_root,
        version=args.version or None,
        model_family=args.model_family,
        config_path=Path(args.config) if args.config else None,
        completed_predictions_path=completed_predictions_path,
        completed_projection_source=args.completed_projection_source or None,
    )
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = model_root / output_path
    csv_path = Path(args.csv_output)
    if not csv_path.is_absolute():
        csv_path = model_root / csv_path
    write_database(main_table=main_table, odds=odds, output_path=output_path, metadata=metadata)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    main_table.to_csv(csv_path, index=False)

    print(f"Wrote {len(main_table)} games to {output_path}")
    print(f"Wrote CSV export to {csv_path}")
    for key in [
        "completed_count",
        "upcoming_count",
        "completed_projection_count",
        "chronological_projection_count",
        "season_holdout_projection_count",
        "current_forward_projection_count",
        "moneyline_line_count",
        "total_line_count",
    ]:
        print(f"{key}: {metadata[key]}")


if __name__ == "__main__":
    main()
