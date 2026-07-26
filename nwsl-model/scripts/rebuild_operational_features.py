#!/usr/bin/env python3
"""Rebuild current appearances, priors, and projected lineups as one unit."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MODEL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = MODEL_ROOT.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.data.operational_refresh import (  # noqa: E402
    build_operational_features,
    write_operational_features,
)


def _resolved(value: str, *, base: Path) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (base / path).resolve()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild serving-time personnel features with ID coverage checks"
    )
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--model-root", default=str(MODEL_ROOT))
    parser.add_argument("--raw-dir", default="data/raw")
    parser.add_argument("--minimum-match-coverage-pct", type=float, default=95.0)
    args = parser.parse_args()

    repo_root = _resolved(args.repo_root, base=MODEL_ROOT)
    model_root = _resolved(args.model_root, base=MODEL_ROOT)
    raw_dir = _resolved(args.raw_dir, base=model_root)
    outputs = build_operational_features(
        repo_root=repo_root,
        model_root=model_root,
        raw_dir=raw_dir,
        season=args.season,
        minimum_match_coverage_pct=args.minimum_match_coverage_pct,
    )
    if outputs.report["status"] != "ready":
        print(json.dumps(outputs.report, indent=2))
        raise SystemExit(1)
    paths = write_operational_features(outputs, raw_dir=raw_dir)
    print(json.dumps(outputs.report, indent=2))
    print("Wrote " + ", ".join(f"{name}={path}" for name, path in paths.items()))


if __name__ == "__main__":
    main()
