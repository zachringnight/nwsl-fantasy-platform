"""Build the traceable general-projection publication contract."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd


UTC = timezone.utc
SCHEMA_VERSION = 1
MODEL_FAMILY = "spi_lite_baseline"


def _number(value: Any, *, field: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError(f"{field} must be finite")
    return parsed


def _coverage(
    quality: dict[str, Any],
    key: str,
) -> dict[str, Any]:
    raw = quality.get("coverage", {}).get(key, {})
    return {
        "coveredMatches": int(raw.get("covered_matches", 0)),
        "referenceMatches": int(raw.get("reference_matches", 0)),
        "missingMatchIds": [str(value) for value in raw.get("missing_match_ids", [])],
    }


def _prediction_row(row: dict[str, Any]) -> dict[str, Any]:
    over_under: dict[str, dict[str, float]] = {}
    for line in ("1.5", "2.5", "3.5", "4.5"):
        over_key = f"prob_over_{line}"
        under_key = f"prob_under_{line}"
        if (
            over_key in row
            and under_key in row
            and pd.notna(row.get(over_key))
            and pd.notna(row.get(under_key))
        ):
            over_under[line] = {
                "over": _number(row[over_key], field=over_key),
                "under": _number(row[under_key], field=under_key),
            }

    return {
        "matchId": str(row["match_id"]),
        "matchDate": str(pd.to_datetime(row["match_date"]).date()),
        "matchStatus": "upcoming",
        "homeTeam": str(row["home_team"]),
        "awayTeam": str(row["away_team"]),
        "homeProbability": _number(row["prob_home"], field="prob_home"),
        "drawProbability": _number(row["prob_draw"], field="prob_draw"),
        "awayProbability": _number(row["prob_away"], field="prob_away"),
        "lambdaHome": _number(row["lambda_home"], field="lambda_home"),
        "lambdaAway": _number(row["lambda_away"], field="lambda_away"),
        "bttsYesProbability": _number(
            row["btts_yes_prob"],
            field="btts_yes_prob",
        ),
        "overUnder": over_under,
        "asianHandicap": {},
    }


def build_general_prediction_payload(
    *,
    predictions: pd.DataFrame,
    training_summary: dict[str, Any],
    completed: pd.DataFrame,
    upcoming: pd.DataFrame,
    quality: dict[str, Any],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Filter predictions to the eligible fixture set and attach exact lineage."""
    required_metadata = (
        "version",
        "serving_model_family",
        "training_cutoff",
        "source_manifest_generated_at",
        "generated_at",
        "gating_status",
        "feature_status",
    )
    missing_metadata = [
        field for field in required_metadata if not training_summary.get(field)
    ]
    if missing_metadata:
        raise ValueError(
            "training summary is missing: " + ", ".join(missing_metadata)
        )
    if training_summary["serving_model_family"] != MODEL_FAMILY:
        raise ValueError("selected general model family is unsupported")
    if quality.get("status") != "ready":
        raise ValueError("operational feature quality is not ready")

    version = str(training_summary["version"])
    completed_ids = (
        set(completed["match_id"].astype(str))
        if not completed.empty and "match_id" in completed.columns
        else set()
    )
    upcoming_ids = (
        set(upcoming["match_id"].astype(str))
        if not upcoming.empty and "match_id" in upcoming.columns
        else set()
    )
    overlap = completed_ids & upcoming_ids
    if overlap:
        raise ValueError(
            "completed and upcoming match IDs overlap: "
            + ", ".join(sorted(overlap)[:10])
        )
    if not upcoming_ids:
        raise ValueError("upcoming fixture set is empty")

    frame = predictions.copy()
    required_columns = {
        "match_id",
        "match_date",
        "home_team",
        "away_team",
        "model_version",
        "model_family",
        "prob_home",
        "prob_draw",
        "prob_away",
        "lambda_home",
        "lambda_away",
        "btts_yes_prob",
    }
    missing_columns = required_columns.difference(frame.columns)
    if missing_columns:
        raise ValueError(
            "prediction rows are missing: " + ", ".join(sorted(missing_columns))
        )
    frame["match_id"] = frame["match_id"].astype(str)
    eligible = frame[
        frame["match_id"].isin(upcoming_ids)
        & ~frame["match_id"].isin(completed_ids)
    ].copy()
    if eligible.empty:
        raise ValueError("no eligible upcoming predictions remain")
    if eligible["match_id"].duplicated().any():
        raise ValueError("eligible predictions contain duplicate match IDs")
    if (
        eligible["model_version"].astype(str).ne(version).any()
        or eligible["model_family"].astype(str).ne(MODEL_FAMILY).any()
    ):
        raise ValueError("prediction output does not match the selected artifact")

    generated_at = pd.Timestamp(training_summary["generated_at"])
    if generated_at.tzinfo is None:
        generated_at = generated_at.tz_localize("UTC")
    else:
        generated_at = generated_at.tz_convert("UTC")
    supplied_now = pd.Timestamp(now or datetime.now(UTC))
    if supplied_now.tzinfo is None:
        supplied_now = supplied_now.tz_localize("UTC")
    else:
        supplied_now = supplied_now.tz_convert("UTC")
    if abs((supplied_now - generated_at).total_seconds()) > 48 * 60 * 60:
        raise ValueError("selected artifact is outside the publication window")

    rows = [
        _prediction_row(row)
        for row in eligible.sort_values(["match_date", "match_id"]).to_dict(
            orient="records"
        )
    ]
    dates = [row["matchDate"] for row in rows]
    appearance_coverage = _coverage(
        quality,
        "completed_appearance_matches",
    )
    projected_coverage = _coverage(
        quality,
        "upcoming_projected_lineup_matches",
    )
    complete = (
        not appearance_coverage["missingMatchIds"]
        and not projected_coverage["missingMatchIds"]
        and appearance_coverage["coveredMatches"]
        == appearance_coverage["referenceMatches"]
        and projected_coverage["coveredMatches"]
        == projected_coverage["referenceMatches"]
    )
    feature_status = "complete" if complete else "partial"
    gating_status = "current" if complete else "degraded_context"
    if training_summary["feature_status"] != feature_status:
        raise ValueError("training feature status does not match current quality")
    if training_summary["gating_status"] != gating_status:
        raise ValueError("training gating status does not match current quality")

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "run": {
            "runKey": f"nwsl-general:{version}",
            "modelVersion": version,
            "modelFamily": MODEL_FAMILY,
            "trainingCutoff": str(training_summary["training_cutoff"]),
            "sourceManifestGeneratedAt": str(
                training_summary["source_manifest_generated_at"]
            ),
            "generatedAt": generated_at.isoformat(),
            "gatingStatus": gating_status,
            "featureStatus": feature_status,
            "rowCount": len(rows),
            "firstPredictionDate": min(dates),
            "lastPredictionDate": max(dates),
            "quality": {
                "completedAppearanceCoverage": appearance_coverage,
                "projectedLineupCoverage": projected_coverage,
            },
        },
        "predictions": rows,
    }
    json.dumps(payload, allow_nan=False)
    return payload
