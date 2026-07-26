#!/usr/bin/env python3
"""Generate and persist the validated totals-over policy slate."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

MODEL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MODEL_ROOT))

from src.betting.frozen_policy_serving import (  # noqa: E402
    append_forward_decisions,
    build_frozen_policy_slate,
)
from src.models.baseline import ProjectionBaselineModel  # noqa: E402
from src.utils.artifacts import latest_version_dir  # noqa: E402
from src.utils.io import (  # noqa: E402
    load_config,
    load_json,
    load_pickle,
    save_csv,
    save_json,
)

UTC = timezone.utc


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate the validated NWSL totals-over policy slate"
    )
    parser.add_argument("--config", default="configs/default.yaml")
    parser.add_argument(
        "--policy-validation",
        default="configs/policies/nwsl_totals_open_over_v1.json",
    )
    parser.add_argument(
        "--model-dir",
        default=(
            "data/processed/policy/nwsl-totals-open-over-v1/"
            "models"
        ),
    )
    parser.add_argument("--matches", default="data/raw/upcoming.csv")
    parser.add_argument("--odds", default="data/raw/odds.csv")
    parser.add_argument("--snapshots", default="data/raw/odds_snapshots.csv")
    parser.add_argument(
        "--output-dir",
        default="data/processed/policy/nwsl-totals-open-over-v1",
    )
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--max-quote-age-minutes", type=int, default=180)
    parser.add_argument("--as-of", default="")
    args = parser.parse_args()

    now = (
        pd.Timestamp(args.as_of).to_pydatetime()
        if args.as_of
        else datetime.now(UTC)
    )
    config = load_config(args.config)
    evidence = load_json(args.policy_validation)
    version_dir = latest_version_dir(Path(args.model_dir))
    if version_dir is None:
        raise SystemExit(f"No trained artifact found under {args.model_dir}")
    ratings_path = version_dir / "team_ratings.pkl"
    if not ratings_path.exists():
        raise SystemExit(f"Missing team ratings artifact: {ratings_path}")
    ratings_model = load_pickle(ratings_path)
    model = ProjectionBaselineModel(
        strategy="team_ratings_poisson",
        ratings_model=ratings_model,
        max_goals=int(config.get("model", {}).get("max_goals", 8)),
    )

    upcoming = pd.read_csv(args.matches, dtype={"match_id": str})
    odds = pd.read_csv(args.odds, dtype={"match_id": str})
    snapshots_path = Path(args.snapshots)
    snapshots = (
        pd.read_csv(snapshots_path, dtype={"match_id": str})
        if snapshots_path.exists()
        else pd.DataFrame()
    )
    slate, summary = build_frozen_policy_slate(
        upcoming=upcoming,
        odds=odds,
        snapshots=snapshots,
        model=model,
        evidence=evidence,
        artifact_version=version_dir.name,
        as_of=now,
        days=args.days,
        max_quote_age_minutes=args.max_quote_age_minutes,
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = pd.Timestamp(now).strftime("%Y%m%dT%H%M%SZ")
    run_dir = output_dir / "runs" / run_id
    save_csv(slate, run_dir / "slate.csv")
    save_json(summary, run_dir / "run_summary.json")
    save_csv(slate, output_dir / "latest_slate.csv")
    save_json(summary, output_dir / "latest_summary.json")

    decision_log_path = output_dir / "forward_decisions.csv"
    existing = (
        pd.read_csv(decision_log_path, dtype={"match_id": str})
        if decision_log_path.exists()
        else pd.DataFrame()
    )
    forward = append_forward_decisions(existing, slate)
    save_csv(forward, decision_log_path)

    print(
        f"{summary['policy_id']}: priced={summary['matches_with_current_total_price']}/"
        f"{summary['matches_in_window']} actionable={summary['actionable_picks']} "
        f"artifact={summary['artifact_version']}"
    )
    for row in slate[slate["actionable"].fillna(False)].itertuples(index=False):
        print(
            f"  {row.match_date} {row.home_team} vs {row.away_team}: "
            f"OVER {row.line:g} @ {row.over_odds:.3f} "
            f"edge={row.edge:.1%} confidence={row.confidence:.1%} "
            f"stake={row.stake_pct:.2%}"
        )
    print(f"Wrote {run_dir}, {output_dir / 'latest_slate.csv'}, {decision_log_path}")


if __name__ == "__main__":
    main()
