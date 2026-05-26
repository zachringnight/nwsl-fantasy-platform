#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(MODEL_ROOT))

REQUIRED_OUTPUT_COLUMNS = [
    "match_id",
    "match_date",
    "home_team",
    "away_team",
    "gating_status",
    "has_market_odds",
    "accepted_bet",
    "bet_reason",
]

MARKET_ODDS_COLUMNS = ("mkt_home_odds", "mkt_draw_odds", "mkt_away_odds")


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
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

    available_odds = [column for column in MARKET_ODDS_COLUMNS if column in predictions.columns]
    if not available_odds:
        if market_flag is not None:
            return market_flag
        return pd.Series(False, index=predictions.index)

    if set(available_odds) != set(MARKET_ODDS_COLUMNS):
        return pd.Series(False, index=predictions.index)

    numeric_odds = predictions[available_odds].apply(pd.to_numeric, errors="coerce")
    complete_price = numeric_odds.gt(1.0).all(axis=1)
    if market_flag is not None:
        return market_flag & complete_price
    return complete_price


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


def _bet_reason(row: pd.Series) -> str:
    gating_status = str(row.get("gating_status", "unknown")).lower()
    if gating_status != "passed":
        return "model_gating_not_passed"
    if not bool(row.get("has_market_odds", False)):
        return "missing_market_price"
    if bool(row.get("accepted_bet", False)):
        return "accepted"
    return _first_rejection_reason(row.get("rejected_bet_reasons"))


def filter_near_term_slate(
    predictions: pd.DataFrame,
    as_of: str | pd.Timestamp,
    days: int,
    *,
    require_current_odds: bool = True,
) -> pd.DataFrame:
    """Return bet-ready matches in the inclusive near-term window."""
    if "match_date" not in predictions.columns:
        raise ValueError("predictions must include match_date")

    start_date = _as_date(as_of)
    end_date = start_date + pd.Timedelta(days=days)

    slate = predictions.copy()
    slate["_match_date"] = pd.to_datetime(slate["match_date"], errors="coerce").dt.normalize()
    slate["has_market_odds"] = _derive_market_odds(slate)

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
            "accepted_bet_count",
            "recommended_bets",
            "rejected_bet_reasons",
            *MARKET_ODDS_COLUMNS,
        )
        if column in slate.columns and column not in REQUIRED_OUTPUT_COLUMNS
    ]
    return slate[REQUIRED_OUTPUT_COLUMNS + extra_columns].reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a near-term betting slate")
    parser.add_argument("--predictions")
    parser.add_argument("--days", type=positive_int, default=14)
    parser.add_argument("--output")
    parser.add_argument("--json-output")
    parser.add_argument("--as-of")
    parser.add_argument(
        "--include-missing-market",
        action="store_true",
        help="Include near-term rows without current market odds for diagnostics",
    )
    args = parser.parse_args()

    predictions_path = resolve_cli_path(args.predictions, "data/processed/predictions.csv")
    output_path = resolve_cli_path(args.output, "data/processed/betting_slate.csv")
    json_output_path = resolve_cli_path(args.json_output, "data/processed/web/betting_slate.json")
    as_of = args.as_of or pd.Timestamp.now(tz="UTC").date().isoformat()

    predictions = pd.read_csv(predictions_path)
    slate = filter_near_term_slate(
        predictions,
        as_of=as_of,
        days=args.days,
        require_current_odds=not args.include_missing_market,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    slate.to_csv(output_path, index=False)
    json_output_path.parent.mkdir(parents=True, exist_ok=True)
    slate.to_json(json_output_path, orient="records", indent=2)
    print(f"Wrote {len(slate)} betting slate rows to {output_path}")
    print(f"Wrote betting slate JSON to {json_output_path}")


if __name__ == "__main__":
    main()
