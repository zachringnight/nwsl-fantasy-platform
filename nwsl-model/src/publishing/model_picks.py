"""Build and publish the durable NWSL model-board payload."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from src.data.match_ids import (
    build_match_id_crosswalk,
    load_official_match_archive,
)
from src.utils.dates import parse_mixed_utc_datetime
from src.publishing.http import publish_with_readback

POLICY_ID = "nwsl-totals-open-over-v1"
MODEL_FAMILY = "team_ratings_poisson"
POLICY_STATUS = "ready_for_capped_forward_use"
SCHEMA_VERSION = 1
MAX_STAKE_PCT = 0.0025
MAX_ODDS_AGE_MINUTES = 180
MAX_FUTURE_SKEW_MINUTES = 15
OFFICIAL_MATCH_ID_RE = re.compile(r"^nwsl::Football_Match::[0-9a-f]{32}$")


def _clean(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


def _text(value: Any) -> str | None:
    cleaned = _clean(value)
    if cleaned is None:
        return None
    text = str(cleaned).strip()
    return text or None


def _number(value: Any) -> float | None:
    cleaned = _clean(value)
    if cleaned is None or cleaned == "":
        return None
    return float(cleaned)


def _timestamp(value: Any) -> str | None:
    """Return one UTC representation so matching layers share quote identity."""
    text = _text(value)
    if text is None:
        return None
    parsed = parse_mixed_utc_datetime(pd.Series([text])).iloc[0]
    if pd.isna(parsed):
        return text
    return parsed.to_pydatetime().isoformat()


def _boolean(value: Any) -> bool | None:
    cleaned = _clean(value)
    if cleaned is None or cleaned == "":
        return None
    if isinstance(cleaned, bool):
        return cleaned
    return str(cleaned).strip().lower() in {"true", "1", "yes"}


def _clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {str(key): _clean(value) for key, value in row.items()}


def _slate_row(
    row: dict[str, Any],
    *,
    official_match_id: str,
) -> dict[str, Any]:
    return {
        "policyId": _text(row.get("policy_id")),
        "officialMatchId": official_match_id,
        "matchId": _text(row.get("match_id")),
        "matchDate": _text(row.get("match_date")),
        "homeTeam": _text(row.get("home_team")),
        "awayTeam": _text(row.get("away_team")),
        "market": _text(row.get("market")),
        "side": _text(row.get("side")),
        "sportsbook": _text(row.get("sportsbook")),
        "quoteTimestamp": _timestamp(row.get("quote_timestamp")),
        "firstSeenTimestamp": _timestamp(row.get("first_seen_timestamp")),
        "line": _number(row.get("line")),
        "overOdds": _number(row.get("over_odds")),
        "underOdds": _number(row.get("under_odds")),
        "modelProbability": _number(row.get("model_probability")),
        "marketNoVigProbability": _number(row.get("market_no_vig_probability")),
        "probabilityEdge": _number(row.get("probability_edge")),
        "expectedValue": _number(row.get("edge")),
        "confidence": _number(row.get("confidence")),
        "quoteAgeMinutes": _number(row.get("quote_age_minutes")),
        "quoteIsFresh": _boolean(row.get("quote_is_fresh")),
        "firstSeenContractOk": _boolean(row.get("first_seen_contract_ok")),
        "pickTier": _text(row.get("pick_tier")) or "no_bet",
        "actionable": bool(_boolean(row.get("actionable"))),
        "reason": _text(row.get("reason")) or "unknown",
        "stakePct": _number(row.get("stake_pct")) or 0.0,
        "rawRow": _clean_row(row),
    }


def _locked_pick(
    row: dict[str, Any],
    *,
    official_match_id: str,
) -> dict[str, Any]:
    policy_id = _text(row.get("policy_id"))
    match_id = _text(row.get("match_id"))
    market = _text(row.get("market"))
    side = _text(row.get("side"))
    settlement_status = _text(row.get("settlement_status"))
    result = _text(row.get("result"))
    settled = settlement_status == "settled"

    pick = {
        "pickKey": f"{policy_id}:{match_id}:{market}:{side}",
        "policyId": policy_id,
        "officialMatchId": official_match_id,
        "matchId": match_id,
        "matchDate": _text(row.get("match_date")),
        "homeTeam": _text(row.get("home_team")),
        "awayTeam": _text(row.get("away_team")),
        "market": market,
        "side": side,
        "sportsbook": _text(row.get("sportsbook")),
        "quoteTimestamp": _timestamp(row.get("quote_timestamp")),
        "firstSeenTimestamp": _timestamp(row.get("first_seen_timestamp")),
        "line": _number(row.get("line")),
        "overOdds": _number(row.get("over_odds")),
        "underOdds": _number(row.get("under_odds")),
        "modelProbability": _number(row.get("model_probability")),
        "probabilityEdge": _number(row.get("probability_edge")),
        "expectedValue": _number(row.get("edge")),
        "confidence": _number(row.get("confidence")),
        "stakePct": _number(row.get("stake_pct")),
        "lockedAt": _text(row.get("generated_at")),
        "settlementStatus": "settled" if settled else "pending",
        "result": result if settled and result in {"win", "loss", "push"} else "pending",
        "pnlUnits": _number(row.get("pnl_units")) if settled else None,
        "homeGoals90": _number(row.get("home_goals_90")) if settled else None,
        "awayGoals90": _number(row.get("away_goals_90")) if settled else None,
        "settledAt": _text(row.get("settled_at")) if settled else None,
        "rawRow": _clean_row(row),
    }
    required = (
        "policyId",
        "officialMatchId",
        "matchId",
        "matchDate",
        "homeTeam",
        "awayTeam",
        "market",
        "side",
        "sportsbook",
        "quoteTimestamp",
        "line",
        "overOdds",
        "modelProbability",
        "expectedValue",
        "confidence",
        "stakePct",
        "lockedAt",
    )
    missing = [field for field in required if pick.get(field) is None]
    if missing:
        raise ValueError(f"Locked pick {match_id or '<unknown>'} is missing: {', '.join(missing)}")
    if float(pick["stakePct"]) <= 0 or float(pick["stakePct"]) > MAX_STAKE_PCT:
        raise ValueError(f"Locked pick {match_id} exceeds the 0.25% stake contract")
    return pick


def build_official_match_context(
    matches: pd.DataFrame,
    upcoming: pd.DataFrame,
    official_matches_dir: str | Path,
) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    """Build model-ID metadata and its canonical official-ID crosswalk."""
    frames = [
        frame.copy() for frame in (matches, upcoming) if frame is not None and not frame.empty
    ]
    if not frames:
        raise ValueError("Model match reference is empty")

    model_matches = pd.concat(frames, ignore_index=True, sort=False)
    required = {"match_id", "match_date", "home_team", "away_team"}
    missing = required.difference(model_matches.columns)
    if missing:
        raise ValueError("Model match reference is missing: " + ", ".join(sorted(missing)))
    model_matches["match_id"] = model_matches["match_id"].astype(str)
    parsed_dates = pd.to_datetime(
        model_matches["match_date"],
        errors="coerce",
    )
    model_matches["match_date"] = parsed_dates.dt.date.astype("string")
    season = pd.to_numeric(
        model_matches.get(
            "season",
            pd.Series(pd.NA, index=model_matches.index),
        ),
        errors="coerce",
    )
    model_matches["season"] = season.fillna(parsed_dates.dt.year).astype("Int64")
    invalid = model_matches[
        model_matches["match_id"].str.strip().eq("")
        | parsed_dates.isna()
        | model_matches["season"].isna()
        | model_matches["home_team"].astype(str).str.strip().eq("")
        | model_matches["away_team"].astype(str).str.strip().eq("")
    ]
    if not invalid.empty:
        raise ValueError("Model match reference contains invalid identity rows")

    identity_columns = [
        "match_id",
        "match_date",
        "season",
        "home_team",
        "away_team",
    ]
    identities = model_matches[identity_columns].drop_duplicates()
    conflicting = identities[identities.duplicated("match_id", keep=False)]
    if not conflicting.empty:
        ids = sorted(conflicting["match_id"].astype(str).unique())
        raise ValueError("Model match reference has conflicting match IDs: " + ", ".join(ids[:10]))
    model_reference = identities.drop_duplicates(
        "match_id",
        keep="first",
    ).copy()
    score_columns = ["home_goals_90", "away_goals_90"]
    for column in score_columns:
        model_matches[column] = pd.to_numeric(
            model_matches.get(
                column,
                pd.Series(
                    float("nan"),
                    index=model_matches.index,
                ),
            ),
            errors="coerce",
        )
    score_reference = (
        model_matches[["match_id", *score_columns]].groupby("match_id", as_index=False).first()
    )
    model_reference = model_reference.merge(
        score_reference,
        on="match_id",
        how="left",
    )

    official_matches = load_official_match_archive(official_matches_dir)
    if official_matches.empty:
        raise ValueError("Official NWSL match archive is empty")
    crosswalk = build_match_id_crosswalk(
        model_reference,
        official_matches,
    )
    official_by_model: dict[str, str] = {}
    for row in crosswalk.itertuples(index=False):
        official_id = str(row.official_match_id)
        if not OFFICIAL_MATCH_ID_RE.fullmatch(official_id):
            raise ValueError(f"Official match ID is not canonical: {official_id}")
        official_by_model[str(row.model_match_id)] = official_id

    metadata_by_model = {
        str(row.match_id): {
            "match_date": str(row.match_date),
            "season": int(row.season),
            "home_team": str(row.home_team),
            "away_team": str(row.away_team),
        }
        for row in model_reference.itertuples(index=False)
    }
    return official_by_model, metadata_by_model


def _official_match_id(
    match_id: Any,
    official_by_model: dict[str, str],
    *,
    row_type: str,
) -> str:
    model_id = _text(match_id)
    official_id = official_by_model.get(str(model_id or ""))
    if official_id is None:
        raise ValueError(
            f"Published {row_type} {model_id or '<unknown>'} has no canonical official match ID"
        )
    return official_id


def _published_odds_rows(
    odds: pd.DataFrame,
    *,
    slate_match_ids: set[str],
    official_by_model: dict[str, str],
    metadata_by_model: dict[str, dict[str, Any]],
    now: datetime,
    max_age_minutes: int,
) -> list[dict[str, Any]]:
    if odds is None or odds.empty or not slate_match_ids:
        return []

    current_time = pd.Timestamp(now)
    if current_time.tzinfo is None:
        current_time = current_time.tz_localize("UTC")
    else:
        current_time = current_time.tz_convert("UTC")

    rows: list[dict[str, Any]] = []
    unique: dict[tuple[Any, ...], dict[str, Any]] = {}
    for raw in odds.to_dict(orient="records"):
        source_type = (_text(raw.get("source_type")) or "").lower()
        if source_type not in {"current", "live"}:
            continue
        match_id = _text(raw.get("match_id"))
        if match_id is None or match_id not in slate_match_ids:
            continue
        sportsbook = _text(raw.get("sportsbook"))
        market_type = (_text(raw.get("market_type")) or "").lower()
        quote_timestamp = _timestamp(raw.get("timestamp"))
        if sportsbook is None or market_type not in {"1x2", "total"}:
            continue
        parsed_timestamp = parse_mixed_utc_datetime(pd.Series([quote_timestamp])).iloc[0]
        if pd.isna(parsed_timestamp):
            continue
        age_minutes = (current_time - parsed_timestamp).total_seconds() / 60.0
        if age_minutes < -MAX_FUTURE_SKEW_MINUTES or age_minutes > float(max_age_minutes):
            continue
        published_age = round(max(float(age_minutes), 0.0), 6)

        line = _number(raw.get("line"))
        home_odds = _number(raw.get("home_odds"))
        draw_odds = _number(raw.get("draw_odds"))
        away_odds = _number(raw.get("away_odds"))
        over_odds = _number(raw.get("over_odds"))
        under_odds = _number(raw.get("under_odds"))
        if market_type == "total":
            if (
                line is None
                or line <= 0
                or over_odds is None
                or over_odds <= 1
                or under_odds is None
                or under_odds <= 1
                or any(value is not None for value in (home_odds, draw_odds, away_odds))
            ):
                continue
        elif (
            line is not None
            or home_odds is None
            or home_odds <= 1
            or draw_odds is None
            or draw_odds <= 1
            or away_odds is None
            or away_odds <= 1
            or over_odds is not None
            or under_odds is not None
        ):
            continue

        metadata = metadata_by_model.get(match_id)
        if metadata is None:
            raise ValueError(f"Published odds row {match_id} has no match metadata")
        official_id = _official_match_id(
            match_id,
            official_by_model,
            row_type="odds row",
        )
        published = {
            "officialMatchId": official_id,
            "matchId": match_id,
            "matchDate": metadata["match_date"],
            "homeTeam": metadata["home_team"],
            "awayTeam": metadata["away_team"],
            "sportsbook": sportsbook,
            "quoteTimestamp": quote_timestamp,
            "marketType": market_type,
            "line": line,
            "homeOdds": home_odds,
            "drawOdds": draw_odds,
            "awayOdds": away_odds,
            "overOdds": over_odds,
            "underOdds": under_odds,
            "sourceType": source_type,
            "quoteAgeMinutes": published_age,
            "isFresh": True,
            "rawRow": _clean_row(raw),
        }
        key = (
            match_id,
            sportsbook,
            market_type,
            line,
            quote_timestamp,
        )
        existing = unique.get(key)
        if existing is not None:
            comparable = {
                field: published[field]
                for field in (
                    "homeOdds",
                    "drawOdds",
                    "awayOdds",
                    "overOdds",
                    "underOdds",
                    "sourceType",
                )
            }
            existing_comparable = {field: existing[field] for field in comparable}
            if comparable != existing_comparable:
                raise ValueError(f"Published odds key has conflicting prices: {key}")
            continue
        unique[key] = published
        rows.append(published)

    return sorted(
        rows,
        key=lambda row: (
            row["matchDate"],
            row["matchId"],
            row["sportsbook"],
            row["marketType"],
            -1.0 if row["line"] is None else row["line"],
            row["quoteTimestamp"],
        ),
    )


def _same_number(left: Any, right: Any) -> bool:
    if left is None or right is None:
        return left is right
    return math.isclose(
        float(left),
        float(right),
        rel_tol=1e-9,
        abs_tol=1e-9,
    )


def _same_timestamp(left: Any, right: Any) -> bool:
    """Compare quote instants, not equivalent ISO-8601 spellings."""
    if left is None or right is None:
        return left is right
    timestamps = parse_mixed_utc_datetime(pd.Series([left, right]))
    if timestamps.isna().any():
        return False
    return timestamps.iloc[0] == timestamps.iloc[1]


def _validate_priced_slate_quotes(
    slate_rows: list[dict[str, Any]],
    odds_rows: list[dict[str, Any]],
) -> int:
    priced_rows = [
        row
        for row in slate_rows
        if (
            row["line"] is not None
            and row["overOdds"] is not None
            and row["underOdds"] is not None
            and row["sportsbook"] is not None
            and row["quoteTimestamp"] is not None
        )
    ]
    for slate_row in priced_rows:
        if slate_row["sportsbook"] != "DraftKings" or not _same_number(slate_row["line"], 2.5):
            raise ValueError(
                f"Priced slate row {slate_row['matchId']} is outside the DraftKings Over 2.5 policy"
            )
        exact = any(
            odds_row["matchId"] == slate_row["matchId"]
            and odds_row["officialMatchId"] == slate_row["officialMatchId"]
            and odds_row["marketType"] == "total"
            and odds_row["sportsbook"] == slate_row["sportsbook"]
            and _same_timestamp(
                odds_row["quoteTimestamp"],
                slate_row["quoteTimestamp"],
            )
            and _same_number(odds_row["line"], slate_row["line"])
            and _same_number(
                odds_row["overOdds"],
                slate_row["overOdds"],
            )
            and _same_number(
                odds_row["underOdds"],
                slate_row["underOdds"],
            )
            for odds_row in odds_rows
        )
        if not exact:
            raise ValueError(
                f"Priced slate row {slate_row['matchId']} has no exact fresh odds snapshot"
            )
    return len(priced_rows)


def _evidence_summary(evidence: dict[str, Any]) -> dict[str, Any]:
    test = evidence.get("test", {})
    n_bets = int(test.get("n_bets", 0))
    hit_rate = float(test.get("hit_rate", 0.0))
    wins = int(round(n_bets * hit_rate))
    return {
        "recordType": "held_out_2026_opening_price_replay",
        "label": "2026 held-out opening-price replay",
        "market": "total_over_2.5",
        "side": "over",
        "bets": n_bets,
        "wins": wins,
        "losses": max(n_bets - wins, 0),
        "pushes": 0,
        "pnlUnits": float(test.get("pnl_units", 0.0)),
        "roiUnits": float(test.get("roi_units", 0.0)),
        "meanClv": float(test.get("mean_clv", 0.0)),
        "positiveClvRate": float(test.get("positive_clv_rate", 0.0)),
        "firstMatchDate": test.get("first_match_date"),
        "lastMatchDate": test.get("last_match_date"),
    }


def build_publish_payload(
    *,
    summary: dict[str, Any],
    slate: pd.DataFrame,
    decisions: pd.DataFrame,
    odds: pd.DataFrame,
    matches: pd.DataFrame,
    upcoming: pd.DataFrame,
    official_matches_dir: str | Path,
    forward_results: dict[str, Any],
    evidence: dict[str, Any],
    source_health: dict[str, Any],
    now: datetime | None = None,
    max_odds_age_minutes: int = MAX_ODDS_AGE_MINUTES,
) -> dict[str, Any]:
    """Build the validated JSON contract consumed by the Vercel publisher."""
    if summary.get("policy_id") != POLICY_ID:
        raise ValueError("Latest summary does not match the frozen policy")
    if summary.get("model_family") != MODEL_FAMILY:
        raise ValueError("Latest summary does not match the frozen model family")
    if summary.get("policy_status") != POLICY_STATUS:
        raise ValueError("Latest summary is not ready for capped forward use")

    generated_at = str(summary["generated_at"])
    generated_reference = pd.to_datetime(
        generated_at,
        utc=True,
        errors="coerce",
    )
    if pd.isna(generated_reference):
        raise ValueError("Latest summary generated_at is invalid")
    if now is not None:
        supplied_reference = pd.Timestamp(now)
        if supplied_reference.tzinfo is None:
            supplied_reference = supplied_reference.tz_localize("UTC")
        else:
            supplied_reference = supplied_reference.tz_convert("UTC")
        if abs((supplied_reference - generated_reference).total_seconds()) > 1:
            raise ValueError("Publish freshness reference must match summary generated_at")

    official_by_model, metadata_by_model = build_official_match_context(
        matches,
        upcoming,
        official_matches_dir,
    )
    slate_records = slate.to_dict(orient="records")
    slate_rows = [
        _slate_row(
            row,
            official_match_id=_official_match_id(
                row.get("match_id"),
                official_by_model,
                row_type="slate row",
            ),
        )
        for row in slate_records
    ]
    expected_matches = int(summary.get("matches_in_window", 0))
    if len(slate_rows) != expected_matches:
        raise ValueError("Latest slate row count does not match its summary")

    actionable_rows = [row for row in slate_rows if row["actionable"]]
    expected_actionable = int(summary.get("actionable_picks", 0))
    if len(actionable_rows) != expected_actionable:
        raise ValueError("Latest slate actionable count does not match its summary")

    for row in actionable_rows:
        if (
            row["reason"] != "accepted"
            or row["quoteIsFresh"] is not True
            or row["firstSeenContractOk"] is not True
        ):
            raise ValueError(f"Actionable row {row['matchId']} violates the frozen quote contract")

    locked_rows = []
    if not decisions.empty and "actionable" in decisions.columns:
        locked_rows = [
            _locked_pick(
                row,
                official_match_id=_official_match_id(
                    row.get("match_id"),
                    official_by_model,
                    row_type="locked pick",
                ),
            )
            for row in decisions[decisions["actionable"].map(_boolean).fillna(False)].to_dict(
                orient="records"
            )
        ]
    locked_matches = [row["matchId"] for row in locked_rows]
    if len(locked_matches) != len(set(locked_matches)):
        raise ValueError("Forward decision log contains multiple locked picks per match")
    for row in locked_rows:
        if row["sportsbook"] != "DraftKings" or not _same_number(row["line"], 2.5):
            raise ValueError(
                f"Locked pick {row['matchId']} is outside the DraftKings Over 2.5 policy"
            )

    slate_match_ids = {str(row["matchId"]) for row in slate_rows if row["matchId"] is not None}
    odds_rows = _published_odds_rows(
        odds,
        slate_match_ids=slate_match_ids,
        official_by_model=official_by_model,
        metadata_by_model=metadata_by_model,
        now=generated_reference.to_pydatetime(),
        max_age_minutes=int(max_odds_age_minutes),
    )
    priced_rows = _validate_priced_slate_quotes(
        slate_rows,
        odds_rows,
    )
    expected_priced = int(summary.get("matches_with_current_total_price", 0))
    if priced_rows != expected_priced:
        raise ValueError("Latest slate priced count does not match its summary")

    window = summary.get("window", {})
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "run": {
            "runKey": f"{POLICY_ID}:{generated_at}",
            "policyId": POLICY_ID,
            "policyStatus": POLICY_STATUS,
            "modelFamily": MODEL_FAMILY,
            "artifactVersion": str(summary["artifact_version"]),
            "status": "success" if expected_actionable > 0 else "no_bet",
            "generatedAt": generated_at,
            "windowStart": window.get("start_date"),
            "windowEnd": window.get("end_date"),
            "matchesInWindow": int(summary.get("matches_in_window", 0)),
            "pricedMatches": int(summary.get("matches_with_current_total_price", 0)),
            "actionablePicks": expected_actionable,
            "stakeCapBankrollPct": float(summary.get("stake_cap_bankroll_pct", 0.25)),
            "summary": summary,
            "sourceHealth": source_health,
            "forwardResults": forward_results,
            "evidenceSummary": _evidence_summary(evidence),
        },
        "slate": slate_rows,
        "picks": locked_rows,
        "odds": odds_rows,
    }
    json.dumps(payload, allow_nan=False)
    return payload


def publish_payload(
    payload: dict[str, Any],
    *,
    url: str,
    secret: str,
    timeout_seconds: int = 30,
) -> dict[str, Any]:
    """Publish one stable model run and verify ambiguous responses by readback."""
    return publish_with_readback(
        payload=payload,
        publish_url=url,
        secret=secret,
        expected={
            "runKey": payload["run"]["runKey"],
            "artifactVersion": payload["run"]["artifactVersion"],
        },
        timeout=float(timeout_seconds),
    )
