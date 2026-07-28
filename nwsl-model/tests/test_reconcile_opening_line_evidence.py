from __future__ import annotations

import csv
from pathlib import Path

from scripts.reconcile_opening_line_evidence import (
    _append_only_delta,
    _delta_by_key,
    _validate_partial_log,
)


def test_delta_by_key_preserves_only_new_primary_keys() -> None:
    base = [{"match_id": "1"}, {"match_id": "2"}]
    source = [{"match_id": "2"}, {"match_id": "3"}]

    assert _delta_by_key(base, source, key="match_id") == [{"match_id": "3"}]


def test_append_only_delta_preserves_distinct_observations() -> None:
    fields = ["match_id", "timestamp", "price"]
    base = [{"match_id": "1", "timestamp": "t1", "price": "1.9"}]
    source = [
        {"match_id": "1", "timestamp": "t1", "price": "1.9"},
        {"match_id": "1", "timestamp": "t2", "price": "2.0"},
    ]

    assert _append_only_delta(base, source, fields) == [source[1]]


def test_partial_log_requires_both_publication_outcomes_and_done() -> None:
    _validate_partial_log(
        "\n".join(
            (
                "--- publish_public_data_supabase FAILED ---",
                "--- publish_supabase ok ---",
                "=== 2026-07-28T15:03:11Z done ===",
            )
        )
    )


def test_csv_module_uses_stable_line_endings(tmp_path: Path) -> None:
    path = tmp_path / "rows.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id"], lineterminator="\n")
        writer.writeheader()
        writer.writerow({"id": "1"})

    assert path.read_bytes() == b"id\n1\n"
