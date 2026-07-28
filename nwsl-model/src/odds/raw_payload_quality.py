"""Fail-closed quality helpers for raw sportsbook payloads.

These checks run before provider payloads are normalized. They preserve the
useful schema-fingerprint and quarantine boundary from the retired standalone
NWSL betting scaffold without bringing its parallel application stack into the
active model package.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from typing import Any, Literal

QualityStatus = Literal["valid", "quarantined", "rejected"]


@dataclass(frozen=True)
class QualityDecision:
    status: QualityStatus
    reason: str | None = None


@dataclass(frozen=True)
class RawPayloadQuality:
    payload_hash: str
    schema_fingerprint: str
    decision: QualityDecision


def stable_json(value: Any) -> str:
    """Serialize a payload deterministically for hashing and deduplication."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def payload_hash(payload: Any) -> str:
    return sha256_text(stable_json(payload))


def _schema_paths(value: Any, prefix: str = "") -> list[str]:
    if isinstance(value, Mapping):
        paths: list[str] = []
        for key in sorted(value, key=str):
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            paths.extend(_schema_paths(value[key], child_prefix))
        return paths or [f"{prefix}:empty_object"]

    if isinstance(value, list):
        if not value:
            return [f"{prefix}[]:empty"]
        paths: set[str] = set()
        for item in value:
            paths.update(_schema_paths(item, f"{prefix}[]"))
        return sorted(paths)

    return [f"{prefix}:{type(value).__name__}"]


def nested_schema_fingerprint(payload: Any) -> str:
    """Hash nested field paths and value types, independent of key order."""
    return sha256_text("|".join(_schema_paths(payload)))


def decide_quality(
    *,
    market_known: bool,
    team_known: bool,
    sportsbook_active: bool = True,
    price_valid: bool = True,
    pre_match_valid: bool = True,
    schema_known: bool = True,
) -> QualityDecision:
    """Classify raw odds before normalization.

    Invalid or post-kickoff prices are rejected. Unknown dimensions and schema
    drift are quarantined for review. Only known, valid payloads pass through.
    """
    if not price_valid:
        return QualityDecision("rejected", "invalid_price")
    if not pre_match_valid:
        return QualityDecision("rejected", "post_kickoff_price")
    if not schema_known:
        return QualityDecision("quarantined", "schema_drift")
    if not market_known:
        return QualityDecision("quarantined", "unknown_market")
    if not team_known:
        return QualityDecision("quarantined", "unknown_team")
    if not sportsbook_active:
        return QualityDecision("quarantined", "inactive_or_unknown_sportsbook")
    return QualityDecision("valid")


def evaluate_raw_payload(
    payload: Mapping[str, Any],
    *,
    expected_schema_fingerprints: Collection[str] | None = None,
    market_known: bool,
    team_known: bool,
    sportsbook_active: bool = True,
    price_valid: bool = True,
    pre_match_valid: bool = True,
) -> RawPayloadQuality:
    """Fingerprint and classify one raw provider payload."""
    fingerprint = nested_schema_fingerprint(payload)
    schema_known = (
        expected_schema_fingerprints is None
        or fingerprint in expected_schema_fingerprints
    )
    return RawPayloadQuality(
        payload_hash=payload_hash(payload),
        schema_fingerprint=fingerprint,
        decision=decide_quality(
            market_known=market_known,
            team_known=team_known,
            sportsbook_active=sportsbook_active,
            price_valid=price_valid,
            pre_match_valid=pre_match_valid,
            schema_known=schema_known,
        ),
    )
