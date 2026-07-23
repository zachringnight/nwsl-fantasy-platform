#!/usr/bin/env python3
"""Audit model inputs and latest validation artifacts before backtesting."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loaders import NWSLDataset
from src.backtest.splitter import ExpandingWindowSplitter
from src.features.roster_continuity import compute_roster_continuity
from src.utils.artifacts import resolve_version_dir
from src.utils.dates import parse_mixed_utc_datetime
from src.utils.io import load_config, save_json

UTC = timezone.utc


def _read_csv(path: Path, *, dtype: dict[str, str] | None = None) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype=dtype)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _date_range(frame: pd.DataFrame, date_col: str = "match_date") -> list[str] | None:
    if frame.empty or date_col not in frame.columns:
        return None
    dates = pd.to_datetime(frame[date_col], errors="coerce")
    if dates.dropna().empty:
        return None
    return [str(dates.min().date()), str(dates.max().date())]


def _table_summary(frame: pd.DataFrame, required_cols: list[str] | None = None) -> dict[str, Any]:
    required_cols = required_cols or []
    missing = [column for column in required_cols if column not in frame.columns]
    return {
        "rows": int(len(frame)),
        "columns": list(frame.columns),
        "missing_required_columns": missing,
    }


def _match_summary(frame: pd.DataFrame) -> dict[str, Any]:
    if frame.empty:
        return {"rows": 0}
    output = {
        "rows": int(len(frame)),
        "unique_match_ids": int(frame["match_id"].astype(str).nunique()) if "match_id" in frame.columns else 0,
        "duplicate_match_ids": int(frame["match_id"].astype(str).duplicated().sum()) if "match_id" in frame.columns else 0,
        "date_range": _date_range(frame),
        "season_counts": {},
        "status_counts": {},
        "team_count": 0,
        "teams": [],
        "same_team_rows": 0,
        "missing_required_values": {},
        "team_appearances_by_season": {},
        "regular_season_flags": {},
        "possible_postseason_flags": [],
    }
    if "season" in frame.columns:
        output["season_counts"] = {
            str(int(k)): int(v)
            for k, v in frame.groupby("season", dropna=True).size().to_dict().items()
            if pd.notna(k)
        }
    if "match_status" in frame.columns:
        output["status_counts"] = {
            str(k): int(v) for k, v in frame["match_status"].value_counts(dropna=False).to_dict().items()
        }
    if {"home_team", "away_team"}.issubset(frame.columns):
        teams = sorted(set(frame["home_team"].dropna().astype(str)) | set(frame["away_team"].dropna().astype(str)))
        output["team_count"] = int(len(teams))
        output["teams"] = teams
        output["same_team_rows"] = int((frame["home_team"] == frame["away_team"]).sum())
    required = ["match_id", "match_date", "season", "home_team", "away_team"]
    output["missing_required_values"] = {
        column: int(frame[column].isna().sum())
        for column in required
        if column in frame.columns
    }
    if {"season", "home_team", "away_team"}.issubset(frame.columns):
        for season, group in frame.groupby("season", dropna=True):
            counts = pd.concat([group["home_team"], group["away_team"]]).value_counts().sort_index()
            output["team_appearances_by_season"][str(int(season))] = {
                str(team): int(count) for team, count in counts.to_dict().items()
            }
            if "regular_season_flag" in group.columns:
                flag_counts = group["regular_season_flag"].value_counts(dropna=False).to_dict()
                output["regular_season_flags"][str(int(season))] = {
                    str(key): int(value) for key, value in flag_counts.items()
                }
                if len(counts) > 0 and len(set(counts.tolist())) > 1 and bool(group["regular_season_flag"].astype(bool).all()):
                    output["possible_postseason_flags"].append(
                        {
                            "season": int(season),
                            "reason": "all rows are marked regular-season, but team match counts are uneven",
                            "min_team_matches": int(counts.min()),
                            "max_team_matches": int(counts.max()),
                            "mode_team_matches": int(counts.mode().iloc[0]),
                            "rows_after_mode_footprint": int(max(len(group) - (len(counts) * int(counts.mode().iloc[0]) // 2), 0)),
                        }
                    )
    return output


def _feature_summary(matches: pd.DataFrame) -> dict[str, Any]:
    columns = [
        "home_npxg",
        "away_npxg",
        "home_xg",
        "away_xg",
        "home_penalties",
        "away_penalties",
        "venue",
        "stadium",
        "surface",
        "weather_temp_c",
        "weather_wind_kph",
        "weather_precip_mm",
        "weather_humidity_pct",
    ]
    summary: dict[str, Any] = {}
    for column in columns:
        if column not in matches.columns:
            summary[column] = {"present": False, "missing_pct": 100.0}
            continue
        missing_pct = 0.0 if len(matches) == 0 else float(matches[column].isna().mean() * 100.0)
        summary[column] = {
            "present": True,
            "missing_count": int(matches[column].isna().sum()),
            "missing_pct": round(missing_pct, 2),
        }
    return summary


def _join_summary(matches: pd.DataFrame, upcoming: pd.DataFrame, frame: pd.DataFrame, name: str) -> dict[str, Any]:
    if frame.empty:
        return {"rows": 0, "unique_match_ids": 0}
    completed_ids = set(matches["match_id"].astype(str)) if "match_id" in matches.columns else set()
    upcoming_ids = set(upcoming["match_id"].astype(str)) if "match_id" in upcoming.columns else set()
    frame_ids = set(frame["match_id"].astype(str)) if "match_id" in frame.columns else set()
    output = {
        "rows": int(len(frame)),
        "unique_match_ids": int(len(frame_ids)),
        "overlap_completed_match_ids": int(len(frame_ids & completed_ids)),
        "overlap_upcoming_match_ids": int(len(frame_ids & upcoming_ids)),
        "season_counts": {},
        "team_labels": [],
    }
    if "season" in frame.columns:
        output["season_counts"] = {
            str(int(k)): int(v)
            for k, v in frame.groupby("season", dropna=True).size().to_dict().items()
            if pd.notna(k)
        }
    if "team" in frame.columns:
        output["team_labels"] = sorted(frame["team"].dropna().astype(str).unique().tolist())
    if output["overlap_completed_match_ids"] == 0 and output["overlap_upcoming_match_ids"] == 0:
        output["blocker"] = f"{name} match IDs do not join to ESPN match IDs"
    return output


def _odds_summary(matches: pd.DataFrame, upcoming: pd.DataFrame, odds: pd.DataFrame) -> dict[str, Any]:
    if odds.empty:
        return {"rows": 0, "source_available": False}
    odds = odds.copy()
    odds["match_id"] = odds["match_id"].astype(str)
    odds["source_type"] = odds.get("source_type", "close").astype(str).str.lower()
    odds["market_type"] = odds["market_type"].astype(str).str.lower()
    odds["timestamp"] = parse_mixed_utc_datetime(odds.get("timestamp"))
    completed_ids = set(matches["match_id"].astype(str))
    upcoming_ids = set(upcoming["match_id"].astype(str)) if not upcoming.empty else set()
    close_1x2 = odds[(odds["source_type"] == "close") & (odds["market_type"] == "1x2")]
    total_close = odds[(odds["source_type"] == "close") & (odds["market_type"] == "total")]
    output: dict[str, Any] = {
        "rows": int(len(odds)),
        "source_available": True,
        "unique_match_ids": int(odds["match_id"].nunique()),
        "source_types": {str(k): int(v) for k, v in odds["source_type"].value_counts(dropna=False).to_dict().items()},
        "markets": {str(k): int(v) for k, v in odds["market_type"].value_counts(dropna=False).to_dict().items()},
        "sportsbooks": {str(k): int(v) for k, v in odds["sportsbook"].value_counts(dropna=False).to_dict().items()},
        "timestamp_range": _date_range(odds.rename(columns={"timestamp": "match_date"})),
        "completed_rows": int(odds["match_id"].isin(completed_ids).sum()),
        "completed_unique_match_ids": int(odds.loc[odds["match_id"].isin(completed_ids), "match_id"].nunique()),
        "upcoming_rows": int(odds["match_id"].isin(upcoming_ids).sum()),
        "upcoming_unique_match_ids": int(odds.loc[odds["match_id"].isin(upcoming_ids), "match_id"].nunique()),
        "close_1x2_coverage": {},
        "missing_close_1x2_match_ids": [],
        "close_total_coverage_pct": 0.0,
        "median_1x2_overround_pct": None,
        "price_quality": {},
    }
    for season, group in matches.groupby("season", dropna=True):
        ids = set(group["match_id"].astype(str))
        covered = ids & set(close_1x2["match_id"])
        output["close_1x2_coverage"][str(int(season))] = {
            "covered": int(len(covered)),
            "matches": int(len(ids)),
            "coverage_pct": round(float(len(covered) / max(len(ids), 1) * 100.0), 2),
        }
    missing = matches.loc[~matches["match_id"].astype(str).isin(set(close_1x2["match_id"]))]
    output["missing_close_1x2_match_ids"] = missing["match_id"].astype(str).head(50).tolist()
    output["missing_close_1x2_count"] = int(len(missing))
    output["close_total_coverage_pct"] = round(
        float(total_close["match_id"].nunique() / max(matches["match_id"].astype(str).nunique(), 1) * 100.0),
        2,
    )
    implied = (
        1 / pd.to_numeric(close_1x2.get("home_odds"), errors="coerce")
        + 1 / pd.to_numeric(close_1x2.get("draw_odds"), errors="coerce")
        + 1 / pd.to_numeric(close_1x2.get("away_odds"), errors="coerce")
    )
    if implied.notna().any():
        output["median_1x2_overround_pct"] = round(float((implied.median() - 1.0) * 100.0), 2)
    for column in ["home_odds", "draw_odds", "away_odds", "over_odds", "under_odds"]:
        if column not in odds.columns:
            output["price_quality"][column] = {"present": False}
            continue
        values = pd.to_numeric(odds[column], errors="coerce")
        output["price_quality"][column] = {
            "present": True,
            "non_null": int(values.notna().sum()),
            "invalid_le_1": int(values.le(1.0).sum()),
            "min": None if values.dropna().empty else float(values.min()),
            "max": None if values.dropna().empty else float(values.max()),
        }
    return output


def _truthy(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series.fillna(False)
    return series.astype(str).str.lower().isin({"true", "1", "yes", "y"})


def _personnel_summary(
    matches: pd.DataFrame,
    upcoming: pd.DataFrame,
    appearances: pd.DataFrame,
    projected: pd.DataFrame,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Summarize whether lineups, player impact, and availability are actionable."""
    now = now or datetime.now(UTC)
    completed_ids = set(matches["match_id"].astype(str)) if "match_id" in matches.columns else set()
    upcoming_ids = set(upcoming["match_id"].astype(str)) if "match_id" in upcoming.columns else set()

    output: dict[str, Any] = {
        "availability_signal_available": False,
        "appearances": {
            "rows": int(len(appearances)),
            "unique_match_ids": int(appearances["match_id"].astype(str).nunique())
            if not appearances.empty and "match_id" in appearances.columns
            else 0,
            "completed_match_coverage_pct": 0.0,
            "injury_flag_rows": 0,
            "suspension_flag_rows": 0,
            "national_team_absence_rows": 0,
            "unavailable_rows": 0,
            "starter_team_count_anomalies": [],
        },
        "projected_lineups": {
            "rows": int(len(projected)),
            "unique_match_ids": int(projected["match_id"].astype(str).nunique())
            if not projected.empty and "match_id" in projected.columns
            else 0,
            "completed_match_coverage_pct": 0.0,
            "upcoming_match_coverage_pct": 0.0,
            "status_counts": {},
            "source_counts": {},
            "latest_report_timestamp": None,
            "latest_availability_report_date": None,
            "max_report_age_days": None,
            "stale_threshold_days": 7,
            "stale": False,
            "synthetic_source_only": False,
            "non_available_rows": 0,
        },
    }

    if not appearances.empty and "match_id" in appearances.columns:
        appearance_ids = set(appearances["match_id"].astype(str))
        output["appearances"]["completed_match_coverage_pct"] = round(
            float(len(appearance_ids & completed_ids) / max(len(completed_ids), 1) * 100.0),
            2,
        )
        for column, key in [
            ("injury_flag", "injury_flag_rows"),
            ("suspension_flag", "suspension_flag_rows"),
            ("national_team_absence_flag", "national_team_absence_rows"),
        ]:
            if column in appearances.columns:
                output["appearances"][key] = int(_truthy(appearances[column]).sum())
        if "available_flag" in appearances.columns:
            output["appearances"]["unavailable_rows"] = int((~_truthy(appearances["available_flag"])).sum())
        if {"match_id", "team", "started_flag"}.issubset(appearances.columns):
            starters = appearances.loc[_truthy(appearances["started_flag"])]
            counts = starters.groupby(["match_id", "team"]).size().reset_index(name="n_starters")
            anomalies = counts[counts["n_starters"].lt(8) | counts["n_starters"].gt(12)]
            output["appearances"]["starter_team_count_anomalies"] = anomalies.head(25).to_dict(
                orient="records"
            )

    availability_signal = (
        output["appearances"]["injury_flag_rows"]
        + output["appearances"]["suspension_flag_rows"]
        + output["appearances"]["national_team_absence_rows"]
        + output["appearances"]["unavailable_rows"]
    )

    if not projected.empty and "match_id" in projected.columns:
        projected_ids = set(projected["match_id"].astype(str))
        output["projected_lineups"]["completed_match_coverage_pct"] = round(
            float(len(projected_ids & completed_ids) / max(len(completed_ids), 1) * 100.0),
            2,
        )
        output["projected_lineups"]["upcoming_match_coverage_pct"] = round(
            float(len(projected_ids & upcoming_ids) / max(len(upcoming_ids), 1) * 100.0),
            2,
        )
        if "status" in projected.columns:
            status = projected["status"].fillna("unknown").astype(str).str.lower()
            output["projected_lineups"]["status_counts"] = {
                str(k): int(v) for k, v in status.value_counts(dropna=False).to_dict().items()
            }
            non_available = ~status.isin({"available", "active"})
            output["projected_lineups"]["non_available_rows"] = int(non_available.sum())
            availability_signal += int(status.isin(
                {"injured", "out", "doubtful", "questionable", "suspended", "international_duty"}
            ).sum())
        if "source" in projected.columns:
            source = projected["source"].fillna("unknown").astype(str)
            output["projected_lineups"]["source_counts"] = {
                str(k): int(v) for k, v in source.value_counts(dropna=False).to_dict().items()
            }
            stale_role_sources = {"official_recent_role_model"}
            output["projected_lineups"]["synthetic_source_only"] = set(source.unique()).issubset(
                stale_role_sources
            )
            output["projected_lineups"]["current_role_model_available"] = bool(
                source.str.contains(
                    "official_current_season_role_model",
                    regex=False,
                    na=False,
                ).any()
            )
        if "report_timestamp" in projected.columns:
            timestamps = pd.to_datetime(projected["report_timestamp"], errors="coerce", utc=True).dropna()
            if not timestamps.empty:
                latest = timestamps.max()
                output["projected_lineups"]["latest_report_timestamp"] = latest.isoformat()
                age_days = (now - latest.to_pydatetime()).total_seconds() / 86400.0
                output["projected_lineups"]["max_report_age_days"] = round(float(max(age_days, 0.0)), 2)
                output["projected_lineups"]["stale"] = bool(
                    age_days > output["projected_lineups"]["stale_threshold_days"]
                )
        if "availability_report_date" in projected.columns:
            report_dates = pd.to_datetime(projected["availability_report_date"], errors="coerce").dropna()
            if not report_dates.empty:
                output["projected_lineups"]["latest_availability_report_date"] = str(report_dates.max().date())

    output["availability_signal_available"] = bool(availability_signal > 0)
    return output


