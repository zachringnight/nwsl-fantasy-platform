#!/usr/bin/env python3
"""Run a bounded chronological backtest tuning sweep."""

from __future__ import annotations

import argparse
import copy
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.tuning import candidate_id, rank_tuning_results
from src.utils.io import load_config

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGULARIZATION_VALUES = [1000.0, 1500.0, 2000.0, 3000.0, 5000.0]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tune chronological backtest regularization")
    parser.add_argument("--config", default="configs/default.yaml", help="Base YAML config path")
    parser.add_argument(
        "--run-id",
        default=datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"),
        help="Tuning run ID used under data/processed/tuning",
    )
    parser.add_argument(
        "--regularization",
        nargs="+",
        type=float,
        default=DEFAULT_REGULARIZATION_VALUES,
        help="Regularization values to evaluate",
    )
    parser.add_argument("--max-candidates", type=int, default=None)
    parser.add_argument("--step-size", type=int, default=56)
    parser.add_argument("--max-iter", type=int, default=150)
    parser.add_argument(
        "--models",
        nargs="+",
        default=None,
        help="Models to pass through to scripts/backtest.py; defaults to model.primary_model",
    )
    return parser.parse_args()


def resolve_project_path(path: str | Path) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


def regularization_label(value: float) -> str:
    return f"reg_{value:g}".replace(".", "p")


def build_candidate_params(regularization: float, step_size: int, max_iter: int) -> dict[str, Any]:
    return {
        "regularization": regularization,
        "step_size": step_size,
        "max_iter": max_iter,
    }


def build_candidate_config(
    base_config: dict[str, Any],
    regularization: float,
    step_size: int,
    max_iter: int,
) -> dict[str, Any]:
    config = copy.deepcopy(base_config)

    dixon_coles = config.setdefault("dixon_coles", {})
    dixon_coles["regularization"] = regularization
    dixon_coles["contextual_regularization"] = regularization
    dixon_coles["rho_regularization"] = regularization

    bivariate_poisson = config.setdefault("bivariate_poisson", {})
    bivariate_poisson["regularization"] = regularization
    bivariate_poisson["contextual_regularization"] = regularization
    bivariate_poisson["lambda3_regularization"] = regularization

    backtest = config.setdefault("backtest", {})
    backtest["step_size"] = step_size
    backtest["run_ablations"] = False
    backtest["benchmarks"] = []
    fit = backtest.setdefault("fit", {})
    common_fit = fit.setdefault("common", {})
    common_fit["max_iter"] = max_iter

    return config


def write_candidate_config(config: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as handle:
        yaml.safe_dump(config, handle, sort_keys=False)


def run_backtest(
    candidate_config_path: Path,
    output_dir: Path,
    models: list[str],
) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "backtest.py"),
        "--config",
        str(candidate_config_path),
        "--output-dir",
        str(output_dir),
        "--models",
        *models,
    ]
    return subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        capture_output=True,
        check=False,
        text=True,
    )


def write_process_logs(
    run_dir: Path,
    candidate: str,
    result: subprocess.CompletedProcess[str],
) -> None:
    logs_dir = run_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / f"{candidate}.stdout.log").write_text(result.stdout)
    (logs_dir / f"{candidate}.stderr.log").write_text(result.stderr)


def summarize_candidate(
    metrics_path: Path,
    candidate: str,
    candidate_label: str,
    regularization: float,
    config_path: Path,
    output_dir: Path,
    models: list[str],
) -> list[dict[str, Any]]:
    metrics = pd.read_csv(metrics_path)
    selected = metrics[metrics["model"].isin(models)].copy()
    if selected.empty:
        raise ValueError(f"No requested model rows found in {metrics_path}")

    rows: list[dict[str, Any]] = []
    for _, metric_row in selected.iterrows():
        row = metric_row.to_dict()
        row.update(
            {
                "candidate": candidate,
                "candidate_label": candidate_label,
                "regularization": regularization,
                "status": "completed",
                "config_path": str(config_path),
                "output_dir": str(output_dir),
            }
        )
        rows.append(row)
    return rows


def write_summary(rows: list[dict[str, Any]], summary_path: Path) -> pd.DataFrame:
    summary = pd.DataFrame(rows)
    if summary.empty:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary.to_csv(summary_path, index=False)
        return summary

    completed = summary[summary["status"] == "completed"].copy()
    incomplete = summary[summary["status"] != "completed"].copy()
    ranked_completed = rank_tuning_results(completed)
    if not ranked_completed.empty:
        ranked_completed.insert(0, "rank", range(1, len(ranked_completed) + 1))
    frames = [ranked_completed]
    if not incomplete.empty:
        incomplete.insert(0, "rank", pd.NA)
        frames.append(incomplete)
    ranked = pd.concat(frames, ignore_index=True)

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    ranked.to_csv(summary_path, index=False)
    return ranked


def main() -> int:
    args = parse_args()
    if args.max_candidates is not None and args.max_candidates < 1:
        raise SystemExit("--max-candidates must be positive when provided")

    base_config_path = resolve_project_path(args.config)
    base_config = load_config(base_config_path)
    models = args.models or [base_config.get("model", {}).get("primary_model", "dixon_coles")]
    regularization_values = list(args.regularization)
    if args.max_candidates is not None:
        regularization_values = regularization_values[: args.max_candidates]

    run_dir = PROJECT_ROOT / "data" / "processed" / "tuning" / args.run_id
    configs_dir = run_dir / "configs"
    backtests_dir = run_dir / "backtests"
    summary_rows: list[dict[str, Any]] = []

    for regularization in regularization_values:
        params = build_candidate_params(regularization, args.step_size, args.max_iter)
        candidate = f"{regularization_label(regularization)}_{candidate_id(params)}"
        config_path = configs_dir / f"{candidate}.yaml"
        output_dir = backtests_dir / candidate

        candidate_config = build_candidate_config(
            base_config=base_config,
            regularization=regularization,
            step_size=args.step_size,
            max_iter=args.max_iter,
        )
        write_candidate_config(candidate_config, config_path)

        print(f"Running {candidate}...")
        result = run_backtest(config_path, output_dir, models)
        write_process_logs(run_dir, candidate, result)

        if result.returncode != 0:
            summary_rows.append(
                {
                    "candidate": candidate,
                    "candidate_label": regularization_label(regularization),
                    "regularization": regularization,
                    "status": "failed",
                    "return_code": result.returncode,
                    "config_path": str(config_path),
                    "output_dir": str(output_dir),
                }
            )
            continue

        metrics_path = output_dir / "metrics_comparison.csv"
        try:
            summary_rows.extend(
                summarize_candidate(
                    metrics_path=metrics_path,
                    candidate=candidate,
                    candidate_label=regularization_label(regularization),
                    regularization=regularization,
                    config_path=config_path,
                    output_dir=output_dir,
                    models=models,
                )
            )
        except Exception as exc:
            summary_rows.append(
                {
                    "candidate": candidate,
                    "candidate_label": regularization_label(regularization),
                    "regularization": regularization,
                    "status": "failed",
                    "error": str(exc),
                    "config_path": str(config_path),
                    "output_dir": str(output_dir),
                }
            )

    summary_path = run_dir / "summary.csv"
    ranked = write_summary(summary_rows, summary_path)
    print(f"Wrote {summary_path}")

    failures = (
        ranked[ranked["status"] != "completed"]
        if "status" in ranked.columns
        else pd.DataFrame()
    )
    return 1 if len(failures) else 0


if __name__ == "__main__":
    raise SystemExit(main())
