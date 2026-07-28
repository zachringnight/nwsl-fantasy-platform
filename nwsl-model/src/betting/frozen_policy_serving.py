"""Serving helpers for a validated frozen totals-over policy."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from src.betting.market_derivation import derive_all_markets
from src.utils.dates import parse_mixed_utc_datetime

UTC = timezone.utc
FROZEN_TOTAL_LINE = 2.5
FROZEN_SPORTSBOOK = "draftkings"
# Used only when DraftKings has no current total-2.5 price for a match, in
# this priority order. DraftKings always wins when present, even if a
# fallback book's price is better - see
# test_uses_draftkings_when_multiple_sportsbooks_quote in
# tests/test_frozen_policy_serving.py. Added 2026-07-28 by owner decision
# after DK coverage was confirmed too thin to price most of a given week's
# matches; these fallback sources are context/aggregator quotes (FoxSports,
# FootyStats, OddsPortal), not necessarily the exact book a pick gets placed
# at, so a filled-by-fallback pick is a real but slightly softer signal than
# a DraftKings-sourced one. The "sportsbook" field on every slate row always
# records which book actually filled it.
FROZEN_SPORTSBOOK_FALLBACKS = ("foxsports", "footystats", "oddsportalevent", "oddsportalavg")


def validate_policy_evidence(
    evidence: dict[str, Any],
    *,
    expected_model_family: str = "team_ratings_poisson",
) -> dict[str, Any]:
    """Fail closed unless the evidence exactly matches the serving contract."""
    checks = evidence.get("readiness_checks", {})
    required = {
        "status": evidence.get("status") == "ready_for_capped_forward_use",
        "model_family": evidence.get("model_family") == expected_model_family,
        "market_group": evidence.get("market_group") == "totals",
        "side": evidence.get("side") == "over",
        "opening_quotes": evidence.get("odds_source_types") == ["open"],
        "readiness_checks": bool(checks) and all(bool(value) for value in checks.values()),
    }
    failed = [name for name, passed in required.items() if not passed]
    if failed:
        raise ValueError("Frozen policy evidence is not serveable: " + ", ".join(failed))

    thresholds = evidence.get("thresholds", {})
    min_edge = float(thresholds.get("min_edge", -1.0))
    min_confidence = float(thresholds.get("min_confidence", -1.0))
    if min_edge < 0 or min_confidence < 0:
        raise ValueError("Frozen policy evidence has invalid thresholds.")
    return {
        "policy_id": str(evidence["policy_id"]),
        "model_family": expected_model_family,
        "min_edge": min_edge,
        "min_confidence": min_confidence,
        "stake_cap_pct": float(
            evidence.get("operating_contract", {}).get(
                "forward_stake_cap_bankroll_pct",
                0.25,
            )
        ),
    }


def _normalized_total_rows(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    output = frame.copy()
    output["match_id"] = output["match_id"].astype(str)
    output["market_type"] = output.get("market_type", "").astype(str).str.lower()
    output["source_type"] = output.get("source_type", "").astype(str).str.lower()
    output["timestamp_dt"] = parse_mixed_utc_datetime(output.get("timestamp"))
    for column in ("line", "over_odds", "under_odds"):
        output[column] = pd.to_numeric(output.get(column), errors="coerce")
    return output[
        output["market_type"].isin({"total", "totals"})
        & output["line"].notna()
        & output["line"].sub(FROZEN_TOTAL_LINE).abs().le(1.0e-9)
        & output["over_odds"].gt(1.0)
        & output["under_odds"].gt(1.0)
    ].copy()


def annotate_first_seen_quotes(
    current: pd.DataFrame,
    snapshots: pd.DataFrame,
) -> pd.DataFrame:
    """Attach the earliest captured same-book, same-line over price."""
    current_totals = _normalized_total_rows(current)
    if current_totals.empty:
        return current_totals
    snapshot_totals = _normalized_total_rows(snapshots)
    snapshot_totals = snapshot_totals[
        snapshot_totals["source_type"].isin({"current", "open", "live"})
    ].copy()

    keys = ["match_id", "sportsbook", "market_type", "line"]
    if snapshot_totals.empty:
        first_seen = current_totals[keys + ["timestamp_dt", "over_odds"]].copy()
    else:
        first_seen = (
            snapshot_totals.sort_values(["timestamp_dt", "match_id"])
            .groupby(keys, as_index=False)
            .first()[keys + ["timestamp_dt", "over_odds"]]
        )
    first_seen = first_seen.rename(
        columns={
            "timestamp_dt": "first_seen_timestamp",
            "over_odds": "first_seen_over_odds",
        }
    )
    annotated = current_totals.merge(first_seen, on=keys, how="left")
    annotated["first_seen_timestamp"] = annotated["first_seen_timestamp"].combine_first(
        annotated["timestamp_dt"]
    )
    annotated["first_seen_over_odds"] = annotated["first_seen_over_odds"].combine_first(
        annotated["over_odds"]
    )
    annotated["price_vs_first_seen"] = annotated["over_odds"] - annotated["first_seen_over_odds"]
    annotated["first_seen_contract_ok"] = annotated["price_vs_first_seen"].ge(-1.0e-9)
    return annotated


def _no_vig_over_probability(over_odds: float, under_odds: float) -> float:
    over_implied = 1.0 / float(over_odds)
    under_implied = 1.0 / float(under_odds)
    return over_implied / (over_implied + under_implied)


def build_frozen_policy_slate(
    *,
    upcoming: pd.DataFrame,
    odds: pd.DataFrame,
    snapshots: pd.DataFrame,
    model: Any,
    evidence: dict[str, Any],
    artifact_version: str,
    as_of: datetime,
    days: int,
    max_quote_age_minutes: int = 180,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Generate a complete near-term slate under the frozen policy contract."""
    policy = validate_policy_evidence(evidence)
    reference_time = pd.Timestamp(as_of)
    if reference_time.tzinfo is None:
        reference_time = reference_time.tz_localize("UTC")
    else:
        reference_time = reference_time.tz_convert("UTC")
    start_date = reference_time.date()
    end_date = start_date + pd.Timedelta(days=int(days))

    fixtures = upcoming.copy()
    fixtures["match_id"] = fixtures["match_id"].astype(str)
    fixtures["match_date_dt"] = pd.to_datetime(
        fixtures["match_date"],
        errors="coerce",
    ).dt.date
    fixtures = fixtures[
        fixtures["match_date_dt"].ge(start_date) & fixtures["match_date_dt"].le(end_date)
    ].sort_values(["match_date_dt", "match_id"])

    current_all = _normalized_total_rows(odds)
    current_all = current_all[current_all["source_type"].eq("current")]

    filled_frames: list[pd.DataFrame] = []
    matched_ids: set[str] = set()
    for book in (FROZEN_SPORTSBOOK, *FROZEN_SPORTSBOOK_FALLBACKS):
        book_rows = current_all[
            current_all["sportsbook"].astype(str).str.casefold().eq(book)
            & ~current_all["match_id"].isin(matched_ids)
        ]
        if book_rows.empty:
            continue
        book_best = book_rows.sort_values(
            ["match_id", "over_odds", "timestamp_dt"],
            ascending=[True, False, False],
        ).drop_duplicates("match_id", keep="first")
        filled_frames.append(book_best)
        matched_ids.update(book_best["match_id"].tolist())

    current = pd.concat(filled_frames, ignore_index=True) if filled_frames else current_all.iloc[0:0]
    current = annotate_first_seen_quotes(current, snapshots)
    if not current.empty:
        current = current.set_index("match_id")

    rows: list[dict[str, Any]] = []
    for fixture in fixtures.itertuples(index=False):
        match_id = str(fixture.match_id)
        quote = current.loc[match_id] if not current.empty and match_id in current.index else None
        base = {
            "policy_id": policy["policy_id"],
            "policy_status": evidence["status"],
            "model_family": policy["model_family"],
            "artifact_version": artifact_version,
            "match_id": match_id,
            "match_date": str(fixture.match_date_dt),
            "home_team": fixture.home_team,
            "away_team": fixture.away_team,
            "market": "total_over",
            "side": "over",
            "min_edge": policy["min_edge"],
            "min_confidence": policy["min_confidence"],
            "generated_at": reference_time.isoformat(),
        }
        if quote is None:
            rows.append(
                {
                    **base,
                    "pick_tier": "no_bet",
                    "actionable": False,
                    "reason": "missing_current_total_price",
                    "stake_pct": 0.0,
                }
            )
            continue

        quote_age = (reference_time - pd.Timestamp(quote["timestamp_dt"])).total_seconds() / 60.0
        line = float(quote["line"])
        over_odds = float(quote["over_odds"])
        under_odds = float(quote["under_odds"])
        pred = model.predict_score_matrix(
            home_team=str(fixture.home_team),
            away_team=str(fixture.away_team),
        )
        markets = derive_all_markets(pred.score_matrix, match_id=match_id)
        probability = markets.over_probs.get(line)
        if probability is None:
            rows.append(
                {
                    **base,
                    "sportsbook": quote.get("sportsbook"),
                    "quote_timestamp": pd.Timestamp(quote["timestamp_dt"]).isoformat(),
                    "line": line,
                    "over_odds": over_odds,
                    "under_odds": under_odds,
                    "quote_age_minutes": round(float(quote_age), 2),
                    "pick_tier": "no_bet",
                    "actionable": False,
                    "reason": "unsupported_total_line",
                    "stake_pct": 0.0,
                }
            )
            continue

        probability = float(probability)
        edge = probability * over_odds - 1.0
        confidence = abs(probability - 0.5)
        no_vig_probability = _no_vig_over_probability(over_odds, under_odds)
        probability_edge = probability - no_vig_probability
        fresh = 0.0 <= quote_age <= float(max_quote_age_minutes)
        first_seen_ok = bool(quote["first_seen_contract_ok"])
        if not fresh:
            reason = "stale_market_price"
        elif not first_seen_ok:
            reason = "price_worse_than_first_seen"
        elif confidence < policy["min_confidence"]:
            reason = "confidence_below_threshold"
        elif edge < policy["min_edge"]:
            reason = "edge_below_threshold"
        else:
            reason = "accepted"
        accepted = reason == "accepted"
        rows.append(
            {
                **base,
                "sportsbook": quote.get("sportsbook"),
                "quote_timestamp": pd.Timestamp(quote["timestamp_dt"]).isoformat(),
                "first_seen_timestamp": pd.Timestamp(quote["first_seen_timestamp"]).isoformat(),
                "line": line,
                "over_odds": over_odds,
                "under_odds": under_odds,
                "first_seen_over_odds": float(quote["first_seen_over_odds"]),
                "price_vs_first_seen": float(quote["price_vs_first_seen"]),
                "quote_age_minutes": round(float(quote_age), 2),
                "quote_is_fresh": fresh,
                "first_seen_contract_ok": first_seen_ok,
                "lambda_home": float(pred.lambda_home),
                "lambda_away": float(pred.lambda_away),
                "model_probability": probability,
                "model_fair_odds": float(1.0 / probability),
                "market_no_vig_probability": no_vig_probability,
                "probability_edge": probability_edge,
                "edge": edge,
                "confidence": confidence,
                "pick_tier": "validated_policy_pick" if accepted else "no_bet",
                "actionable": accepted,
                "reason": reason,
                "stake_pct": policy["stake_cap_pct"] / 100.0 if accepted else 0.0,
            }
        )

    slate = pd.DataFrame(rows)
    summary = {
        "policy_id": policy["policy_id"],
        "policy_status": evidence["status"],
        "model_family": policy["model_family"],
        "artifact_version": artifact_version,
        "generated_at": reference_time.isoformat(),
        "window": {
            "start_date": str(start_date),
            "end_date": str(end_date),
            "days": int(days),
        },
        "matches_in_window": int(len(fixtures)),
        "matches_with_current_total_price": int(
            slate.get("over_odds", pd.Series(dtype=float)).notna().sum()
        ),
        "actionable_picks": int(slate.get("actionable", pd.Series(dtype=bool)).fillna(False).sum()),
        "reason_counts": (
            slate["reason"].value_counts().astype(int).to_dict() if not slate.empty else {}
        ),
        "thresholds": {
            "min_edge": policy["min_edge"],
            "min_confidence": policy["min_confidence"],
        },
        "stake_cap_bankroll_pct": policy["stake_cap_pct"],
        "quote_contract": "fresh opening-or-first-seen price; later price must be no worse",
    }
    return slate, summary