def _loader_summary(config: dict[str, Any], dataset: NWSLDataset | None = None) -> dict[str, Any]:
    dataset = dataset or NWSLDataset.from_config(config)
    return {
        "matches": int(len(dataset.matches)),
        "odds": int(0 if dataset.odds is None else len(dataset.odds)),
        "appearances": int(0 if dataset.appearances is None else len(dataset.appearances)),
        "projected_lineups": int(0 if dataset.projected_lineups is None else len(dataset.projected_lineups)),
        "appearance_match_ids": int(0 if dataset.appearances is None else dataset.appearances["match_id"].astype(str).nunique()),
        "projected_lineup_match_ids": int(0 if dataset.projected_lineups is None else dataset.projected_lineups["match_id"].astype(str).nunique()),
        "team_season_priors": int(0 if dataset.team_season_priors is None else len(dataset.team_season_priors)),
        "player_season_priors": int(0 if dataset.player_season_priors is None else len(dataset.player_season_priors)),
        "has_odds": bool(dataset.has_odds),
        "has_appearances": bool(dataset.has_appearances),
        "has_projected_lineups": bool(dataset.has_projected_lineups),
        "has_venues": bool(dataset.has_venues),
        "feature_coverage": _feature_summary(dataset.matches),
    }


def _roster_continuity_summary(player_priors: pd.DataFrame, matches: pd.DataFrame) -> dict[str, Any]:
    target_seasons = (
        matches["season"].dropna().astype(int).unique().tolist()
        if not matches.empty and "season" in matches.columns
        else None
    )
    continuity = compute_roster_continuity(player_priors, target_seasons=target_seasons)
    if continuity.empty:
        return {"rows": 0, "enabled": False}
    return {
        "rows": int(len(continuity)),
        "enabled": True,
        "season_coverage": sorted(continuity["season"].dropna().astype(int).unique().tolist()),
        "mean_score": round(float(continuity["roster_continuity_score"].mean()), 3),
        "min_score": round(float(continuity["roster_continuity_score"].min()), 3),
        "max_score": round(float(continuity["roster_continuity_score"].max()), 3),
        "low_continuity_teams": continuity.loc[
            pd.to_numeric(continuity["roster_continuity_score"], errors="coerce").lt(40.0),
            ["season", "team", "roster_continuity_score", "preseason_historical_prior_weight"],
        ].to_dict(orient="records"),
    }


