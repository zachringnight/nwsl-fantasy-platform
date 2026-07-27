#!/usr/bin/env python3
"""Publish the latest frozen-policy run to the live Supabase-backed page."""

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
from src.publishing.model_picks import (  # noqa: E402
    build_publish_payload,
    publish_payload,
)

DEFAULT_URL = "https://nwsl-fantasy-platform.vercel.app/api/model-picks/publish"


def _load_json(path: Path, *, required: bool = True) -> dict:
    if not path.exists():
        if required:
            raise SystemExit(f"Missing required publish artifact: {path}")
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _load_secret(env_name: str) -> str:
    secret = load_env_token(
        env_name,
        env_files=[MODEL_ROOT / ".env.local", REPO_ROOT / ".env.local"],
    )
    if secret:
        return secret
    if sys.platform == "darwin":
        lookup = subprocess.run(
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
        if lookup.returncode == 0 and lookup.stdout.strip():
            return lookup.stdout.strip()
    raise SystemExit(
        f"{env_name} is not configured in the environment, ignored .env.local, "
        "or the nwsl-model-publish macOS Keychain item."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish the latest frozen NWSL policy snapshot")
    parser.add_argument(
        "--policy-dir",
        default="data/processed/policy/nwsl-totals-open-over-v1",
    )
    parser.add_argument(
        "--policy-evidence",
        default="configs/policies/nwsl_totals_open_over_v1.json",
    )
    parser.add_argument(
        "--source-health",
        default="data/raw/odds_source_health.json",
    )
    parser.add_argument("--odds", default="data/raw/odds.csv")
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument("--upcoming", default="data/raw/upcoming.csv")
    parser.add_argument(
        "--official-matches-dir",
        default="../data/nwsl-official",
    )
    parser.add_argument("--max-odds-age-minutes", type=int, default=180)
    parser.add_argument(
        "--url",
        default=os.getenv("NWSL_MODEL_PUBLISH_URL", DEFAULT_URL),
    )
    parser.add_argument(
        "--secret-env",
        default="NWSL_MODEL_PUBLISH_SECRET",
    )
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    policy_dir = Path(args.policy_dir)
    summary = _load_json(policy_dir / "latest_summary.json")
    slate_path = policy_dir / "latest_slate.csv"
    decisions_path = policy_dir / "forward_decisions.csv"
    if not slate_path.exists() or not decisions_path.exists():
        raise SystemExit("Latest slate or forward decision log is missing")

    payload = build_publish_payload(
        summary=summary,
        slate=pd.read_csv(slate_path, dtype={"match_id": str}),
        decisions=pd.read_csv(decisions_path, dtype={"match_id": str}),
        odds=pd.read_csv(Path(args.odds), dtype={"match_id": str}),
        matches=pd.read_csv(
            Path(args.matches),
            dtype={"match_id": str},
        ),
        upcoming=pd.read_csv(
            Path(args.upcoming),
            dtype={"match_id": str},
        ),
        official_matches_dir=Path(args.official_matches_dir),
        forward_results=_load_json(
            policy_dir / "forward_results.json",
            required=False,
        ),
        evidence=_load_json(Path(args.policy_evidence)),
        source_health=_load_json(Path(args.source_health), required=False),
        max_odds_age_minutes=args.max_odds_age_minutes,
    )

    print(
        "Prepared model publication: "
        f"run={payload['run']['runKey']} "
        f"slate_rows={len(payload['slate'])} "
        f"locked_picks={len(payload['picks'])} "
        f"odds_rows={len(payload['odds'])}"
    )
    if args.dry_run:
        return

    result = publish_payload(
        payload,
        url=args.url,
        secret=_load_secret(args.secret_env),
        timeout_seconds=args.timeout_seconds,
    )
    publication = result.get("receipt") or {}
    print(
        "Published model snapshot: "
        f"run={publication.get('runKey', payload['run']['runKey'])} "
        f"slate_rows={publication.get('slateRows', len(payload['slate']))} "
        f"locked_picks_processed="
        f"{publication.get('lockedPicksProcessed', len(payload['picks']))} "
        f"odds_rows={publication.get('oddsRows', len(payload['odds']))}"
    )
    print(
        "PUBLICATION "
        f"publisher=frozen_policy status={result['status']} "
        f"run={payload['run']['runKey']}"
    )


if __name__ == "__main__":
    main()
