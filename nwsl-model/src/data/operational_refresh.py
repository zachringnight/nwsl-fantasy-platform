"""Rebuild serving-time personnel features without replacing canonical match IDs.

The model's completed/upcoming fixture tables and historical odds use ESPN
match IDs. Official NWSL feeds use a separate ID namespace. Per-match lineup
logs are therefore materialized under ``nwsl-model/data/nwsl-official`` after
being crosswalked to ESPN IDs, while official schedules/profiles/season stats
remain under the repository-level ``data/nwsl-official`` archive.

This module makes that split explicit and rebuilds the four serving-time
feature tables together. Projected lineups retain official IDs on disk and
are crosswalked by ``NWSLDataset`` at load time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.data.asa import load_asa_datasets
from src.data.dataset_builder import (
    build_appearances,
    build_player_season_priors,
    build_projected_lineups,
    build_team_season_priors,
)
from src.data.match_ids import apply_official_match_id_crosswalk
from src.utils.io import save_csv, save_json

UTC = timezone.utc


@dataclass
class OperationalFeatureOutputs:
    appearances: pd.DataFrame
    projected_lineups: pd.DataFrame
    team_season_priors: pd.DataFrame
    player_season_priors: pd.DataFrame
    report: dict[str, Any]


def _read_match_table(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype={"match_id": str})


def _coverage(frame: pd.DataFrame, reference: pd.DataFrame) -> dict[str, Any]:
    reference_ids = (
        set(reference["match_id"].astype(str))
        if not reference.empty and "match_id" in reference.columns
        else set()
    )
    frame_ids = (
        set(frame["match_id"].astype(str))
        if not frame.empty and "match_id" in frame.columns
        else set()
    )
    matched = frame_ids & reference_ids
    return {
        "covered_matches": len(matched),
        "reference_matches": len(reference_ids),
        "coverage_pct": round(100.0 * len(matched) / max(len(reference_ids), 1), 2),
        "missing_match_ids": sorted(reference_ids - matched),
    }


def build_operational_features(
    *,
    repo_root: Path,
    model_root: Path,
    raw_dir: Path,
    season: int,
    timestamp: str | None = None,
    minimum_match_coverage_pct: float = 95.0,
) -> OperationalFeatureOutputs:
    """Build and validate personnel features for training and upcoming serving."""
    repo_root = Path(repo_root).resolve()
    model_root = Path(model_root).resolve()
    raw_dir = Path(raw_dir).resolve()
    generated_at = timestamp or datetime.now(UTC).isoformat()

    asa = load_asa_datasets(raw_dir)
    appearances = build_appearances(model_root)
    player_priors = build_player_season_priors(
        repo_root,
        asa_player_analytics=asa.player_analytics,
    )
    team_priors = build_team_season_priors(
        repo_root,
        player_season_priors=player_priors,
        asa_team_analytics=asa.team_analytics,
    )
    crosswalked_logs = (
        model_root
        / "data"
        / "nwsl-official"
        / f"nwsl_{season}_official_player_match_logs.csv"
    )
    projected = build_projected_lineups(
        repo_root,
        timestamp=generated_at,
        season=season,
        logs_path=crosswalked_logs,
    )

    completed = _read_match_table(raw_dir / "matches.csv")
    upcoming = _read_match_table(raw_dir / "upcoming.csv")
    match_reference = pd.concat(
        [frame for frame in (completed, upcoming) if not frame.empty],
        ignore_index=True,
        sort=False,
    ) if not completed.empty or not upcoming.empty else pd.DataFrame()
    projected_model_ids = apply_official_match_id_crosswalk(
        projected,
        match_reference,
        repo_root / "data" / "nwsl-official",
    )
    if projected_model_ids is None:
        projected_model_ids = pd.DataFrame()

    appearance_coverage = _coverage(appearances, completed)
    projected_coverage = _coverage(projected_model_ids, upcoming)
    duplicate_projection_rows = (
        int(projected.duplicated(["match_id", "team", "player_id"]).sum())
        if not projected.empty
        and {"match_id", "team", "player_id"}.issubset(projected.columns)
        else 0
    )
    blockers: list[str] = []
    if appearances.empty:
        blockers.append("appearances_empty")
    if player_priors.empty:
        blockers.append("player_season_priors_empty")
    if team_priors.empty:
        blockers.append("team_season_priors_empty")
    if not upcoming.empty and projected.empty:
        blockers.append("projected_lineups_empty")
    if appearance_coverage["coverage_pct"] < minimum_match_coverage_pct:
        blockers.append("appearance_match_coverage_below_threshold")
    if not upcoming.empty and projected_coverage["coverage_pct"] < minimum_match_coverage_pct:
        blockers.append("projected_lineup_match_coverage_below_threshold")
    if duplicate_projection_rows:
        blockers.append("duplicate_projected_lineup_rows")
    complete = (
        not appearance_coverage["missing_match_ids"]
        and not projected_coverage["missing_match_ids"]
    )
    feature_status = (
        "excluded"
        if blockers
        else "complete"
        if complete
        else "partial"
    )

    report = {
        "generated_at": generated_at,
        "season": int(season),
        "status": "ready" if not blockers else "blocked",
        "feature_status": feature_status,
        "gating_status": (
            "current"
            if feature_status == "complete"
            else "degraded_context"
            if feature_status == "partial"
            else "blocked"
        ),
        "blockers": blockers,
        "minimum_match_coverage_pct": float(minimum_match_coverage_pct),
        "source_paths": {
            "official_archive": str(repo_root / "data" / "nwsl-official"),
            "crosswalked_player_match_logs": str(crosswalked_logs),
            "asa_cache": str(raw_dir),
        },
        "outputs": {
            "appearances": {
                "rows": int(len(appearances)),
                "unique_matches": int(appearances["match_id"].astype(str).nunique())
                if not appearances.empty
                else 0,
            },
            "projected_lineups": {
                "rows": int(len(projected)),
                "unique_matches": int(projected["match_id"].astype(str).nunique())
                if not projected.empty
                else 0,
                "duplicate_match_team_player_rows": duplicate_projection_rows,
            },
            "team_season_priors": {"rows": int(len(team_priors))},
            "player_season_priors": {"rows": int(len(player_priors))},
        },
        "coverage": {
            "completed_appearance_matches": appearance_coverage,
            "upcoming_projected_lineup_matches": projected_coverage,
        },
    }
    return OperationalFeatureOutputs(
        appearances=appearances,
        projected_lineups=projected,
        team_season_priors=team_priors,
        player_season_priors=player_priors,
        report=report,
    )


def write_operational_features(
    outputs: OperationalFeatureOutputs,
    *,
    raw_dir: Path,
) -> dict[str, Path]:
    """Write validated operational feature tables and their refresh report."""
    raw_dir = Path(raw_dir)
    report_path = raw_dir / "operational_feature_refresh.json"
    if outputs.report.get("status") != "ready":
        save_json(outputs.report, report_path)
        raise ValueError(
            "Operational feature refresh is blocked: "
            + ", ".join(outputs.report.get("blockers", []))
        )

    paths = {
        "appearances": raw_dir / "appearances.csv",
        "projected_lineups": raw_dir / "projected_lineups.csv",
        "team_season_priors": raw_dir / "team_season_priors.csv",
        "player_season_priors": raw_dir / "player_season_priors.csv",
        "report": report_path,
    }
    save_csv(outputs.appearances, paths["appearances"])
    save_csv(outputs.projected_lineups, paths["projected_lineups"])
    save_csv(outputs.team_season_priors, paths["team_season_priors"])
    save_csv(outputs.player_season_priors, paths["player_season_priors"])
    save_json(outputs.report, paths["report"])
    return paths