def append_forward_decisions(
    existing: pd.DataFrame,
    incoming: pd.DataFrame,
) -> pd.DataFrame:
    """Append policy decisions idempotently and lock at most one pick per match."""
    frames = [frame for frame in (existing, incoming) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True, sort=False)
    keys = [
        "policy_id",
        "match_id",
        "quote_timestamp",
        "sportsbook",
        "line",
        "over_odds",
    ]
    available_keys = [key for key in keys if key in combined.columns]
    sort_columns = [
        column
        for column in ("match_date", "match_id", "quote_timestamp")
        if column in combined.columns
    ]
    combined = combined.sort_values(sort_columns).reset_index(drop=True)
    if available_keys:
        combined = combined.drop_duplicates(available_keys, keep="last")

    actionable = combined.get(
        "actionable",
        pd.Series(False, index=combined.index),
    )
    if actionable.dtype != bool:
        actionable = actionable.fillna(False).astype(str).str.lower().isin({"true", "1", "yes"})
    combined["actionable"] = actionable
    if {"policy_id", "match_id"}.issubset(combined.columns):
        locked = combined[combined["actionable"]].groupby(
            ["policy_id", "match_id"],
            sort=False,
        )
        for _, indices in locked.groups.items():
            later = list(indices)[1:]
            if not later:
                continue
            combined.loc[later, "actionable"] = False
            combined.loc[later, "pick_tier"] = "no_bet"
            combined.loc[later, "reason"] = "already_locked_policy_pick"
            combined.loc[later, "stake_pct"] = 0.0
    return combined.sort_values(sort_columns).reset_index(drop=True)


