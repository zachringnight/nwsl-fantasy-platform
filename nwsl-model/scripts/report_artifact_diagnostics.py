#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.diagnostics import summarize_gate_blockers
from src.utils.gating import PURE_PROJECTION_THRESHOLDS


def main() -> None:
    parser = argparse.ArgumentParser(description="Report promotion blockers for a model artifact")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    version_dir = Path(args.artifact_root) / args.version
    promotion_path = version_dir / "promotion_summary.json"
    promotion = json.loads(promotion_path.read_text(encoding="utf-8"))
    rows = summarize_gate_blockers(
        promotion,
        relative_improvement=PURE_PROJECTION_THRESHOLDS["relative_baseline_improvement"],
        totals_brier_gate=PURE_PROJECTION_THRESHOLDS["totals_brier"],
    )
    frame = pd.DataFrame(rows)
    print(frame.to_string(index=False))
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(args.output, index=False)


if __name__ == "__main__":
    main()
