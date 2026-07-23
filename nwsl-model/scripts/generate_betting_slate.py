#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(MODEL_ROOT))

from src.utils.dates import parse_mixed_utc_datetime

REQUIRED_OUTPUT_COLUMNS = [
    "match_id",
    "match_date",
    "home_team",
    "away_team",
    "gating_status",
    "has_market_odds",
    "market_is_fresh",
    "pick_tier",
    "actionable_pick",
    "accepted_bet",
    "bet_reason",
]

MONEYLINE_MARKET_ODDS_COLUMNS = ("mkt_home_odds", "mkt_draw_odds", "mkt_away_odds")
TOTAL_MARKET_ODDS_COLUMNS = ("mkt_over_odds", "mkt_under_odds")
MARKET_ODDS_COLUMNS = MONEYLINE_MARKET_ODDS_COLUMNS + ("main_total_line",) + TOTAL_MARKET_ODDS_COLUMNS
MONEYLINE_ODDS_PRICE_COLUMNS = ("home_odds", "draw_odds", "away_odds")
TOTAL_ODDS_PRICE_COLUMNS = ("over_odds", "under_odds")


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return parsed


def non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be greater than or equal to 0")
    return parsed


def resolve_cli_path(value: str | None, default: str) -> Path:
    if value is None:
        return MODEL_ROOT / default
    path = Path(value)
    return path if path.is_absolute() else Path.cwd() / path


def _as_date(value: Any) -> pd.Timestamp:
    parsed = pd.to_datetime(value, errors="raise")
    if isinstance(parsed, pd.Timestamp):
        return parsed.normalize()
    return pd.Timestamp(parsed).normalize()


def _derive_market_odds(predictions: pd.DataFrame) -> pd.Series:
    market_flag = None
    if "has_market_odds" in predictions.columns:
        market_flag = predictions["has_market_odds"].map(_coerce_bool)

    has_any_price_column = any(column in predictions.columns for column in MARKET_ODDS_COLUMNS)
    if not has_any_price_column:
        if market_flag is not None:
            return market_flag
        return pd.Series(False, index=predictions.index)

    has_moneyline = pd.Series(False, index=predictions.index)
    if all(column in predictions.columns for column in MONEYLINE_MARKET_ODDS_COLUMNS):
        moneyline_prices = predictions[list(MONEYLINE_MARKET_ODDS_COLUMNS)].apply(pd.to_numeric, errors="coerce")
        has_moneyline = moneyline_prices.gt(1.0).all(axis=1)

    has_total = pd.Series(False, index=predictions.index)
    if all(column in predictions.columns for column in ("main_total_line", *TOTAL_MARKET_ODDS_COLUMNS)):
        total_prices = predictions[list(TOTAL_MARKET_ODDS_COLUMNS)].apply(pd.to_numeric, errors="coerce")
        total_line = pd.to_numeric(predictions["main_total_line"], errors="coerce")
        has_total = total_line.notna() & total_prices.gt(1.0).all(axis=1)

    complete_price = has_moneyline | has_total
    if market_flag is not None:
        return market_flag & complete_price
    return complete_price