def settle_forward_decisions(
    decisions: pd.DataFrame,
    matches: pd.DataFrame,
    *,
    settled_at: datetime | None = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Settle locked totals-over decisions against completed 90-minute scores."""
    output = decisions.copy()
    if output.empty:
        return output, {
            "actionable_decisions": 0,
            "settled": 0,
            "pending": 0,
            "wins": 0,
            "losses": 0,
            "pushes": 0,
            "pnl_units": 0.0,
            "roi_units": 0.0,
        }

    output["match_id"] = output["match_id"].astype(str)
    actionable = output.get(
        "actionable",
        pd.Series(False, index=output.index),
    )
    if actionable.dtype != bool:
        actionable = actionable.fillna(False).astype(str).str.lower().isin({"true", "1", "yes"})
    output["actionable"] = actionable
    for column, default in (
        ("official_match_id", ""),
        ("settlement_status", "not_applicable"),
        ("result", ""),
        ("pnl_units", np.nan),
        ("home_goals_90", np.nan),
        ("away_goals_90", np.nan),
        ("settled_at", ""),
    ):
        if column not in output.columns:
            output[column] = default
    output.loc[output["actionable"], "settlement_status"] = "pending"

    reference = matches.copy()
    reference["match_id"] = reference["match_id"].astype(str)
    required_final_columns = {"match_status", "official_match_id"}
    if not required_final_columns.issubset(reference.columns):
        reference = reference.iloc[0:0]
    else:
        final_status = (
            reference["match_status"]
            .astype(str)
            .str.strip()
            .str.casefold()
            .isin({"completed", "final"})
        )
        canonical_official_id = (
            reference["official_match_id"]
            .astype(str)
            .str.fullmatch(r"nwsl::Football_Match::[0-9a-f]{32}")
        )
        reference = reference[final_status & canonical_official_id.fillna(False)]
    reference = reference.drop_duplicates("match_id", keep="last").set_index("match_id")
    stamp = (settled_at or datetime.now(UTC)).astimezone(UTC).isoformat()
    for index, row in output[output["actionable"]].iterrows():
        match_id = str(row["match_id"])
        if match_id not in reference.index:
            continue
        match = reference.loc[match_id]
        home_goals = pd.to_numeric(match.get("home_goals_90"), errors="coerce")
        away_goals = pd.to_numeric(match.get("away_goals_90"), errors="coerce")
        line = pd.to_numeric(row.get("line"), errors="coerce")
        price = pd.to_numeric(row.get("over_odds"), errors="coerce")
        if pd.isna(home_goals) or pd.isna(away_goals) or pd.isna(line):
            continue
        total_goals = float(home_goals + away_goals)
        if total_goals > float(line):
            result = "win"
            pnl = float(price - 1.0) if pd.notna(price) and price > 1.0 else 0.0
        elif total_goals == float(line):
            result = "push"
            pnl = 0.0
        else:
            result = "loss"
            pnl = -1.0
        output.loc[index, "settlement_status"] = "settled"
        output.loc[index, "result"] = result
        output.loc[index, "pnl_units"] = pnl
        output.loc[index, "home_goals_90"] = float(home_goals)
        output.loc[index, "away_goals_90"] = float(away_goals)
        output.loc[index, "official_match_id"] = str(match["official_match_id"])
        output.loc[index, "settled_at"] = stamp

    action_rows = output[output["actionable"]]
    settled_rows = action_rows[action_rows["settlement_status"].astype(str).eq("settled")]
    pnl = pd.to_numeric(settled_rows["pnl_units"], errors="coerce")
    summary = {
        "generated_at": stamp,
        "actionable_decisions": int(len(action_rows)),
        "settled": int(len(settled_rows)),
        "pending": int(action_rows["settlement_status"].astype(str).eq("pending").sum()),
        "wins": int(settled_rows["result"].astype(str).eq("win").sum()),
        "losses": int(settled_rows["result"].astype(str).eq("loss").sum()),
        "pushes": int(settled_rows["result"].astype(str).eq("push").sum()),
        "pnl_units": float(pnl.sum()) if not settled_rows.empty else 0.0,
        "roi_units": float(pnl.mean()) if not settled_rows.empty else 0.0,
    }
    return output, summary
