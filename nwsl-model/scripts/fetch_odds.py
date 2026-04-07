#!/usr/bin/env python3
"""Fetch and normalize live or historical NWSL odds into the raw contract."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loaders import load_matches, load_odds
from src.odds.provider import (
    TheOddsAPIClient,
    fetch_historical_closing_odds,
    load_official_match_reference,
    load_provider_config,
    merge_odds_history,
    normalize_provider_payload,
)
from src.odds.quality import build_odds_quality_report
from src.utils.io import load_config, save_csv, save_json
from src.utils.logging import setup_logging


def _fallback_match_frame(reference: pd.DataFrame) -> pd.DataFrame:
    if reference.empty:
        return pd.DataFrame(columns=["match_id", "season"])
    return reference[["match_id", "season"]].copy()


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch and normalize NWSL odds data")
    parser.add_argument("--config", type=str, default="configs/default.yaml")
    parser.add_argument("--repo-root", type=str, default="")
    parser.add_argument("--mode", choices=["current", "historical", "both"], default="both")
    parser.add_argument("--historical-seasons", nargs="*", type=int, default=None)
    parser.add_argument("--historical-limit", type=int, default=None)
    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.fetch_odds")

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]
    data_cfg = config.get("data", {})
    odds_path = Path(data_cfg.get("odds_path", "data/raw/odds.csv"))
    raw_dir = odds_path.parent
    odds_quality_path = raw_dir / "odds_quality_report.json"

    provider_config = load_provider_config(config)
    client = TheOddsAPIClient(provider_config)

    existing_odds = load_odds(odds_path) if odds_path.exists() else pd.DataFrame()
    fetched_frames: list[pd.DataFrame] = []

    if args.mode in {"current", "both"}:
        current_reference = load_official_match_reference(
            repo_root=repo_root,
            seasons=args.historical_seasons,
            include_completed=False,
            include_upcoming=True,
        )
        payload = client.fetch_current_odds()
        current_rows = normalize_provider_payload(
            payload,
            match_reference=current_reference,
            source_type="current",
            config=provider_config,
        )
        if not current_rows.empty:
            fetched_frames.append(current_rows)
        logger.info(f"Fetched {len(current_rows)} current odds rows.")

    if args.mode in {"historical", "both"}:
        historical_reference = load_official_match_reference(
            repo_root=repo_root,
            seasons=args.historical_seasons,
            include_completed=True,
            include_upcoming=False,
        )
        historical_rows = fetch_historical_closing_odds(
            client,
            historical_reference,
            max_matches=args.historical_limit,
        )
        if not historical_rows.empty:
            fetched_frames.append(historical_rows)
        logger.info(f"Fetched {len(historical_rows)} historical close odds rows.")

    new_rows = (
        pd.concat(fetched_frames, ignore_index=True, sort=False)
        if fetched_frames
        else pd.DataFrame()
    )
    combined = merge_odds_history(existing_odds, new_rows)
    save_csv(combined, odds_path)

    matches_path = Path(str(data_cfg.get("matches_path", "")).strip())
    try:
        if matches_path and matches_path.exists() and matches_path.is_file():
            matches = load_matches(matches_path)
        else:
            raise FileNotFoundError
    except Exception:
        matches = _fallback_match_frame(
            load_official_match_reference(
                repo_root=repo_root,
                seasons=args.historical_seasons,
                include_completed=True,
                include_upcoming=True,
            )
        )
    quality_report = build_odds_quality_report(
        matches=matches,
        odds=combined,
        stale_line_minutes=provider_config.stale_line_minutes,
    )
    save_json(quality_report, odds_quality_path)

    print(f"Wrote {len(combined)} odds rows to {odds_path}")
    print(f"Odds quality report saved to {odds_quality_path}")


if __name__ == "__main__":
    main()
