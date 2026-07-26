"""Build and publish the durable NWSL model-board payload."""

from __future__ import annotations

import json
import math
from typing import Any
from urllib import error, request

import pandas as pd

POLICY_ID = "nwsl-totals-open-over-v1"
MODEL_FAMILY = "team_ratings_poisson"
POLICY_STATUS = "ready_for_capped_forward_use"
SCHEMA_VERSION = 1
MAX_STAKE_PCT = 0.0025


def _clean(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
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


def _boolean(value: Any) -> bool | None:
    cleaned = _clean(value)
    if cleaned is None or cleaned == "":
        return None
    if isinstance(cleaned, bool):
        return cleaned
    return str(cleaned).strip().lower() in {"true", "1", "yes"}


def _clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {str(key): _clean(value) for key, value in row.items()}


def _slate_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "policyId": _text(row.get("policy_id")),
        "matchId": _text(row.get("match_id")),
        "matchDate": _text(row.get("match_date")),
        "homeTeam": _text(row.get("home_team")),
        "awayTeam": _text(row.get("away_team")),
        "market": _text(row.get("market")),
        "side": _text(row.get("side")),
        "sportsbook": _text(row.get("sportsbook")),
        "quoteTimestamp": _text(row.get("quote_timestamp")),
        "firstSeenTimestamp": _text(row.get("first_seen_timestamp")),
        "line": _number(row.get("line")),
        "overOdds": _number(row.get("over_odds")),
        "underOdds": _number(row.get("under_odds")),
        "modelProbability": _number(row.get("model_probability")),
        "marketNoVigProbability": _number(
            row.get("market_no_vig_probability")
        ),
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


def _locked_pick(row: dict[str, Any]) -> dict[str, Any]:
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
        "matchId": match_id,
        "matchDate": _text(row.get("match_date")),
        "homeTeam": _text(row.get("home_team")),
        "awayTeam": _text(row.get("away_team")),
        "market": market,
        "side": side,
        "sportsbook": _text(row.get("sportsbook")),
        "quoteTimestamp": _text(row.get("quote_timestamp")),
        "firstSeenTimestamp": _text(row.get("first_seen_timestamp")),
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
        raise ValueError(
            f"Locked pick {match_id or '<unknown>'} is missing: {', '.join(missing)}"
        )
    if float(pick["stakePct"]) <= 0 or float(pick["stakePct"]) > MAX_STAKE_PCT:
        raise ValueError(f"Locked pick {match_id} exceeds the 0.25% stake contract")
    return pick


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
    forward_results: dict[str, Any],
    evidence: dict[str, Any],
    source_health: dict[str, Any],
) -> dict[str, Any]:
    """Build the validated JSON contract consumed by the Vercel publisher."""
    if summary.get("policy_id") != POLICY_ID:
        raise ValueError("Latest summary does not match the frozen policy")
    if summary.get("model_family") != MODEL_FAMILY:
        raise ValueError("Latest summary does not match the frozen model family")
    if summary.get("policy_status") != POLICY_STATUS:
        raise ValueError("Latest summary is not ready for capped forward use")

    slate_rows = [_slate_row(row) for row in slate.to_dict(orient="records")]
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
            raise ValueError(
                f"Actionable row {row['matchId']} violates the frozen quote contract"
            )

    locked_rows = []
    if not decisions.empty and "actionable" in decisions.columns:
        locked_rows = [
            _locked_pick(row)
            for row in decisions[
                decisions["actionable"].map(_boolean).fillna(False)
            ].to_dict(orient="records")
        ]
    locked_matches = [row["matchId"] for row in locked_rows]
    if len(locked_matches) != len(set(locked_matches)):
        raise ValueError("Forward decision log contains multiple locked picks per match")

    generated_at = str(summary["generated_at"])
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
            "pricedMatches": int(
                summary.get("matches_with_current_total_price", 0)
            ),
            "actionablePicks": expected_actionable,
            "stakeCapBankrollPct": float(
                summary.get("stake_cap_bankroll_pct", 0.25)
            ),
            "summary": summary,
            "sourceHealth": source_health,
            "forwardResults": forward_results,
            "evidenceSummary": _evidence_summary(evidence),
        },
        "slate": slate_rows,
        "picks": locked_rows,
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
    """POST one model snapshot without ever logging the publishing secret."""
    body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode(
        "utf-8"
    )
    req = request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
    )
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            response_body = response.read()
    except error.HTTPError as exc:
        raise RuntimeError(f"Model publisher returned HTTP {exc.code}") from exc
    except error.URLError as exc:
        raise RuntimeError("Model publisher could not be reached") from exc

    result = json.loads(response_body.decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError("Model publisher did not confirm the snapshot")
    return result
