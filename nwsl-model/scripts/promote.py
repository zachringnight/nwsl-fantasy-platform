#!/usr/bin/env python3
"""Promote champion artifacts after train/backtest/evaluate outputs exist."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

UTC = timezone.utc
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.utils.artifacts import (
    BLENDED_ALIAS,
    PURE_ALIAS,
    load_champion_registry,
    resolve_version_dir,
    save_champion_registry,
    write_artifact_json,
)
from src.utils.gating import build_evaluation_summary, choose_champions, evaluate_go_live_gates
from src.utils.io import load_json


def _load_optional_json(path: Path) -> dict:
    return load_json(path) if path.exists() else {}


def _merge_registry(
    registry: dict,
    champion_selection: dict,
    version_name: str,
    promoted_at: str,
) -> dict:
    aliases = dict(registry.get("aliases", {}))
    for alias_name, payload in champion_selection.get("aliases", {}).items():
        aliases[alias_name] = {
            **payload,
            "version": version_name,
            "promoted_at": promoted_at,
        }

    experimental = dict(registry.get("experimental", {}))
    experimental.pop(BLENDED_ALIAS, None)
    for alias_name, payload in champion_selection.get("experimental", {}).items():
        experimental[alias_name] = {
            **payload,
            "version": version_name,
            "promoted_at": promoted_at,
        }

    return {"aliases": aliases, "experimental": experimental}


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote champion nwsl-model artifacts")
    parser.add_argument("--artifact-root", type=str, default="data/processed/models")
    parser.add_argument("--version", type=str, default="")
    args = parser.parse_args()

    artifact_root = Path(args.artifact_root)
    version_dir = resolve_version_dir(args.version or None, artifact_root)
    training_summary = _load_optional_json(version_dir / "training_summary.json")
    backtest_summary = _load_optional_json(version_dir / "backtest_summary.json")
    dataset_manifest = _load_optional_json(version_dir / "dataset_manifest.json")

    if not dataset_manifest:
        dataset_manifest = _load_optional_json(Path(__file__).resolve().parent.parent / "data" / "raw" / "dataset_manifest.json")

    evaluation_summary = _load_optional_json(version_dir / "evaluation_summary.json")
    if not evaluation_summary:
        evaluation_summary = build_evaluation_summary(version_dir / "backtest")

    gate_results = evaluate_go_live_gates(
        training_summary=training_summary,
        backtest_summary=backtest_summary,
        evaluation_summary=evaluation_summary,
        dataset_manifest=dataset_manifest,
    )
    # evaluate.py already computed and persisted the baseline gate (it needs
    # the strongest-baseline OOS artifact lookup); if evaluation_summary.json
    # is absent or predates this gate, this is None and promotion behaves
    # exactly as before (fail closed, no baseline champion).
    baseline_gate_result = evaluation_summary.get("baseline_gate_result")
    champion_selection = choose_champions(gate_results, baseline_gate_result)

    registry = load_champion_registry(artifact_root)
    promoted_at = datetime.now(UTC).isoformat()
    next_registry = _merge_registry(
        registry=registry,
        champion_selection=champion_selection,
        version_name=version_dir.name,
        promoted_at=promoted_at,
    )
    save_champion_registry(next_registry, artifact_root)
    write_artifact_json(
        version_dir,
        "promotion_summary.json",
        {
            "version": version_dir.name,
            "promoted_at": promoted_at,
            "gate_results": gate_results,
            "baseline_gate_result": baseline_gate_result,
            "champions": champion_selection,
            "available_aliases": [PURE_ALIAS],
        },
    )

    print(f"Evaluated promotion gates for {version_dir.name}")
    for model_name, result in gate_results.items():
        print(f"  {model_name}: {result['gating_status']}")
    print("Champion registry updated.")


if __name__ == "__main__":
    main()