def _fold_split_summary(matches: pd.DataFrame, min_train_matches: int, step_size: int) -> dict[str, Any]:
    if matches.empty:
        return {"folds": 0, "same_date_splits": []}
    df = matches.sort_values(["match_date", "match_id"]).reset_index(drop=True).copy()
    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce").dt.date
    same_date_splits: list[dict[str, Any]] = []
    splitter = ExpandingWindowSplitter(min_train_matches=min_train_matches, step_size=step_size)
    folds = list(splitter.split(df))
    for fold in folds:
        train = fold.train_matches
        test = fold.test_matches
        if train.empty or test.empty:
            continue
        test_min = test["match_date"].min()
        same_train = train.loc[train["match_date"].eq(test_min), "match_id"].astype(str).tolist()
        same_test = test.loc[test["match_date"].eq(test_min), "match_id"].astype(str).tolist()
        if same_train:
            same_date_splits.append(
                {
                    "fold_id": int(fold.fold_id),
                    "train_rows": int(len(train)),
                    "test_rows": int(len(test)),
                    "date": str(test_min),
                    "train_match_ids_same_date": same_train,
                    "test_match_ids_same_date": same_test,
                }
            )
    return {"folds": int(len(folds)), "same_date_splits": same_date_splits}


def _artifact_summary(version_dir: Path) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "version": version_dir.name if version_dir.exists() else "",
        "exists": version_dir.exists(),
        "training": {},
        "backtest": {},
        "odds_quality": {},
        "dataset_manifest": {},
    }
    if not version_dir.exists():
        return summary
    training = _read_json(version_dir / "training_summary.json")
    backtest = _read_json(version_dir / "backtest_summary.json")
    odds_quality = _read_json(version_dir / "odds_quality_report.json")
    manifest = _read_json(version_dir / "dataset_manifest.json")
    if training:
        summary["training"] = {
            "n_matches": training.get("n_matches"),
            "n_teams": training.get("n_teams"),
            "models": {
                model: {
                    "converged": payload.get("converged"),
                    "grad_norm": payload.get("diagnostics", {}).get("grad_norm"),
                    "warnings": payload.get("warnings", []),
                }
                for model, payload in training.get("models", {}).items()
            },
            "contextual_columns": training.get("contextual_columns", []),
            "model_contextual_columns": training.get("model_contextual_columns", []),
            "roster_continuity": training.get("roster_continuity", {}),
        }
    if backtest:
        summary["backtest"] = backtest.get("models", {})
    if odds_quality:
        summary["odds_quality"] = {
            "total_rows": odds_quality.get("total_rows"),
            "close_coverage_pct": odds_quality.get("close_coverage_pct"),
            "excluded_backtest_matches": odds_quality.get("excluded_backtest_matches"),
            "coverage_by_season": odds_quality.get("coverage_by_season"),
            "current_price_health": odds_quality.get("current_price_health"),
        }
    if manifest:
        summary["dataset_manifest"] = {
            "odds": manifest.get("odds"),
            "missing_feature_coverage": manifest.get("missing_feature_coverage"),
        }
    return summary


