#!/usr/bin/env python3
"""Evaluate model performance: calibration, ROI, CLV, and readiness slices.

Usage:
    python scripts/evaluate.py --backtest-dir data/processed/backtest
    python scripts/evaluate.py --backtest-dir data/processed/backtest --plots
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

UTC = timezone.utc
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.metrics import brier_score_multiclass, log_loss_1x2
from src.betting.clv import clv_summary
from src.models.calibration import (
    apply_prediction_calibration,
    compute_oof_calibrated_predictions,
    expected_calibration_error,
    fit_prediction_calibrators,
    plot_calibration,
)
from src.models.score_matrix_calibration import fit_score_matrix_calibration_from_predictions
from src.utils.artifacts import resolve_version_dir, write_artifact_json
from src.utils.gating import (
    BASELINE_MODELS,
    PURE_MODELS,
    build_evaluation_summary,
    choose_champions,
    evaluate_go_live_gates,
)
from src.utils.io import load_json, save_json
from src.utils.logging import setup_logging

# Out-of-fold calibration folds for the honest post-hoc generalization estimate.
OOF_CALIBRATION_FOLDS = 5
OOF_CALIBRATION_SEED = 0


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return float(numerator / denominator)


def _edge_bucket(edge: float) -> str:
    if edge < 0.03:
        return "0.02-0.03"
    if edge < 0.05:
        return "0.03-0.05"
    if edge < 0.08:
        return "0.05-0.08"
    if edge < 0.12:
        return "0.08-0.12"
    return "0.12+"


def _line_band(line: float | None) -> str:
    if line is None or pd.isna(line):
        return "n/a"
    value = float(line)
    if value <= 2.5:
        return "<=2.5"
    if value <= 3.5:
        return "3.0-3.5"
    return "4.0+"


def _group_metrics(frame: pd.DataFrame) -> dict[str, Any]:
    if frame.empty:
        return {
            "n_bets": 0,
            "total_staked": 0.0,
            "total_pnl": 0.0,
            "roi": 0.0,
            "hit_rate": 0.0,
            "mean_edge": 0.0,
            "mean_probability_edge": 0.0,
            "mean_expected_value": 0.0,
            "mean_clv": 0.0,
            "positive_clv_rate": 0.0,
            "mean_confidence": 0.0,
            "official_pick_count": 0,
            "lean_count": 0,
        }

    total_staked = float(frame["stake"].sum())
    total_pnl = float(frame["pnl"].sum())
    return {
        "n_bets": int(len(frame)),
        "total_staked": total_staked,
        "total_pnl": total_pnl,
        "roi": _safe_ratio(total_pnl, total_staked),
        "hit_rate": float((frame["pnl"] > 0).mean()),
        "mean_edge": float(frame["edge"].mean()) if "edge" in frame.columns else 0.0,
        "mean_probability_edge": float(frame["probability_edge"].mean()) if "probability_edge" in frame.columns else 0.0,
        "mean_expected_value": float(frame["expected_value"].mean()) if "expected_value" in frame.columns else 0.0,
        "mean_clv": float(frame["clv"].mean()) if "clv" in frame.columns else 0.0,
        "positive_clv_rate": float((frame["clv"] > 0).mean()) if "clv" in frame.columns else 0.0,
        "mean_confidence": float(frame["confidence"].mean()) if "confidence" in frame.columns else 0.0,
        "official_pick_count": int(frame["pick_tier"].astype(str).eq("official_pick").sum()) if "pick_tier" in frame.columns else int(len(frame)),
        "lean_count": int(frame["pick_tier"].astype(str).eq("lean").sum()) if "pick_tier" in frame.columns else 0,
    }


def _summarize_launch_totals(preds: pd.DataFrame) -> dict[str, Any]:
    required = {"main_total_line", "prob_over_main_total", "main_total_over_actual"}
    if not required.issubset(preds.columns):
        return {}

    mask = (
        preds["main_total_line"].notna()
        & preds["prob_over_main_total"].notna()
        & preds["main_total_over_actual"].notna()
    )
    if not mask.any():
        return {}

    subset = preds.loc[mask].copy()
    probabilities = subset["prob_over_main_total"].astype(float)
    actual = subset["main_total_over_actual"].astype(int)
    mean_predicted_over = float(probabilities.mean())
    actual_over_rate = float(actual.mean())
    over_probability_bias = actual_over_rate - mean_predicted_over
    if over_probability_bias >= 0.05:
        bias_direction = "underprices_overs"
        recommended_action = "suppress_totals_until_recalibrated"
    elif over_probability_bias <= -0.05:
        bias_direction = "overprices_overs"
        recommended_action = "suppress_totals_until_recalibrated"
    else:
        bias_direction = "balanced"
        recommended_action = "eligible_if_profit_gates_pass"

    return {
        "n": int(len(subset)),
        "ece": float(expected_calibration_error(probabilities.to_numpy(), actual.to_numpy())),
        "brier": float(np.mean((probabilities.to_numpy() - actual.to_numpy()) ** 2)),
        "mean_predicted_over_probability": mean_predicted_over,
        "actual_over_rate": actual_over_rate,
        "over_probability_bias": over_probability_bias,
        "bias_direction": bias_direction,
        "recommended_action": recommended_action,
        "line_distribution": (
            subset["main_total_line"]
            .astype(float)
            .round(2)
            .value_counts()
            .sort_index()
            .astype(int)
            .to_dict()
        ),
    }


def _summarize_posthoc_calibration(
    preds: pd.DataFrame,
    calibrated_preds: pd.DataFrame,
    oof_calibrated_preds: pd.DataFrame | None = None,
) -> dict[str, Any]:
    one_x_two_cols = {"prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"}
    if calibrated_preds.empty or not one_x_two_cols.issubset(calibrated_preds.columns):
        return {"available": False}

    outcomes = np.where(
        preds["home_goals_90"] > preds["away_goals_90"], 0,
        np.where(preds["home_goals_90"] < preds["away_goals_90"], 2, 1),
    )
    before = preds[["prob_home", "prob_draw", "prob_away"]].to_numpy(dtype=float)
    after = calibrated_preds[["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]].to_numpy(dtype=float)
    summary: dict[str, Any] = {
        "available": True,
        # "before"/"after" are in-sample (calibrator fit and scored on the same
        # rows); they overstate the benefit. The *_oof fields are the honest,
        # out-of-fold generalization estimates and are what promotion gates on.
        "multiclass_log_loss_before": float(log_loss_1x2(before, outcomes)),
        "multiclass_log_loss_after": float(log_loss_1x2(after, outcomes)),
        "multiclass_brier_before": float(brier_score_multiclass(before, outcomes)),
        "multiclass_brier_after": float(brier_score_multiclass(after, outcomes)),
        "classwise_ece_before": {},
        "classwise_ece_after": {},
        "totals": {},
    }

    if (
        oof_calibrated_preds is not None
        and not oof_calibrated_preds.empty
        and one_x_two_cols.issubset(oof_calibrated_preds.columns)
    ):
        after_oof = oof_calibrated_preds[
            ["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]
        ].to_numpy(dtype=float)
        summary["calibration_method"] = "out_of_fold_kfold"
        summary["oof_n_folds"] = OOF_CALIBRATION_FOLDS
        summary["multiclass_log_loss_after_oof"] = float(log_loss_1x2(after_oof, outcomes))
        summary["multiclass_brier_after_oof"] = float(brier_score_multiclass(after_oof, outcomes))

    home_actual = (preds["home_goals_90"] > preds["away_goals_90"]).astype(int).to_numpy()
    draw_actual = (preds["home_goals_90"] == preds["away_goals_90"]).astype(int).to_numpy()
    away_actual = (preds["home_goals_90"] < preds["away_goals_90"]).astype(int).to_numpy()
    for index, (label, actual) in enumerate((("home", home_actual), ("draw", draw_actual), ("away", away_actual))):
        summary["classwise_ece_before"][label] = float(expected_calibration_error(before[:, index], actual))
        summary["classwise_ece_after"][label] = float(expected_calibration_error(after[:, index], actual))

    total_goals = preds["home_goals_90"] + preds["away_goals_90"]
    for line in (1.5, 2.5, 3.5, 4.5):
        before_col = f"prob_over_{line}"
        after_col = f"prob_over_{line}_calibrated"
        if before_col not in preds.columns or after_col not in calibrated_preds.columns:
            continue
        mask = preds[before_col].notna() & calibrated_preds[after_col].notna()
        if not mask.any():
            continue
        actual = (total_goals.loc[mask] > line).astype(int).to_numpy()
        before_values = preds.loc[mask, before_col].to_numpy(dtype=float)
        after_values = calibrated_preds.loc[mask, after_col].to_numpy(dtype=float)
        summary["totals"][str(line)] = {
            "ece_before": float(expected_calibration_error(before_values, actual)),
            "ece_after": float(expected_calibration_error(after_values, actual)),
            "brier_before": float(np.mean((before_values - actual) ** 2)),
            "brier_after": float(np.mean((after_values - actual) ** 2)),
            "n": int(mask.sum()),
        }

    return summary


def _summarize_calibrated_predictions(
    preds: pd.DataFrame,
    calibrated_preds: pd.DataFrame,
) -> dict[str, Any]:
    required = {"prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"}
    if calibrated_preds.empty or not required.issubset(calibrated_preds.columns):
        return {"available": False}

    outcomes = np.where(
        preds["home_goals_90"] > preds["away_goals_90"], 0,
        np.where(preds["home_goals_90"] < preds["away_goals_90"], 2, 1),
    )
    probs = calibrated_preds[["prob_home_calibrated", "prob_draw_calibrated", "prob_away_calibrated"]].to_numpy(dtype=float)
    summary: dict[str, Any] = {
        "available": True,
        "metrics": {
            "log_loss_1x2": float(log_loss_1x2(probs, outcomes)),
            "brier_score_1x2": float(brier_score_multiclass(probs, outcomes)),
            "top1_accuracy_1x2": float((np.argmax(probs, axis=1) == outcomes).mean()),
            "forecast_entropy_1x2": float(
                np.mean(-np.sum(np.clip(probs, 1e-15, 1.0) * np.log(np.clip(probs, 1e-15, 1.0)), axis=1))
            ),
        },
        "classwise_ece": {},
        "totals": {},
    }

    home_actual = (preds["home_goals_90"] > preds["away_goals_90"]).astype(int).to_numpy()
    draw_actual = (preds["home_goals_90"] == preds["away_goals_90"]).astype(int).to_numpy()
    away_actual = (preds["home_goals_90"] < preds["away_goals_90"]).astype(int).to_numpy()
    for index, (label, actual) in enumerate((("home", home_actual), ("draw", draw_actual), ("away", away_actual))):
        summary["classwise_ece"][label] = float(expected_calibration_error(probs[:, index], actual))

    total_goals = preds["home_goals_90"] + preds["away_goals_90"]
    for line in (1.5, 2.5, 3.5, 4.5):
        before_col = f"prob_over_{line}_calibrated"
        if before_col not in calibrated_preds.columns:
            continue
        mask = calibrated_preds[before_col].notna()
        if not mask.any():
            continue
        actual = (total_goals.loc[mask] > line).astype(int).to_numpy()
        values = calibrated_preds.loc[mask, before_col].to_numpy(dtype=float)
        summary["totals"][str(line)] = {
            "ece": float(expected_calibration_error(values, actual)),
            "brier": float(np.mean((values - actual) ** 2)),
            "n": int(mask.sum()),
        }

    return summary


def _build_betting_report(
    preds: pd.DataFrame,
    bet_log: pd.DataFrame,
    clv_stats: dict[str, Any],
) -> dict[str, Any]:
    if bet_log.empty:
        return {
            "overall": _group_metrics(bet_log),
            "by_market": {},
            "by_edge_bucket": {},
            "by_season": {},
            "by_line_band": {},
            "clv": clv_stats,
        }

    report = bet_log.copy()
    report["market_base"] = report["market"].astype(str).map(
        lambda market: "1x2" if market.startswith("1x2_") else ("total" if market.startswith("total_") else market)
    )
    report["edge_bucket"] = report["edge"].astype(float).map(_edge_bucket)
    report["line_band"] = report.get("line", pd.Series(index=report.index, dtype=float)).map(_line_band)

    season_lookup = {}
    if "season" in preds.columns:
        season_lookup = preds.assign(match_id=preds["match_id"].astype(str)).set_index("match_id")["season"].to_dict()
    elif "match_date" in preds.columns:
        season_lookup = (
            preds.assign(
                match_id=preds["match_id"].astype(str),
                season=pd.to_datetime(preds["match_date"], errors="coerce").dt.year,
            )
            .set_index("match_id")["season"]
            .to_dict()
        )
    report["season"] = report["match_id"].astype(str).map(season_lookup)

    by_market = {
        str(name): _group_metrics(group)
        for name, group in report.groupby("market_base", dropna=False)
    }
    by_edge_bucket = {
        str(name): _group_metrics(group)
        for name, group in report.groupby("edge_bucket", dropna=False)
    }
    by_season = {
        str(int(name)): _group_metrics(group)
        for name, group in report.groupby("season", dropna=False)
        if pd.notna(name)
    }
    by_line_band = {
        str(name): _group_metrics(group)
        for name, group in report.groupby("line_band", dropna=False)
    }

    return {
        "overall": _group_metrics(report),
        "by_market": by_market,
        "by_edge_bucket": by_edge_bucket,
        "by_season": by_season,
        "by_line_band": by_line_band,
        "clv": clv_stats,
    }


def _slice_metrics(frame: pd.DataFrame) -> dict[str, Any]:
    if frame.empty:
        return {"n_matches": 0}
    outcomes = np.where(
        frame["home_goals_90"] > frame["away_goals_90"], 0,
        np.where(frame["home_goals_90"] < frame["away_goals_90"], 2, 1),
    )
    probs = frame[["prob_home", "prob_draw", "prob_away"]].to_numpy(dtype=float)
    payload = {
        "n_matches": int(len(frame)),
        "log_loss_1x2": float(log_loss_1x2(probs, outcomes)),
        "brier_score_1x2": float(brier_score_multiclass(probs, outcomes)),
    }
    if {"lambda_home", "lambda_away"}.issubset(frame.columns):
        total_actual = (frame["home_goals_90"] + frame["away_goals_90"]).astype(float)
        total_expected = frame["lambda_home"].astype(float) + frame["lambda_away"].astype(float)
        payload["expected_total_goals_mae"] = float(np.mean(np.abs(total_expected - total_actual)))
    return payload


def _build_slice_report(preds: pd.DataFrame) -> dict[str, Any]:
    if preds.empty:
        return {}

    home_matches_played = pd.to_numeric(preds.get("home_season_matches_played"), errors="coerce")
    away_matches_played = pd.to_numeric(preds.get("away_season_matches_played"), errors="coerce")
    season_progress = pd.concat([home_matches_played, away_matches_played], axis=1).max(axis=1)
    confidence = pd.to_numeric(preds.get("confidence_score"), errors="coerce")
    lineup_quality = pd.to_numeric(preds.get("lineup_quality_score"), errors="coerce")
    short_rest = (
        pd.to_numeric(preds.get("home_short_rest"), errors="coerce").fillna(0).astype(int)
        | pd.to_numeric(preds.get("away_short_rest"), errors="coerce").fillna(0).astype(int)
    ).astype(bool)

    high_conf_threshold = float(confidence.median()) if confidence.notna().any() else 0.0
    lineup_threshold = float(lineup_quality.median()) if lineup_quality.notna().any() else 0.0
    is_home_favorite = preds["prob_home"].astype(float) >= preds["prob_away"].astype(float)

    slices = {
        "early_season": preds.loc[season_progress.fillna(0) < 5],
        "later_season": preds.loc[season_progress.fillna(0) >= 5],
        "home_favorite": preds.loc[is_home_favorite],
        "away_favorite": preds.loc[~is_home_favorite],
        "short_rest": preds.loc[short_rest],
        "normal_rest": preds.loc[~short_rest],
        "high_lineup_quality": preds.loc[lineup_quality.fillna(lineup_threshold) >= lineup_threshold],
        "low_lineup_quality": preds.loc[lineup_quality.fillna(lineup_threshold) < lineup_threshold],
        "high_confidence": preds.loc[confidence.fillna(high_conf_threshold) >= high_conf_threshold],
        "low_confidence": preds.loc[confidence.fillna(high_conf_threshold) < high_conf_threshold],
    }
    return {slice_name: _slice_metrics(slice_frame) for slice_name, slice_frame in slices.items()}


def _build_benchmark_comparison(model_name: str, metrics_df: pd.DataFrame) -> dict[str, Any]:
    if model_name not in PURE_MODELS:
        return {}
    candidate_row = metrics_df.loc[metrics_df["model"] == model_name]
    if candidate_row.empty:
        return {}
    candidate = candidate_row.iloc[0]
    baselines = metrics_df.loc[metrics_df["model"].isin(BASELINE_MODELS)].copy()
    if baselines.empty:
        return {}
    strongest = baselines.sort_values("log_loss_1x2", ascending=True).iloc[0]
    comparisons = {}
    for _, baseline in baselines.iterrows():
        comparisons[str(baseline["model"])] = {
            "baseline_log_loss_1x2": float(baseline["log_loss_1x2"]),
            "candidate_log_loss_1x2": float(candidate["log_loss_1x2"]),
            "relative_log_loss_ratio": float(candidate["log_loss_1x2"]) / max(float(baseline["log_loss_1x2"]), 1e-9),
            "baseline_brier_score_1x2": float(baseline["brier_score_1x2"]),
            "candidate_brier_score_1x2": float(candidate["brier_score_1x2"]),
            "relative_brier_ratio": float(candidate["brier_score_1x2"]) / max(float(baseline["brier_score_1x2"]), 1e-9),
        }
    return {
        "strongest_baseline": str(strongest["model"]),
        "comparisons": comparisons,
    }


def _build_ablation_comparison(model_name: str, metrics_df: pd.DataFrame) -> dict[str, Any]:
    if model_name not in PURE_MODELS:
        return {}
    candidate_row = metrics_df.loc[metrics_df["model"] == model_name]
    if candidate_row.empty:
        return {}
    candidate = candidate_row.iloc[0]
    comparison: dict[str, Any] = {}
    for ablation_name in sorted(
        metric_name for metric_name in metrics_df["model"].astype(str).tolist()
        if metric_name.startswith(f"{model_name}__")
    ):
        ablation_row = metrics_df.loc[metrics_df["model"] == ablation_name]
        if ablation_row.empty:
            continue
        ablation = ablation_row.iloc[0]
        comparison[ablation_name.split("__", 1)[1]] = {
            "ablation_model": ablation_name,
            "candidate_log_loss_1x2": float(candidate["log_loss_1x2"]),
            "ablation_log_loss_1x2": float(ablation["log_loss_1x2"]),
            "delta_log_loss_1x2": float(ablation["log_loss_1x2"] - candidate["log_loss_1x2"]),
            "candidate_brier_score_1x2": float(candidate["brier_score_1x2"]),
            "ablation_brier_score_1x2": float(ablation["brier_score_1x2"]),
            "delta_brier_score_1x2": float(ablation["brier_score_1x2"] - candidate["brier_score_1x2"]),
        }
    return comparison


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate NWSL model performance")
    parser.add_argument("--artifact-root", type=str, default="data/processed/models")
    parser.add_argument("--backtest-dir", type=str, default="")
    parser.add_argument("--plots", action="store_true", help="Generate plots")
    parser.add_argument("--output-dir", type=str, default="")
    parser.add_argument("--version", type=str, default="")
    args = parser.parse_args()

    setup_logging("INFO")
    logger = logging.getLogger("nwsl_model.evaluate")

    version_dir = resolve_version_dir(args.version or None, Path(args.artifact_root))
    bt_dir = Path(args.backtest_dir) if args.backtest_dir else version_dir / "backtest"
    out_dir = Path(args.output_dir) if args.output_dir else version_dir / "evaluation"
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = bt_dir / "metrics_comparison.csv"
    if not metrics_path.exists():
        logger.error(f"Metrics file not found: {metrics_path}. Run backtest first.")
        sys.exit(1)

    metrics_df = pd.read_csv(metrics_path)
    print("\n=== MODEL COMPARISON ===")
    print(metrics_df.to_string(index=False))

    generated_at = datetime.now(UTC).isoformat()
    training_summary = load_json(version_dir / "training_summary.json") if (version_dir / "training_summary.json").exists() else {}
    dataset_manifest = load_json(version_dir / "dataset_manifest.json") if (version_dir / "dataset_manifest.json").exists() else {}
    eval_results = build_evaluation_summary(bt_dir).get("models", {})
    model_reports: dict[str, Any] = {}
    clv_by_model: dict[str, dict[str, Any]] = {}
    predictions_by_model: dict[str, pd.DataFrame] = {}
    slice_reports: dict[str, dict[str, Any]] = {}
    calibration_artifacts: dict[str, Any] = {"version": version_dir.name, "generated_at": generated_at, "models": {}}

    for pred_file in bt_dir.glob("predictions_*.csv"):
        model_name = pred_file.stem.replace("predictions_", "")
        preds = pd.read_csv(pred_file)
        predictions_by_model[model_name] = preds
        calibrators = fit_prediction_calibrators(preds)
        score_matrix_artifact = fit_score_matrix_calibration_from_predictions(preds)
        model_calibration_artifact = dict(calibrators)
        model_calibration_artifact["score_matrix"] = score_matrix_artifact
        calibrated_preds = apply_prediction_calibration(preds, calibrators)
        oof_calibrated_preds = compute_oof_calibrated_predictions(
            preds, n_folds=OOF_CALIBRATION_FOLDS, seed=OOF_CALIBRATION_SEED
        )
        calibration_artifacts["models"][model_name] = model_calibration_artifact

        if "prob_home" not in preds.columns:
            continue

        predicted = preds["prob_home"].values
        if "home_goals_90" in preds.columns and "away_goals_90" in preds.columns:
            actual = (preds["home_goals_90"] > preds["away_goals_90"]).astype(int).values
        elif "home_win" in preds.columns:
            actual = preds["home_win"].values.astype(int)
        else:
            continue

        ece = expected_calibration_error(predicted, actual)
        eval_results.setdefault(model_name, {})
        raw_classwise_ece = dict(eval_results[model_name].get("classwise_ece", {}))
        raw_totals = dict(eval_results[model_name].get("totals", {}))
        posthoc = _summarize_posthoc_calibration(preds, calibrated_preds, oof_calibrated_preds)
        calibrated_summary = _summarize_calibrated_predictions(preds, calibrated_preds)
        eval_results[model_name]["ece_home_win"] = float(ece)
        eval_results[model_name]["launch_totals"] = _summarize_launch_totals(preds)
        eval_results[model_name]["posthoc_calibration"] = posthoc
        eval_results[model_name]["score_matrix_calibration"] = {
            "available": bool(score_matrix_artifact.get("available")),
            "accepted": bool(score_matrix_artifact.get("accepted", False)),
            "selected": score_matrix_artifact.get("selected"),
            "metrics_before": score_matrix_artifact.get("metrics_before", {}),
            "metrics_after": score_matrix_artifact.get("metrics_after", {}),
            "delta": score_matrix_artifact.get("delta", {}),
            "reason": score_matrix_artifact.get("reason", ""),
            "source": score_matrix_artifact.get("source", ""),
        }
        eval_results[model_name]["benchmark_comparison"] = _build_benchmark_comparison(model_name, metrics_df)
        eval_results[model_name]["ablation_comparison"] = _build_ablation_comparison(model_name, metrics_df)
        slice_reports[model_name] = _build_slice_report(preds)
        eval_results[model_name]["slice_metrics"] = slice_reports[model_name]
        fit_diagnostics: dict[str, Any] = {}
        if "fit_converged" in preds.columns:
            fit_converged = pd.to_numeric(preds["fit_converged"], errors="coerce").dropna()
            if not fit_converged.empty:
                fit_diagnostics["converged_rate"] = float(fit_converged.mean())
            for source_col, target_col in [
                ("fit_iterations", "median_iterations"),
                ("fit_nfev", "median_nfev"),
                ("fit_grad_norm", "median_grad_norm"),
                ("fit_n_params", "median_n_params"),
            ]:
                series = pd.to_numeric(preds[source_col], errors="coerce").dropna() if source_col in preds.columns else pd.Series(dtype=float)
                if not series.empty:
                    fit_diagnostics[target_col] = float(series.median())
        if fit_diagnostics:
            eval_results[model_name]["fit_diagnostics"] = fit_diagnostics
        eval_results[model_name]["raw_classwise_ece"] = raw_classwise_ece
        eval_results[model_name]["raw_totals"] = raw_totals
        if calibrated_summary.get("available"):
            eval_results[model_name]["calibrated_metrics"] = calibrated_summary["metrics"]
            eval_results[model_name]["calibrated_classwise_ece"] = calibrated_summary["classwise_ece"]
            eval_results[model_name]["calibrated_totals"] = calibrated_summary["totals"]
            eval_results[model_name]["classwise_ece"] = calibrated_summary["classwise_ece"]
            eval_results[model_name]["totals"] = calibrated_summary["totals"]
        else:
            eval_results[model_name]["calibrated_metrics"] = {}
            eval_results[model_name]["calibrated_classwise_ece"] = raw_classwise_ece
            eval_results[model_name]["calibrated_totals"] = raw_totals
            eval_results[model_name]["classwise_ece"] = raw_classwise_ece
            eval_results[model_name]["totals"] = raw_totals

        print(f"\n--- {model_name} ---")
        print(f"  ECE (Home Win): {ece:.4f}")
        if eval_results[model_name]["launch_totals"]:
            print(
                "  Launch totals:"
                f" n={eval_results[model_name]['launch_totals']['n']},"
                f" brier={eval_results[model_name]['launch_totals']['brier']:.4f},"
                f" ece={eval_results[model_name]['launch_totals']['ece']:.4f}"
            )
        if calibrated_summary.get("available"):
            calibrated_metrics = calibrated_summary["metrics"]
            print(
                "  Calibrated 1X2:"
                f" log_loss={calibrated_metrics['log_loss_1x2']:.4f},"
                f" brier={calibrated_metrics['brier_score_1x2']:.4f},"
                f" entropy={calibrated_metrics['forecast_entropy_1x2']:.4f}"
            )
        if score_matrix_artifact.get("available"):
            selected = score_matrix_artifact["selected"]
            delta = score_matrix_artifact.get("delta", {})
            print(
                "  Score-matrix candidate:"
                f" scale={selected['total_intensity_scale']:.2f},"
                f" draw={selected['draw_inflation']:.2f},"
                f" accepted={score_matrix_artifact.get('accepted', False)},"
                f" delta_objective={delta.get('objective', 0.0):.4f}"
            )
        if fit_diagnostics:
            print(
                "  Fit diagnostics:"
                f" converged_rate={fit_diagnostics.get('converged_rate', 0.0):.2f},"
                f" median_grad_norm={fit_diagnostics.get('median_grad_norm', float('nan')):.4g}"
            )

        if args.plots:
            try:
                plot_calibration(
                    predicted,
                    actual,
                    title=f"Calibration: {model_name} (Home Win)",
                    save_path=str(out_dir / f"calibration_{model_name}_home.png"),
                )
                logger.info(f"Calibration plot saved for {model_name}")
            except Exception as exc:  # pragma: no cover - plotting is optional
                logger.warning(f"Failed to plot for {model_name}: {exc}")

        for line in ["1.5", "2.5", "3.5", "4.5"]:
            over_col = f"prob_over_{line}"
            if over_col in preds.columns and "total_goals" in preds.columns:
                mask = preds[over_col].notna()
                over_pred = preds.loc[mask, over_col].values
                over_actual = (preds.loc[mask, "total_goals"] > float(line)).astype(int).values
                if len(over_pred) > 0:
                    ece_over = expected_calibration_error(over_pred, over_actual)
                    eval_results.setdefault(model_name, {})
                    eval_results[model_name][f"ece_over_{line}"] = float(ece_over)
                    print(f"  ECE (Over {line}): {ece_over:.4f}")

                    if args.plots:
                        try:
                            plot_calibration(
                                over_pred,
                                over_actual,
                                title=f"Calibration: {model_name} (Over {line})",
                                save_path=str(out_dir / f"calibration_{model_name}_over_{line}.png"),
                            )
                        except Exception:  # pragma: no cover - plotting is optional
                            pass

    print("\n=== CLV ANALYSIS ===")
    for clv_file in bt_dir.glob("clv_*.csv"):
        model_name = clv_file.stem.replace("clv_", "")
        clv_df = pd.read_csv(clv_file)
        stats = clv_summary(clv_df)
        clv_by_model[model_name] = stats
        print(f"\n--- {model_name} ---")
        for key, value in stats.items():
            if isinstance(value, float):
                print(f"  {key}: {value:.4f}")
            else:
                print(f"  {key}: {value}")
        eval_results.setdefault(model_name, {})["clv"] = stats

    if args.plots and "roi" in metrics_df.columns:
        try:
            import matplotlib.pyplot as plt

            fig, ax = plt.subplots(figsize=(10, 6))
            models = metrics_df["model"].values
            rois = metrics_df["roi"].values

            colors = ["green" if r > 0 else "red" for r in rois]
            ax.bar(models, rois * 100, color=colors, alpha=0.7)
            ax.set_ylabel("ROI (%)")
            ax.set_title("ROI by Model")
            ax.axhline(y=0, color="black", linestyle="-", linewidth=0.5)

            fig.savefig(str(out_dir / "roi_comparison.png"), dpi=150, bbox_inches="tight")
            plt.close(fig)
            logger.info("ROI comparison chart saved")
        except Exception as exc:  # pragma: no cover - plotting is optional
            logger.warning(f"Failed to generate ROI chart: {exc}")

    print("\n=== BET LOG ANALYSIS ===")
    for log_file in bt_dir.glob("bet_log_*.csv"):
        model_name = log_file.stem.replace("bet_log_", "")
        log_df = pd.read_csv(log_file)
        if log_df.empty:
            model_reports[model_name] = _build_betting_report(
                predictions_by_model.get(model_name, pd.DataFrame()),
                log_df,
                clv_by_model.get(model_name, {}),
            )
            continue

        report = _build_betting_report(
            predictions_by_model.get(model_name, pd.DataFrame()),
            log_df,
            clv_by_model.get(model_name, {}),
        )
        model_reports[model_name] = report
        eval_results.setdefault(model_name, {})["betting"] = report

        print(f"\n--- {model_name} ---")
        print(f"  Total bets: {report['overall']['n_bets']}")
        print(f"  Total staked: {report['overall']['total_staked']:.2f}")
        print(f"  Total PnL: {report['overall']['total_pnl']:.2f}")
        print(f"  ROI: {report['overall']['roi'] * 100:.2f}%")
        print(f"  Hit rate: {report['overall']['hit_rate'] * 100:.1f}%")

        if args.plots and "bankroll_after" in log_df.columns:
            try:
                import matplotlib.pyplot as plt

                fig, ax = plt.subplots(figsize=(12, 5))
                ax.plot(range(len(log_df)), log_df["bankroll_after"], linewidth=1.5)
                ax.set_xlabel("Bet number")
                ax.set_ylabel("Bankroll")
                ax.set_title(f"Bankroll Over Time: {model_name}")
                ax.axhline(
                    y=log_df["bankroll_after"].iloc[0],
                    color="gray",
                    linestyle="--",
                    alpha=0.5,
                )
                fig.savefig(str(out_dir / f"bankroll_{model_name}.png"), dpi=150, bbox_inches="tight")
                plt.close(fig)
            except Exception:  # pragma: no cover - plotting is optional
                pass

    for model_name in eval_results:
        model_reports.setdefault(
            model_name,
            _build_betting_report(
                predictions_by_model.get(model_name, pd.DataFrame()),
                pd.DataFrame(),
                clv_by_model.get(model_name, {}),
            ),
        )
        eval_results.setdefault(model_name, {}).setdefault("betting", model_reports[model_name])

    backtest_summary = {
        "version": version_dir.name,
        "models": {
            str(row["model"]): {
                key: value
                for key, value in row.items()
                if key != "model" and pd.notna(value)
            }
            for row in metrics_df.to_dict("records")
        },
    }
    evaluation_context = {
        "version": version_dir.name,
        "generated_at": generated_at,
        "models": eval_results,
        "slice_metrics": slice_reports,
    }
    gate_results = evaluate_go_live_gates(
        training_summary=training_summary,
        backtest_summary=backtest_summary,
        evaluation_summary=evaluation_context,
        dataset_manifest=dataset_manifest,
    )
    champion_selection = choose_champions(gate_results)

    evaluation_payload = {
        "version": version_dir.name,
        "generated_at": generated_at,
        "models": eval_results,
        "slice_metrics": slice_reports,
        "gate_results": gate_results,
        "champion_recommendation": champion_selection,
    }
    model_report_payload = {
        "version": version_dir.name,
        "generated_at": generated_at,
        "models": model_reports,
    }

    save_json(evaluation_payload, out_dir / "evaluation_results.json")
    save_json(model_report_payload, out_dir / "model_report.json")
    save_json(calibration_artifacts, out_dir / "calibration_artifacts.json")
    write_artifact_json(version_dir, "evaluation_summary.json", evaluation_payload)
    write_artifact_json(version_dir, "model_report.json", model_report_payload)
    write_artifact_json(version_dir, "calibration_artifacts.json", calibration_artifacts)
    print(f"\nEvaluation results saved to {out_dir}")


if __name__ == "__main__":
    main()
