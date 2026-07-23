#!/usr/bin/env python3
"""Fetch American Soccer Analysis datasets for model feature enrichment."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.asa import fetch_asa_datasets, write_asa_datasets
from src.data.xg_enrichment import enrich_matches_with_asa_xg


def _season_counts(frame, column: str = "season") -> dict[str, int]:
    if frame.empty or column not in frame.columns:
        return {}
    return {
        str(int(season)): int(count)
        for season, count in frame.groupby(column, dropna=True).size().to_dict().items()
    }


def _update_manifest_xg(raw_dir: Path, match_xgoals: pd.DataFrame) -> dict[str, float]:
    manifest_path = raw_dir / "dataset_manifest.json"
    matches_path = raw_dir / "matches.csv"
    if not manifest_path.exists() or not matches_path.exists():
        return {}

    matches = pd.read_csv(matches_path, dtype={"match_id": str})
    enriched = enrich_matches_with_asa_xg(matches, match_xgoals)
    xg_columns = ["home_xg", "away_xg", "home_npxg", "away_npxg"]
    coverage = {
        column: round(float(enriched[column].notna().mean() * 100.0), 2)
        for column in xg_columns
        if column in enriched.columns
    }
    mean_coverage = round(float(sum(coverage.values()) / max(len(coverage), 1)), 2)
    missing_pct = round(100.0 - mean_coverage, 2)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    feature_policy = dict(manifest.get("feature_policy", {}))
    feature_policy["xg_features"] = "asa_match_xgoals_loader_enrichment"
    manifest["feature_policy"] = feature_policy
    asa = dict(manifest.get("asa", {}))
    asa.update(
        {
            "source_available": bool(len(match_xgoals) > 0),
            "match_xgoals_rows": int(len(match_xgoals)),
            "match_xg_coverage_pct": mean_coverage,
            "season_coverage": sorted(
                match_xgoals["season"].dropna().astype(int).unique().tolist()
            )
            if "season" in match_xgoals.columns and not match_xgoals.empty
            else [],
        }
    )
    manifest["asa"] = asa
    missing = dict(manifest.get("missing_feature_coverage", {}))
    missing["xg_missing_pct"] = missing_pct
    missing["asa_match_xg_missing_pct"] = missing_pct
    manifest["missing_feature_coverage"] = missing
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return coverage


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch ASA NWSL datasets")
    parser.add_argument("--seasons", nargs="+", type=int, default=[2025, 2026])
    parser.add_argument("--raw-dir", default="data/raw")
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    datasets = fetch_asa_datasets(args.seasons)
    paths = write_asa_datasets(raw_dir, datasets)
    manifest_xg_coverage = _update_manifest_xg(raw_dir, datasets.match_xgoals)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seasons": sorted(set(int(season) for season in args.seasons)),
        "files": {name: str(path) for name, path in paths.items()},
        "rows": {
            "match_xgoals": int(len(datasets.match_xgoals)),
            "team_analytics": int(len(datasets.team_analytics)),
            "player_analytics": int(len(datasets.player_analytics)),
        },
        "season_counts": {
            "match_xgoals": _season_counts(datasets.match_xgoals),
            "team_analytics": _season_counts(datasets.team_analytics),
            "player_analytics": _season_counts(datasets.player_analytics),
        },
        "manifest_xg_coverage": manifest_xg_coverage,
    }
    report_path = raw_dir / "asa_fetch_report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