def _severity_counts(issues: list[dict[str, str]]) -> dict[str, int]:
    return dict(Counter(issue["severity"] for issue in issues))


def _build_issues(audit: dict[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    matches = audit["matches"]
    features = audit["features"]
    joins = audit["joins"]
    odds = audit["odds"]
    artifact = audit["artifact"]
    folds = audit["fold_splits"]
    loader = audit["loader_effective_counts"]
    personnel = audit.get("personnel", {})
    effective_features = loader.get("feature_coverage", {})
    history_start_season = audit.get("config", {}).get("history_start_season")

    if matches.get("possible_postseason_flags"):
        issues.append(
            {
                "severity": "critical",
                "area": "matches",
                "title": "Potential postseason matches are marked as regular season",
                "detail": "At least one season has uneven team match counts while every row is regular_season_flag=true.",
            }
        )
    if (
        joins.get("appearances", {}).get("overlap_completed_match_ids", 0) == 0
        and joins.get("appearances", {}).get("rows", 0) > 0
        and loader.get("appearances", 0) == 0
    ):
        issues.append(
            {
                "severity": "critical",
                "area": "lineups",
                "title": "Appearance rows do not join to completed matches",
                "detail": "The raw appearance file uses a different match ID namespace than matches.csv; effective loader count is zero.",
            }
        )
    if (
        joins.get("projected_lineups", {}).get("overlap_completed_match_ids", 0) == 0
        and joins.get("projected_lineups", {}).get("overlap_upcoming_match_ids", 0) == 0
        and joins.get("projected_lineups", {}).get("rows", 0) > 0
        and loader.get("projected_lineups", 0) == 0
    ):
        issues.append(
            {
                "severity": "high",
                "area": "lineups",
                "title": "Projected lineup rows do not join to match IDs",
                "detail": "Projected lineup strength becomes a constant zero feature, so lineup signals are not usable.",
            }
        )
    home_npxg = effective_features.get("home_npxg", features.get("home_npxg", {}))
    away_npxg = effective_features.get("away_npxg", features.get("away_npxg", {}))
    if home_npxg.get("present") is False or away_npxg.get("present") is False:
        issues.append(
            {
                "severity": "high",
                "area": "features",
                "title": "No xG/npxG columns are present in matches.csv",
                "detail": "Rolling npxG features fall back to final goals, so the model is not using shot-quality data.",
            }
        )
    elif max(float(home_npxg.get("missing_pct", 100.0)), float(away_npxg.get("missing_pct", 100.0))) > 10.0:
        issues.append(
            {
                "severity": "medium",
                "area": "features",
                "title": "Effective xG/npxG coverage is incomplete",
                "detail": "The loader enriches ASA xG where possible, but more than 10% of completed matches still fall back to goals.",
            }
        )
    if (
        (history_start_season is None or int(history_start_season) <= 2025)
        and odds.get("close_1x2_coverage", {}).get("2025", {}).get("coverage_pct", 100.0) < 95.0
    ):
        issues.append(
            {
                "severity": "high",
                "area": "odds",
                "title": "Historical 1X2 close odds coverage is incomplete for 2025",
                "detail": "A profitability test would ignore or no-bet missing close matches unless coverage is filled or explicitly sampled.",
            }
        )
    if odds.get("close_total_coverage_pct", 0.0) == 0.0:
        issues.append(
            {
                "severity": "medium",
                "area": "odds",
                "title": "No totals close odds are available",
                "detail": "Totals calibration can be measured from scores, but betting/profitability cannot be validated for totals markets.",
            }
        )
    elif odds.get("close_total_coverage_pct", 0.0) < 95.0:
        issues.append(
            {
                "severity": "medium",
                "area": "odds",
                "title": "Historical totals close odds coverage is incomplete",
                "detail": "Totals profitability can be backtested, but missing close lines reduce sample size and can bias market slices.",
            }
        )
    excluded = artifact.get("odds_quality", {}).get("excluded_backtest_matches", {}).get("count")
    if excluded == matches.get("rows"):
        issues.append(
            {
                "severity": "medium",
                "area": "reporting",
                "title": "Odds-quality excluded_backtest_matches is misleading",
                "detail": "The report appears to require both 1X2 and totals close odds, so it excludes all matches even with 1X2 coverage.",
            }
        )
    manifest_missing = artifact.get("dataset_manifest", {}).get("missing_feature_coverage", {})
    if manifest_missing.get("odds_missing_pct") == 100 and odds.get("rows", 0) > 0:
        issues.append(
            {
                "severity": "medium",
                "area": "manifest",
                "title": "Dataset manifest odds_missing_pct is stale",
                "detail": "Manifest says odds are 100% missing despite a populated odds.csv.",
            }
        )
    if folds.get("same_date_splits"):
        issues.append(
            {
                "severity": "medium",
                "area": "backtest",
                "title": "Chronological folds split same-date slates",
                "detail": "Some folds train on matches played the same date as test matches; use date-grouped folds for betting-style validation.",
            }
        )
    if not personnel.get("availability_signal_available", False):
        issues.append(
            {
                "severity": "high",
                "area": "personnel",
                "title": "No real injury or availability signal is available",
                "detail": "Appearance and projected-lineup files do not contain injured, suspended, national-team, unavailable, doubtful, or out rows.",
            }
        )
    projected_personnel = personnel.get("projected_lineups", {})
    appearance_coverage = float(personnel.get("appearances", {}).get("completed_match_coverage_pct") or 0.0)
    if 0.0 < appearance_coverage < 50.0:
        issues.append(
            {
                "severity": "medium",
                "area": "personnel",
                "title": "Historical player appearance coverage is sparse",
                "detail": "Player-impact features are useful for the forward slate, but historical validation has limited completed-match player data.",
            }
        )
    projected_completed_coverage = float(projected_personnel.get("completed_match_coverage_pct") or 0.0)
    projected_upcoming_coverage = float(projected_personnel.get("upcoming_match_coverage_pct") or 0.0)
    if projected_completed_coverage == 0.0 and projected_upcoming_coverage > 0.0:
        issues.append(
            {
                "severity": "medium",
                "area": "personnel",
                "title": "Projected lineup coverage is forward-only",
                "detail": "Upcoming matches have projected lineups, but the current backtest cannot prove the lineup adjustment out of sample.",
            }
        )
    if projected_personnel.get("rows", 0) > 0 and (
        projected_personnel.get("stale", False)
        or projected_personnel.get("synthetic_source_only", False)
    ):
        has_availability_overlay = bool(projected_personnel.get("latest_availability_report_date"))
        issues.append(
            {
                "severity": "high",
                "area": "personnel",
                "title": "Projected lineups are stale or synthetic",
                "detail": (
                    "Official availability is overlaid, but projected starters/minutes still come from stale role-model estimates."
                    if has_availability_overlay
                    else "Current projected starters are role-model estimates rather than confirmed or fresh injury-adjusted lineup reports."
                ),
            }
        )
    return issues


def _format_model_metrics(models: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for model, metrics in models.items():
        log_loss = metrics.get("log_loss_1x2")
        brier = metrics.get("brier_score_1x2")
        total_mae = metrics.get("expected_total_goals_mae")
        if log_loss is None:
            continue
        lines.append(
            f"- {model}: log_loss={float(log_loss):.4f}, "
            f"brier={float(brier):.4f}, total_goals_mae={float(total_mae):.4f}"
        )
    return lines


def _write_markdown(audit: dict[str, Any], path: Path) -> None:
    issues = audit["issues"]
    odds = audit["odds"]
    matches = audit["matches"]
    upcoming = audit["upcoming"]
    artifact = audit["artifact"]
    personnel = audit.get("personnel", {})
    roster_continuity = audit.get("roster_continuity", {})
    lines = [
        f"# NWSL Model Input Audit - {audit['generated_at']}",
        "",
        f"Artifact: `{artifact.get('version', '')}`",
        "",
        "## Verdict",
    ]
    blocking_issues = [issue for issue in issues if issue.get("severity") in {"critical", "high"}]
    if blocking_issues:
        lines.append("Do not run or promote a new profitability backtest until the critical/high input blockers below are handled.")
    elif issues:
        lines.append("No critical/high input blockers were detected. Non-blocking warnings below still affect betting confidence.")
    else:
        lines.append("No critical input blockers were detected by this audit.")
    lines.extend(
        [
            "",
            "## Issues",
        ]
    )
    for issue in issues:
        lines.append(f"- [{issue['severity'].upper()}] {issue['area']}: {issue['title']} - {issue['detail']}")
    if not issues:
        lines.append("- None")
    lines.extend(
        [
            "",
            "## Data Footprint",
            f"- Completed matches: {matches.get('rows', 0)}; seasons={matches.get('season_counts', {})}; date_range={matches.get('date_range')}",
            f"- Upcoming matches: {upcoming.get('rows', 0)}; seasons={upcoming.get('season_counts', {})}; date_range={upcoming.get('date_range')}",
            f"- Completed teams: {matches.get('team_count', 0)}",
            f"- Possible postseason flags: {matches.get('possible_postseason_flags', [])}",
            "",
            "## Effective Loader Counts",
        ]
    )
    for key, value in audit["loader_effective_counts"].items():
        if key == "feature_coverage":
            continue
        lines.append(f"- {key}: {value}")
    lines.extend(
        [
            "",
            "## Effective Feature Coverage",
        ]
    )
    for column, payload in audit["loader_effective_counts"].get("feature_coverage", {}).items():
        lines.append(f"- {column}: present={payload.get('present')}, missing_pct={payload.get('missing_pct')}")
    lines.extend(
        [
            "",
            "## Feature Coverage",
        ]
    )
    for column, payload in audit["features"].items():
        lines.append(f"- {column}: present={payload.get('present')}, missing_pct={payload.get('missing_pct')}")
    lines.extend(
        [
            "",
            "## Join Coverage",
        ]
    )
    for name, payload in audit["joins"].items():
        lines.append(
            f"- {name}: rows={payload.get('rows', 0)}, unique_match_ids={payload.get('unique_match_ids', 0)}, "
            f"completed_overlap={payload.get('overlap_completed_match_ids', 0)}, upcoming_overlap={payload.get('overlap_upcoming_match_ids', 0)}"
        )
    lines.extend(
        [
            "",
            "## Odds Coverage",
            f"- Rows: {odds.get('rows', 0)}; source_types={odds.get('source_types', {})}; markets={odds.get('markets', {})}; sportsbooks={odds.get('sportsbooks', {})}",
            f"- Completed unique matches with odds: {odds.get('completed_unique_match_ids', 0)}",
            f"- Close 1X2 coverage: {odds.get('close_1x2_coverage', {})}",
            f"- Missing close 1X2 count: {odds.get('missing_close_1x2_count', 0)}",
            f"- Close totals coverage pct: {odds.get('close_total_coverage_pct')}",
            f"- Median 1X2 overround pct: {odds.get('median_1x2_overround_pct')}",
            "",
            "## Personnel Readiness",
            f"- Availability signal available: {personnel.get('availability_signal_available', False)}",
            f"- Appearance coverage pct: {personnel.get('appearances', {}).get('completed_match_coverage_pct')}",
            f"- Injury rows: {personnel.get('appearances', {}).get('injury_flag_rows')}; suspended rows: {personnel.get('appearances', {}).get('suspension_flag_rows')}; national-team absence rows: {personnel.get('appearances', {}).get('national_team_absence_rows')}",
            f"- Projected lineup coverage pct: completed={personnel.get('projected_lineups', {}).get('completed_match_coverage_pct')}, upcoming={personnel.get('projected_lineups', {}).get('upcoming_match_coverage_pct')}",
            f"- Projected lineup source counts: {personnel.get('projected_lineups', {}).get('source_counts', {})}",
            f"- Projected lineup status counts: {personnel.get('projected_lineups', {}).get('status_counts', {})}",
            f"- Latest official availability report date: {personnel.get('projected_lineups', {}).get('latest_availability_report_date')}",
            f"- Projected lineup latest report: {personnel.get('projected_lineups', {}).get('latest_report_timestamp')}; age_days={personnel.get('projected_lineups', {}).get('max_report_age_days')}; stale={personnel.get('projected_lineups', {}).get('stale')}",
            "",
            "## Roster Continuity Priors",
            f"- Enabled: {roster_continuity.get('enabled', False)}; rows={roster_continuity.get('rows', 0)}; seasons={roster_continuity.get('season_coverage', [])}",
            f"- Score range: min={roster_continuity.get('min_score')}, mean={roster_continuity.get('mean_score')}, max={roster_continuity.get('max_score')}",
            f"- Low-continuity teams: {roster_continuity.get('low_continuity_teams', [])}",
            "",
            "## Fold Leakage Risk",
            f"- Folds: {audit['fold_splits'].get('folds', 0)}",
            f"- Same-date splits: {len(audit['fold_splits'].get('same_date_splits', []))}",
            "",
            "## Current Backtest Metrics",
        ]
    )
    metric_lines = _format_model_metrics(artifact.get("backtest", {}))
    lines.extend(metric_lines or ["- No backtest metrics found."])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_audit(config_path: Path, version_dir: Path) -> dict[str, Any]:
    model_root = config_path.resolve().parent.parent
    raw_dir = model_root / "data" / "raw"
    matches = _read_csv(raw_dir / "matches.csv", dtype={"match_id": str})
    upcoming = _read_csv(raw_dir / "upcoming.csv", dtype={"match_id": str})
    odds = _read_csv(raw_dir / "odds.csv", dtype={"match_id": str})
    appearances = _read_csv(raw_dir / "appearances.csv", dtype={"match_id": str})
    projected = _read_csv(raw_dir / "projected_lineups.csv", dtype={"match_id": str})
    player_priors = _read_csv(raw_dir / "player_season_priors.csv")
    config = load_config(config_path)
    effective_dataset = NWSLDataset.from_config(config)
    bt_cfg = config.get("backtest", {})
    matches_summary = _match_summary(matches)
    upcoming_summary = _match_summary(upcoming)
    upcoming_seasons = (
        set(pd.to_numeric(upcoming.get("season"), errors="coerce").dropna().astype(int).tolist())
        if "season" in upcoming.columns
        else set()
    )
    matches_summary["possible_postseason_flags"] = [
        flag
        for flag in matches_summary.get("possible_postseason_flags", [])
        if int(flag.get("season", 0)) not in upcoming_seasons
    ]

    audit: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "config_path": str(config_path),
        "config": {
            "history_start_season": config.get("data", {}).get("history_start_season"),
            "history_end_season": config.get("data", {}).get("history_end_season"),
            "prior_history_start_season": config.get("data", {}).get("prior_history_start_season"),
            "prior_history_end_season": config.get("data", {}).get("prior_history_end_season"),
        },
        "artifact_version": version_dir.name,
        "tables": {
            "matches": _table_summary(matches, ["match_id", "match_date", "season", "home_team", "away_team", "home_goals_90", "away_goals_90"]),
            "upcoming": _table_summary(upcoming, ["match_id", "match_date", "season", "home_team", "away_team"]),
            "odds": _table_summary(odds, ["match_id", "sportsbook", "market_type"]),
            "appearances": _table_summary(appearances, ["match_id", "player_id", "team", "start_minute", "end_minute"]),
            "projected_lineups": _table_summary(projected, ["match_id", "team", "player_id"]),
        },
        "matches": matches_summary,
        "upcoming": upcoming_summary,
        "features": _feature_summary(matches),
        "joins": {
            # Use the post-crosswalk effective frames the loader actually feeds the
            # model. The raw CSVs carry official nwsl:: IDs that only join after the
            # match-id crosswalk runs; auditing the raw frames falsely reports a
            # zero-overlap blocker that does not exist in the pipeline.
            "appearances": _join_summary(
                matches,
                upcoming,
                effective_dataset.appearances if effective_dataset.appearances is not None else appearances,
                "appearances",
            ),
            "projected_lineups": _join_summary(
                matches,
                upcoming,
                effective_dataset.projected_lineups if effective_dataset.projected_lineups is not None else projected,
                "projected_lineups",
            ),
        },
        "personnel": _personnel_summary(
            matches,
            upcoming,
            effective_dataset.appearances if effective_dataset.appearances is not None else pd.DataFrame(),
            effective_dataset.projected_lineups if effective_dataset.projected_lineups is not None else pd.DataFrame(),
        ),
        "odds": _odds_summary(matches, upcoming, odds),
        "roster_continuity": _roster_continuity_summary(player_priors, matches),
        "loader_effective_counts": _loader_summary(config, effective_dataset),
        "fold_splits": _fold_split_summary(
            matches,
            min_train_matches=int(bt_cfg.get("min_train_matches", 50)),
            step_size=int(bt_cfg.get("step_size", 1)),
        ),
        "artifact": _artifact_summary(version_dir),
    }
    audit["issues"] = _build_issues(audit)
    audit["issue_counts"] = _severity_counts(audit["issues"])
    return audit


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit NWSL model inputs before backtesting")
    parser.add_argument("--config", default="configs/default.yaml")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", default="")
    parser.add_argument("--output-dir", default="")
    args = parser.parse_args()

    config_path = Path(args.config)
    artifact_root = Path(args.artifact_root)
    version_dir = resolve_version_dir(args.version or None, artifact_root)
    output_dir = Path(args.output_dir) if args.output_dir else version_dir / "audit"
    output_dir.mkdir(parents=True, exist_ok=True)

    audit = build_audit(config_path, version_dir)
    json_path = output_dir / "model_input_audit.json"
    md_path = output_dir / "model_input_audit.md"
    save_json(audit, json_path)
    _write_markdown(audit, md_path)

    print(f"Wrote input audit JSON to {json_path}")
    print(f"Wrote input audit Markdown to {md_path}")
    print(f"Issue counts: {audit['issue_counts']}")
    for issue in audit["issues"]:
        print(f"[{issue['severity'].upper()}] {issue['area']}: {issue['title']}")


if __name__ == "__main__":
    main()
