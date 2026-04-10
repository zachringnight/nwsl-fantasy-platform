from __future__ import annotations

from pathlib import Path

from src.utils.artifacts import (
    available_model_names,
    create_version_dir,
    resolve_model_artifact,
    save_champion_registry,
)
from src.utils.gating import choose_champions, evaluate_go_live_gates


def test_resolve_model_artifact_prefers_champion_alias(tmp_path: Path) -> None:
    artifact_root = tmp_path / "models"
    version_dir = create_version_dir("v-test", artifact_root)
    (version_dir / "dixon_coles_model.pkl").write_bytes(b"pickle")
    save_champion_registry(
        {
            "aliases": {
                "champion_pure": {
                    "version": "v-test",
                    "model_family": "dixon_coles",
                    "blended": False,
                    "gating_status": "passed",
                }
            },
            "experimental": {},
        },
        artifact_root,
    )

    artifact = resolve_model_artifact("champion_pure", artifact_root)
    assert artifact["version"] == "v-test"
    assert artifact["model_family"] == "dixon_coles"
    assert artifact["gating_status"] == "passed"


def test_resolve_model_artifact_falls_back_to_best_baseline(tmp_path: Path) -> None:
    artifact_root = tmp_path / "models"
    version_dir = create_version_dir("v-test", artifact_root)
    (version_dir / "backtest_summary.json").write_text(
        """
        {
          "models": {
            "home_field_baseline": {"log_loss_1x2": 1.04},
            "team_ratings_poisson": {"log_loss_1x2": 1.07},
            "rolling_npxg_poisson": {"log_loss_1x2": 1.02}
          }
        }
        """.strip()
    )

    artifact = resolve_model_artifact("champion_pure", artifact_root)
    assert artifact["version"] == "v-test"
    assert artifact["model_family"] == "rolling_npxg_poisson"
    assert artifact["gating_status"] == "baseline_fallback"
    assert artifact["kind"] == "baseline_fallback"


def test_available_model_names_exposes_champion_pure_when_latest_exists(tmp_path: Path) -> None:
    artifact_root = tmp_path / "models"
    create_version_dir("v-test", artifact_root)

    model_names = available_model_names(artifact_root)
    assert "champion_pure" in model_names


def test_pure_projection_gates_choose_pure_champion_only() -> None:
    training_summary = {
        "models": {
            "dixon_coles": {"converged": True},
            "bivariate_poisson": {"converged": True},
        }
    }
    backtest_summary = {
        "models": {
            "uniform_baseline": {"log_loss_1x2": 1.10, "brier_score_1x2": 0.70, "expected_total_goals_mae": 1.20},
            "home_field_baseline": {"log_loss_1x2": 0.95, "brier_score_1x2": 0.60, "expected_total_goals_mae": 1.05},
            "team_ratings_poisson": {"log_loss_1x2": 0.90, "brier_score_1x2": 0.55, "expected_total_goals_mae": 0.98},
            "rolling_npxg_poisson": {"log_loss_1x2": 0.88, "brier_score_1x2": 0.53, "expected_total_goals_mae": 0.97},
            "dixon_coles": {"log_loss_1x2": 0.84, "brier_score_1x2": 0.50, "expected_total_goals_mae": 0.94},
            "bivariate_poisson": {"log_loss_1x2": 0.87, "brier_score_1x2": 0.52, "expected_total_goals_mae": 0.99},
        }
    }
    evaluation_summary = {
        "models": {
            "dixon_coles": {
                "classwise_ece": {"home": 0.02, "draw": 0.03, "away": 0.04},
                "totals": {"2.5": {"ece": 0.03, "brier": 0.20}, "3.5": {"ece": 0.04, "brier": 0.21}},
                "posthoc_calibration": {"available": True},
                "benchmark_comparison": {"strongest_baseline": "rolling_npxg_poisson"},
            },
            "bivariate_poisson": {
                "classwise_ece": {"home": 0.04, "draw": 0.05, "away": 0.05},
                "totals": {"2.5": {"ece": 0.07, "brier": 0.25}, "3.5": {"ece": 0.08, "brier": 0.26}},
                "posthoc_calibration": {"available": True},
                "benchmark_comparison": {"strongest_baseline": "rolling_npxg_poisson"},
            },
        },
        "slice_metrics": {
            "rolling_npxg_poisson": {
                "early_season": {"log_loss_1x2": 0.90},
                "later_season": {"log_loss_1x2": 0.86},
                "home_favorite": {"log_loss_1x2": 0.87},
            },
            "dixon_coles": {
                "early_season": {"log_loss_1x2": 0.88},
                "later_season": {"log_loss_1x2": 0.82},
                "home_favorite": {"log_loss_1x2": 0.84},
            },
            "bivariate_poisson": {
                "early_season": {"log_loss_1x2": 1.05},
                "later_season": {"log_loss_1x2": 0.90},
                "home_favorite": {"log_loss_1x2": 0.96},
            },
        },
    }
    dataset_manifest = {
        "history_start_season": 2025,
        "matches": {"season_coverage": [2025, 2026]},
    }

    gate_results = evaluate_go_live_gates(
        training_summary=training_summary,
        backtest_summary=backtest_summary,
        evaluation_summary=evaluation_summary,
        dataset_manifest=dataset_manifest,
    )
    champions = choose_champions(gate_results)

    assert gate_results["dixon_coles"]["passed"] is True
    assert gate_results["bivariate_poisson"]["passed"] is False
    assert champions["aliases"]["champion_pure"]["model_family"] == "dixon_coles"
    assert champions["experimental"] == {}