def _latest_market_metadata(
    odds: pd.DataFrame,
    *,
    as_of: str | pd.Timestamp,
    max_age_minutes: int,
) -> pd.DataFrame:
    if odds.empty or "match_id" not in odds.columns:
        return pd.DataFrame(
            columns=[
                "match_id",
                "market_timestamp",
                "market_sportsbook",
                "market_type",
                "market_types",
                "market_age_minutes",
                "market_is_fresh",
            ]
        )

    frame = odds.copy()
    frame["match_id"] = frame["match_id"].astype(str)
    if "source_type" in frame.columns:
        frame = frame[frame["source_type"].astype(str).str.lower().eq("current")]
    if frame.empty:
        return pd.DataFrame(
            columns=[
                "match_id",
                "market_timestamp",
                "market_sportsbook",
                "market_type",
                "market_types",
                "market_age_minutes",
                "market_is_fresh",
            ]
        )

    market_type = (
        frame["market_type"].astype(str).str.lower()
        if "market_type" in frame.columns
        else pd.Series("1x2", index=frame.index)
    )
    has_moneyline = pd.Series(False, index=frame.index)
    if all(column in frame.columns for column in MONEYLINE_ODDS_PRICE_COLUMNS):
        moneyline_prices = frame[list(MONEYLINE_ODDS_PRICE_COLUMNS)].apply(pd.to_numeric, errors="coerce")
        has_moneyline = market_type.eq("1x2") & moneyline_prices.gt(1.0).all(axis=1)
    has_total = pd.Series(False, index=frame.index)
    if all(column in frame.columns for column in ("line", *TOTAL_ODDS_PRICE_COLUMNS)):
        total_prices = frame[list(TOTAL_ODDS_PRICE_COLUMNS)].apply(pd.to_numeric, errors="coerce")
        total_line = pd.to_numeric(frame["line"], errors="coerce")
        has_total = market_type.isin({"total", "totals"}) & total_line.notna() & total_prices.gt(1.0).all(axis=1)
    frame = frame.loc[has_moneyline | has_total].copy()
    if frame.empty:
        return pd.DataFrame(
            columns=[
                "match_id",
                "market_timestamp",
                "market_sportsbook",
                "market_type",
                "market_types",
                "market_age_minutes",
                "market_is_fresh",
            ]
        )

    frame["timestamp"] = parse_mixed_utc_datetime(frame.get("timestamp"))
    frame = frame.dropna(subset=["timestamp"]).sort_values(["match_id", "timestamp"])
    market_types = (
        frame.groupby("match_id")["market_type"]
        .apply(lambda values: ",".join(sorted({str(value) for value in values.dropna() if str(value)})))
        .rename("market_types")
        .reset_index()
    )
    latest = frame.groupby("match_id", as_index=False).tail(1).copy()
    latest = latest.merge(market_types, on="match_id", how="left")
    reference_time = pd.to_datetime(as_of, utc=True)
    if pd.isna(reference_time):
        reference_time = pd.Timestamp.now(tz="UTC")
    if reference_time.tzinfo is None:
        reference_time = reference_time.tz_localize("UTC")
    age_minutes = (reference_time - latest["timestamp"]).dt.total_seconds() / 60.0
    latest["market_timestamp"] = latest["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    latest["market_sportsbook"] = latest.get("sportsbook", "").astype(str)
    latest["market_type"] = latest.get("market_type", "").astype(str)
    latest["market_age_minutes"] = age_minutes.round(2)
    latest["market_is_fresh"] = latest["market_age_minutes"].between(
        0,
        max_age_minutes,
        inclusive="both",
    )
    return latest[
        [
            "match_id",
            "market_timestamp",
            "market_sportsbook",
            "market_type",
            "market_types",
            "market_age_minutes",
            "market_is_fresh",
        ]
    ]


def _coerce_bool(value: Any) -> bool:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return False
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return bool(value)


def _first_rejection_reason(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "no_bet"
    text = str(value).strip()
    if not text or text.lower() in {"none", "nan"}:
        return "no_bet"
    return text.split(";")[0].split(",")[0].strip() or "no_bet"


def _accepted_bet(row: pd.Series) -> bool:
    if "accepted_bet" in row.index:
        value = row["accepted_bet"]
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return False
        if isinstance(value, str):
            return value.strip().lower() in {"true", "1", "yes"}
        return bool(value)

    accepted_count = pd.to_numeric(row.get("accepted_bet_count", 0), errors="coerce")
    if pd.notna(accepted_count) and float(accepted_count) > 0:
        return True

    recommended = row.get("recommended_bets", "")
    if recommended is None or (isinstance(recommended, float) and pd.isna(recommended)):
        return False
    return str(recommended).strip().lower() not in {"", "none", "nan", "[]"}


def _count_from_row(row: pd.Series, column: str) -> int:
    value = pd.to_numeric(row.get(column, 0), errors="coerce")
    if pd.isna(value):
        return 0
    return int(max(float(value), 0.0))


def _lean_bet_count(row: pd.Series) -> int:
    count = _count_from_row(row, "lean_bet_count")
    if count > 0:
        return count
    recommended = row.get("recommended_leans", "")
    if recommended is None or (isinstance(recommended, float) and pd.isna(recommended)):
        return 0
    text = str(recommended).strip().lower()
    return 0 if text in {"", "none", "nan", "[]"} else len([part for part in text.split(";") if part.strip()])


def _pick_tier(row: pd.Series) -> str:
    if bool(row.get("accepted_bet", False)):
        return "official_pick"
    if _lean_bet_count(row) > 0:
        return "lean"
    return "no_bet"


def _bet_reason(row: pd.Series) -> str:
    pick_tier = str(row.get("pick_tier", "no_bet"))
    if pick_tier == "official_pick":
        return "accepted"
    if pick_tier == "lean":
        reasons = str(row.get("rejected_bet_reasons", "") or "")
        lean_reasons = [
            reason.strip()
            for reason in reasons.replace(",", ";").split(";")
            if reason.strip().startswith("lean_")
        ]
        return lean_reasons[0] if lean_reasons else "lean"
    gating_status = str(row.get("gating_status", "unknown")).lower()
    if gating_status != "passed":
        return "model_gating_not_passed"
    if not bool(row.get("has_market_odds", False)):
        has_market_timestamp = "market_timestamp" in row.index and pd.notna(row.get("market_timestamp"))
        if has_market_timestamp and not bool(row.get("market_is_fresh", False)):
            return "stale_market_price"
        return "missing_market_price"
    if bool(row.get("accepted_bet", False)):
        return "accepted"
    return _first_rejection_reason(row.get("rejected_bet_reasons"))


def filter_near_term_slate(
    predictions: pd.DataFrame,
    as_of: str | pd.Timestamp,
    days: int,
    *,
    odds: pd.DataFrame | None = None,
    odds_as_of: str | pd.Timestamp | None = None,
    max_odds_age_minutes: int = 180,
    require_current_odds: bool = True,
    require_fresh_odds: bool = True,
) -> pd.DataFrame:
    """Return bet-ready matches in the inclusive near-term window."""
    if "match_date" not in predictions.columns:
        raise ValueError("predictions must include match_date")

    start_date = _as_date(as_of)
    end_date = start_date + pd.Timedelta(days=days)

    slate = predictions.copy()
    slate["match_id"] = slate["match_id"].astype(str)
    slate["_match_date"] = pd.to_datetime(slate["match_date"], errors="coerce").dt.normalize()
    slate["has_market_odds"] = _derive_market_odds(slate)
    slate["market_is_fresh"] = slate["has_market_odds"]
    if odds is not None:
        market_metadata = _latest_market_metadata(
            odds,
            as_of=odds_as_of or as_of,
            max_age_minutes=max_odds_age_minutes,
        )
        slate = slate.merge(market_metadata, on="match_id", how="left")
        slate["market_is_fresh"] = slate["market_is_fresh_y"].eq(True)
        slate = slate.drop(columns=["market_is_fresh_y"]).rename(
            columns={"market_is_fresh_x": "market_is_fresh_from_predictions"}
        )
        slate["has_market_odds"] = slate["has_market_odds"] & slate["market_timestamp"].notna()
        if require_fresh_odds:
            slate["has_market_odds"] = slate["has_market_odds"] & slate["market_is_fresh"]

    in_window = slate["_match_date"].between(start_date, end_date, inclusive="both")
    if require_current_odds:
        in_window &= slate["has_market_odds"]
    slate = slate.loc[in_window].copy()

    if "gating_status" not in slate.columns:
        slate["gating_status"] = "unknown"
    for column in ("home_team", "away_team"):
        if column not in slate.columns:
            slate[column] = ""

    slate["accepted_bet"] = slate.apply(_accepted_bet, axis=1)
    slate.loc[slate["gating_status"].astype(str).str.lower() != "passed", "accepted_bet"] = False
    slate.loc[~slate["has_market_odds"], "accepted_bet"] = False
    slate["lean_bet_count"] = slate.apply(_lean_bet_count, axis=1)
    slate.loc[~slate["has_market_odds"], "lean_bet_count"] = 0
    slate["official_pick_count"] = slate.apply(lambda row: _count_from_row(row, "accepted_bet_count"), axis=1)
    slate.loc[~slate["accepted_bet"], "official_pick_count"] = 0
    slate["actionable_pick_count"] = slate["official_pick_count"] + slate["lean_bet_count"]
    slate["pick_tier"] = slate.apply(_pick_tier, axis=1)
    slate["actionable_pick"] = slate["pick_tier"].isin({"official_pick", "lean"})
    slate["bet_reason"] = slate.apply(_bet_reason, axis=1)
    slate["match_date"] = slate["_match_date"].dt.strftime("%Y-%m-%d")

    slate = slate.sort_values(["_match_date", "match_id"]).drop(columns=["_match_date"])
    extra_columns = [
        column
        for column in (
            "model",
            "model_version",
            "model_family",
            "confidence_score",
            "confidence_band",
            "official_pick_count",
            "lean_bet_count",
            "actionable_pick_count",
            "accepted_bet_count",
            "recommended_bets",
            "recommended_leans",
            "actionable_picks",
            "top_pick_tier",
            "rejected_bet_reasons",
            "market_timestamp",
            "market_sportsbook",
            "market_type",
            "market_types",
            "market_age_minutes",
            *MARKET_ODDS_COLUMNS,
        )
        if column in slate.columns and column not in REQUIRED_OUTPUT_COLUMNS
    ]
    return slate[REQUIRED_OUTPUT_COLUMNS + extra_columns].reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a near-term betting slate")
    parser.add_argument("--predictions")
    parser.add_argument("--odds")
    parser.add_argument("--days", type=positive_int, default=14)
    parser.add_argument("--max-odds-age-minutes", type=non_negative_int, default=180)
    parser.add_argument("--output")
    parser.add_argument("--json-output")
    parser.add_argument("--as-of")
    parser.add_argument("--odds-as-of")
    parser.add_argument(
        "--include-missing-market",
        action="store_true",
        help="Include near-term rows without current market odds for diagnostics",
    )
    parser.add_argument(
        "--include-stale-market",
        action="store_true",
        help="Include near-term rows with stale market odds for diagnostics",
    )
    args = parser.parse_args()

    predictions_path = resolve_cli_path(args.predictions, "data/processed/predictions.csv")
    odds_path = resolve_cli_path(args.odds, "data/raw/odds.csv")
    output_path = resolve_cli_path(args.output, "data/processed/betting_slate.csv")
    json_output_path = resolve_cli_path(args.json_output, "data/processed/web/betting_slate.json")
    now = pd.Timestamp.now(tz="UTC")
    as_of = args.as_of or now.date().isoformat()
    odds_as_of = args.odds_as_of or now.isoformat()

    predictions = pd.read_csv(predictions_path)
    odds = pd.read_csv(odds_path) if odds_path.exists() else None
    slate = filter_near_term_slate(
        predictions,
        as_of=as_of,
        days=args.days,
        odds=odds,
        odds_as_of=odds_as_of,
        max_odds_age_minutes=args.max_odds_age_minutes,
        require_current_odds=not args.include_missing_market,
        require_fresh_odds=not args.include_stale_market,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    slate.to_csv(output_path, index=False)
    json_output_path.parent.mkdir(parents=True, exist_ok=True)
    slate.to_json(json_output_path, orient="records", indent=2)
    print(f"Wrote {len(slate)} betting slate rows to {output_path}")
    print(f"Wrote betting slate JSON to {json_output_path}")


if __name__ == "__main__":
    main()
