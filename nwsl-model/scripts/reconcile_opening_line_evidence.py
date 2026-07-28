#!/usr/bin/env python3
"""Reconcile the July 28 opening-line worktree without promoting partial output.

The source worktree contains a successful model publication, a failed public
data publication, refreshed historical inputs, older current-odds output, and
five research-only leans from a stale baseline. This script keeps those lanes
separate:

- authoritative refreshed match, ASA, and ESPN inputs replace older copies;
- odds snapshots are merged append-only;
- current odds, predictions, slates, and the operational pick ledger are not
  overwritten; and
- a small checksummed audit bundle preserves the partial run and its deltas.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

MODEL_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = MODEL_ROOT.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.apify_footystats import update_dataset_manifest_odds  # noqa: E402
from scripts.fetch_asa_data import _update_manifest_xg  # noqa: E402

RUN_ID = "20260728T150215Z"
SOURCE_LOG = Path("nwsl-model/logs/track_matchday_20260728T150215Z.log")
EVIDENCE_RELATIVE = Path("nwsl-model/data/evidence") / RUN_ID

AUTHORITATIVE_REPLACEMENTS = (
    Path("nwsl-model/data/raw/matches.csv"),
    Path("nwsl-model/data/raw/upcoming.csv"),
    Path("nwsl-model/data/raw/asa_fetch_report.json"),
    Path("nwsl-model/data/raw/asa_match_xgoals.csv"),
    Path("nwsl-model/data/raw/asa_player_analytics.csv"),
    Path("nwsl-model/data/raw/asa_team_analytics.csv"),
    Path("src/data/espn/matches-2026.json"),
    Path("src/data/espn/standings-2026.json"),
)


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"{path} has no CSV header")
        return list(reader.fieldnames), list(reader)


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _row_identity(row: dict[str, str], fieldnames: list[str]) -> tuple[str, ...]:
    return tuple(row.get(field, "") for field in fieldnames)


def _delta_by_key(
    base_rows: list[dict[str, str]],
    source_rows: list[dict[str, str]],
    *,
    key: str,
) -> list[dict[str, str]]:
    base_keys = {row[key] for row in base_rows}
    return [row for row in source_rows if row[key] not in base_keys]


def _append_only_delta(
    base_rows: list[dict[str, str]],
    source_rows: list[dict[str, str]],
    fieldnames: list[str],
) -> list[dict[str, str]]:
    base_identities = {_row_identity(row, fieldnames) for row in base_rows}
    return [
        row
        for row in source_rows
        if _row_identity(row, fieldnames) not in base_identities
    ]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_manifest(evidence_dir: Path) -> None:
    entries = []
    for path in sorted(item for item in evidence_dir.rglob("*") if item.is_file()):
        if path.name == "MANIFEST.sha256":
            continue
        entries.append(f"{_sha256(path)}  {path.relative_to(evidence_dir)}")
    (evidence_dir / "MANIFEST.sha256").write_text(
        "\n".join(entries) + "\n",
        encoding="utf-8",
    )


def _validate_partial_log(log_text: str) -> None:
    required = (
        "--- publish_public_data_supabase FAILED ---",
        "--- publish_supabase ok ---",
        "=== 2026-07-28T15:03:11Z done ===",
    )
    missing = [marker for marker in required if marker not in log_text]
    if missing:
        raise ValueError(f"source run is missing expected markers: {missing}")


def reconcile(source_worktree: Path, *, apply_data: bool) -> dict[str, Any]:
    source_worktree = source_worktree.resolve()
    if source_worktree == REPOSITORY_ROOT.resolve():
        raise ValueError("source worktree must be separate from the destination repository")

    source_log = source_worktree / SOURCE_LOG
    log_text = source_log.read_text(encoding="utf-8")
    _validate_partial_log(log_text)

    evidence_dir = REPOSITORY_ROOT / EVIDENCE_RELATIVE
    if evidence_dir.exists():
        raise FileExistsError(f"evidence directory already exists: {evidence_dir}")
    evidence_dir.mkdir(parents=True)

    base_matches_fields, base_matches = _read_csv(
        MODEL_ROOT / "data/raw/matches.csv"
    )
    source_matches_fields, source_matches = _read_csv(
        source_worktree / "nwsl-model/data/raw/matches.csv"
    )
    if base_matches_fields != source_matches_fields:
        raise ValueError("matches.csv schemas differ")
    match_delta = _delta_by_key(base_matches, source_matches, key="match_id")
    _write_csv(evidence_dir / "matches_delta.csv", base_matches_fields, match_delta)

    base_snapshot_fields, base_snapshots = _read_csv(
        MODEL_ROOT / "data/raw/odds_snapshots.csv"
    )
    source_snapshot_fields, source_snapshots = _read_csv(
        source_worktree / "nwsl-model/data/raw/odds_snapshots.csv"
    )
    if base_snapshot_fields != source_snapshot_fields:
        raise ValueError("odds_snapshots.csv schemas differ")
    snapshot_delta = _append_only_delta(
        base_snapshots,
        source_snapshots,
        base_snapshot_fields,
    )
    _write_csv(
        evidence_dir / "odds_snapshots_delta.csv",
        base_snapshot_fields,
        snapshot_delta,
    )

    base_ledger_fields, base_ledger = _read_csv(
        MODEL_ROOT / "data/processed/pick_ledger.csv"
    )
    source_ledger_fields, source_ledger = _read_csv(
        source_worktree / "nwsl-model/data/processed/pick_ledger.csv"
    )
    if base_ledger_fields != source_ledger_fields:
        raise ValueError("pick_ledger.csv schemas differ")
    ledger_delta = _delta_by_key(base_ledger, source_ledger, key="pick_id")
    _write_csv(
        evidence_dir / "research_ledger_delta.csv",
        base_ledger_fields,
        ledger_delta,
    )

    shutil.copy2(source_log, evidence_dir / "track_matchday.log")
    shutil.copy2(
        source_worktree / "nwsl-model/data/raw/dataset_manifest.json",
        evidence_dir / "source_dataset_manifest.json",
    )
    shutil.copy2(
        source_worktree / "nwsl-model/data/raw/closing_odds.csv",
        evidence_dir / "source_closing_odds.csv",
    )

    summary = {
        "runId": RUN_ID,
        "status": "partial",
        "publicDataPublication": "failed_validation",
        "modelPublication": "ok",
        "modelRunCompleted": True,
        "officialPicksAdded": 0,
        "matchRowsAdded": len(match_delta),
        "oddsSnapshotRowsAdded": len(snapshot_delta),
        "researchLedgerRowsPreserved": len(ledger_delta),
        "researchLedgerPromotedToOperationalLedger": False,
        "currentOddsOverwritten": False,
        "generatedPredictionsPromoted": False,
        "sourceWorktree": str(source_worktree),
        "failure": (
            "public-data validation rejected a player season-stat row assigned "
            "to a non-league team with zero games played"
        ),
    }
    (evidence_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (evidence_dir / "README.md").write_text(
        "\n".join(
            (
                f"# Opening-line validation evidence — {RUN_ID}",
                "",
                "This is a partial research evidence bundle, not a production release.",
                "",
                "- Model publication completed and added zero official picks.",
                "- Public-data publication failed validation and is not represented as successful.",
                "- Five stale-baseline research leans are preserved only in `research_ledger_delta.csv`.",
                "- Newer current odds in the canonical repository were not overwritten.",
                "- Snapshot reconciliation is append-only.",
                "- `MANIFEST.sha256` covers every retained file in this bundle.",
                "",
            )
        ),
        encoding="utf-8",
    )

    if apply_data:
        for relative in AUTHORITATIVE_REPLACEMENTS:
            destination = REPOSITORY_ROOT / relative
            source = source_worktree / relative
            shutil.copy2(source, destination)

        _write_csv(
            MODEL_ROOT / "data/raw/odds_snapshots.csv",
            base_snapshot_fields,
            [*base_snapshots, *snapshot_delta],
        )
        shutil.copy2(
            source_worktree / "nwsl-model/data/raw/dataset_manifest.json",
            MODEL_ROOT / "data/raw/dataset_manifest.json",
        )
        import pandas as pd

        active_asa_match_xg = pd.read_csv(
            MODEL_ROOT / "data/raw/asa_match_xgoals.csv"
        )
        _update_manifest_xg(MODEL_ROOT / "data/raw", active_asa_match_xg)
        active_odds = pd.read_csv(MODEL_ROOT / "data/raw/odds.csv")
        update_dataset_manifest_odds(
            MODEL_ROOT / "data/raw/dataset_manifest.json",
            active_odds,
        )

    _write_manifest(evidence_dir)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-worktree", type=Path, required=True)
    parser.add_argument("--apply-data", action="store_true")
    args = parser.parse_args()
    summary = reconcile(args.source_worktree, apply_data=args.apply_data)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
