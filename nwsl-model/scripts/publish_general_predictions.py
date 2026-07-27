#!/usr/bin/env python3
"""Publish the newest traceable general-projection artifact to Supabase."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import pandas as pd


MODEL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = MODEL_ROOT.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.odds.apify_footystats import load_env_token  # noqa: E402
from src.publishing.general_predictions import (  # noqa: E402
    build_general_prediction_payload,
)
from src.publishing.http import publish_with_readback  # noqa: E402


DEFAULT_URL = (
    "https://nwsl-fantasy-platform.vercel.app"
    "/api/general-predictions/publish"
)


def _json(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Missing required general-projection artifact: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _secret(variable: str) -> str:
    value = load_env_token(
        variable,
        env_files=[MODEL_ROOT / ".env.local", REPO_ROOT / ".env.local"],
    )
    if value:
        return value
    if sys.platform == "darwin":
        completed = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-s",
                "nwsl-model-publish",
                "-a",
                "codex",
                "-w",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            return completed.stdout.strip()
    raise SystemExit(
        f"{variable} is not configured in the environment, ignored "
        ".env.local, or the nwsl-model-publish macOS Keychain item."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publish the latest general NWSL prediction snapshot"
    )
    parser.add_argument(
        "--predictions",
        default="data/processed/predictions.csv",
    )
    parser.add_argument(
        "--model-dir",
        default="data/processed/general/models",
    )
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument(
        "--quality",
        default="data/raw/operational_feature_refresh.json",
    )
    parser.add_argument(
        "--url",
        default=os.getenv("NWSL_GENERAL_PREDICTION_PUBLISH_URL", DEFAULT_URL),
    )
    parser.add_argument(
        "--secret-env",
        default="NWSL_MODEL_PUBLISH_SECRET",
    )
    parser.add_argument("--timeout-seconds", type=float, default=45.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    predictions = pd.read_csv(
        Path(args.predictions),
        dtype={"match_id": str, "model_version": str},
    )
    versions = predictions["model_version"].dropna().astype(str).unique().tolist()
    if len(versions) != 1:
        raise SystemExit("General predictions do not resolve to one model version")
    version = versions[0]
    training_summary = _json(
        Path(args.model_dir) / version / "training_summary.json"
    )
    payload = build_general_prediction_payload(
        predictions=predictions,
        training_summary=training_summary,
        completed=pd.read_csv(Path(args.matches), dtype={"match_id": str}),
        upcoming=pd.read_csv(Path(args.upcoming), dtype={"match_id": str}),
        quality=_json(Path(args.quality)),
    )
    print(
        "Prepared general prediction publication: "
        f"run={payload['run']['runKey']} "
        f"model={payload['run']['modelFamily']} "
        f"training_cutoff={payload['run']['trainingCutoff']} "
        f"rows={len(payload['predictions'])}"
    )
    if args.dry_run:
        return

    result = publish_with_readback(
        payload=payload,
        publish_url=args.url,
        secret=_secret(args.secret_env),
        expected={
            "runKey": payload["run"]["runKey"],
            "modelVersion": payload["run"]["modelVersion"],
        },
        timeout=args.timeout_seconds,
    )
    print(
        "PUBLICATION "
        f"publisher=general_predictions status={result['status']} "
        f"run={payload['run']['runKey']} "
        f"model_version={payload['run']['modelVersion']}"
    )


if __name__ == "__main__":
    main()
