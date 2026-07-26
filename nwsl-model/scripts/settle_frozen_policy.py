#!/usr/bin/env python3
"""Settle the frozen totals-over policy's locked forward decisions."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.betting.frozen_policy_serving import settle_forward_decisions  # noqa: E402
from src.utils.io import save_csv, save_json  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Settle locked NWSL totals-over policy decisions"
    )
    parser.add_argument(
        "--decisions",
        default=(
            "data/processed/policy/nwsl-totals-open-over-v1/"
            "forward_decisions.csv"
        ),
    )
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument(
        "--summary",
        default=(
            "data/processed/policy/nwsl-totals-open-over-v1/"
            "forward_results.json"
        ),
    )
    args = parser.parse_args()

    decisions_path = Path(args.decisions)
    if not decisions_path.exists():
        raise SystemExit(f"No forward decision log found: {decisions_path}")
    decisions = pd.read_csv(decisions_path, dtype={"match_id": str})
    matches = pd.read_csv(args.matches, dtype={"match_id": str})
    settled, summary = settle_forward_decisions(decisions, matches)
    save_csv(settled, decisions_path)
    save_json(summary, args.summary)
    print(
        f"Settled {summary['settled']}/{summary['actionable_decisions']} "
        f"policy picks; pending={summary['pending']} "
        f"ROI={summary['roi_units']:.1%}"
    )
    print(f"Wrote {decisions_path} and {args.summary}")


if __name__ == "__main__":
    main()
