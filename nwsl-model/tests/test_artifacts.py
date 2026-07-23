from __future__ import annotations

import os
from pathlib import Path

import pytest

from src.utils.artifacts import (
    available_model_names,
    create_version_dir,
    latest_version_dir,
    resolve_model_artifact,
    save_champion_registry,
)
from src.utils.gating import (
    choose_champions,
    evaluate_baseline_go_live_gates,
    evaluate_go_live_gates,
)


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


def test_latest_version_dir_prefers_newest_artifact_run_over_lexicographic_name(tmp_path: Path) -> None:
    artifact_root = tmp_path / "models"
    older = create_version_dir("pure-projection-2025plus-v3", artifact_root)
    newer = create_version_dir("20260525T220000Z", artifact_root)
    os.utime(older, (1, 1))
    os.utime(newer, (2, 2))

    assert latest_version_dir(artifact_root) == newer


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


def _baseline_summary() -> dict:
    return {
        "uniform_baseline": {"log_loss_1x2": 1.20, "brier_score_1x2": 0.72, "expected_total_goals_mae": 1.05},
        "spi_lite_baseline": {"log_loss_1x2": 1.00, "brier_score_1x2": 0.60, "expected_total_goals_mae": 1.10},
    }


def test_gate_uses_oof_calibrated_metric_not_raw_or_in_sample() -> None:
    # The raw model loses to the baseline; in-sample calibration appears to win,
    # but the honest out-of-fold calibration still loses. The gate must credit
    # the OOF number, so beats_best_baseline must be False.
    backtest_summary = {
        "models": {
            **_baseline_summary(),
            "dixon_coles": {"log_loss_1x2": 1.08, "brier_score_1x2": 0.65, "expected_total_goals_mae": 1.12},
        }
    }
    evaluation_summary = {
        "models": {
            "dixon_coles": {
                "classwise_ece": {"home": 0.02, "draw": 0.03, "away": 0.04},
                "totals": {"2.5": {"ece": 0.03, "brier": 0.20}, "3.5": {"ece": 0.04, "brier": 0.21}},
                "posthoc_calibration": {
                    "available": True,
                    "multiclass_log_loss_after": 0.95,
                    "multiclass_brier_after": 0.58,
                    "multiclass_log_loss_after_oof": 1.04,
                    "multiclass_brier_after_oof": 0.63,
                },
                "benchmark_comparison": {"strongest_baseline": "spi_lite_baseline"},
            },
        },
        "slice_metrics": {},
    }
    dataset_manifest = {"history_start_season": 2025, "matches": {"season_coverage": [2025, 2026]}}

    gate_results = evaluate_go_live_gates(
        training_summary={"models": {"dixon_coles": {"converged": True}}},
        backtest_summary=backtest_summary,
        evaluation_summary=evaluation_summary,
        dataset_manifest=dataset_manifest,
    )

    checks = gate_results["dixon_coles"]["checks"]
    assert checks["beats_best_baseline_log_loss"] is False
    assert checks["beats_best_baseline_brier"] is False


def test_gate_credits_oof_calibration_that_genuinely_beats_baseline() -> None:
    # Raw model loses to the baseline, but honest OOF calibration genuinely
    # beats it; the gate should credit that real generalization improvement.
    backtest_summary = {
        "models": {
            **_baseline_summary(),
            "dixon_coles": {"log_loss_1x2": 1.08, "brier_score_1x2": 0.65, "expected_total_goals_mae": 1.12},
        }
    }
    evaluation_summary = {
        "models": {
            "dixon_coles": {
                "classwise_ece": {"home": 0.02, "draw": 0.03, "away": 0.04},
                "totals": {"2.5": {"ece": 0.03, "brier": 0.20}, "3.5": {"ece": 0.04, "brier": 0.21}},
                "posthoc_calibration": {
                    "available": True,
                    "multiclass_log_loss_after_oof": 0.93,
                    "multiclass_brier_after_oof": 0.55,
                },
                "benchmark_comparison": {"strongest_baseline": "spi_lite_baseline"},
            },
        },
        "slice_metrics": {},
    }
    dataset_manifest = {"history_start_season": 2025, "matches": {"season_coverage": [2025, 2026]}}

    gate_results = evaluate_go_live_gates(
        training_summary={"models": {"dixon_coles": {"converged": True}}},
        backtest_summary=backtest_summary,
        evaluation_summary=evaluation_summary,
        dataset_manifest=dataset_manifest,
    )

    checks = gate_results["dixon_coles"]["checks"]
    assert checks["beats_best_baseline_log_loss"] is True
    assert checks["beats_best_baseline_brier"] is True


def _baseline_backtest_summary() -> dict:
    return {
        "models": {
            "home_field_baseline": {"log_loss_1x2": 1.05, "brier_score_1x2": 0.62},
            "spi_lite_baseline": {"log_loss_1x2": 0.97, "brier_score_1x2": 0.58},
        }
    }


def _baseline_evaluation_summary(*, spi_lite_ece: float = 0.03) -> dict:
    return {
        "models": {
            "home_field_baseline": {
                "classwise_ece": {"home": 0.04, "draw": 0.04, "away": 0.04},
                "posthoc_calibration": {"available": True, "multiclass_log_loss_after_oof": 1.02},
            },
            "spi_lite_baseline": {
                "classwise_ece": {"home": spi_lite_ece, "draw": spi_lite_ece, "away": spi_lite_ece},
                "posthoc_calibration": {"available": True, "multiclass_log_loss_after_oof": 0.94},
            },
        }
    }


def _dataset_manifest() -> dict:
    return {"history_start_season": 2025, "matches": {"season_coverage": [2025, 2026]}}


def _passing_oos_summary(model: str = "spi_lite_baseline") -> dict:
    return {
        "version": "v-test",
        "model": model,
        "oos": {
            "moneyline": {
                "n_bets": 60,
                "pnl_units": 4.0,
                "roi_units": 0.08,
                "hit_rate": 0.55,
                "n_blocks_tuned": 8,
                "n_blocks_fallback": 1,
            },
            "totals": {"n_bets": 0, "pnl_units": 0.0, "roi_units": 0.0, "hit_rate": 0.0, "n_blocks_tuned": 0, "n_blocks_fallback": 0},
        },
        "recommended": {},
        "metadata": {"evidence_missing": False},
    }


def test_evaluate_baseline_go_live_gates_fails_closed_when_oos_evidence_missing() -> None:
    result = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(),
        dataset_manifest=_dataset_manifest(),
        oos_summary=None,
    )

    assert result["passed"] is False
    assert result["evidence_missing"] is True
    assert result["model"] == "spi_lite_baseline"
    assert "evidence_caveat" in result and result["evidence_caveat"]


def test_evaluate_baseline_go_live_gates_passes_with_strong_oos_evidence() -> None:
    result = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(),
        dataset_manifest=_dataset_manifest(),
        oos_summary=_passing_oos_summary(),
    )

    assert result["passed"] is True
    assert result["gating_status"] == "passed"
    assert result["evidence_missing"] is False
    assert result["model"] == "spi_lite_baseline"
    assert "evidence_caveat" in result and result["evidence_caveat"]


@pytest.mark.parametrize(
    ("mutation", "field"),
    [
        (lambda oos: oos["oos"]["moneyline"].__setitem__("n_blocks_tuned", 4), "n_blocks_tuned"),
        (lambda oos: oos["oos"]["moneyline"].__setitem__("n_bets", 49), "n_bets"),
        (lambda oos: oos["oos"]["moneyline"].__setitem__("roi_units", 0.04), "roi_units"),
    ],
)
def test_evaluate_baseline_go_live_gates_fails_below_raised_oos_thresholds(mutation, field) -> None:
    oos_summary = _passing_oos_summary()
    mutation(oos_summary)

    result = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(),
        dataset_manifest=_dataset_manifest(),
        oos_summary=oos_summary,
    )

    assert result["passed"] is False, field
    assert result["evidence_caveat"]


def test_evaluate_baseline_go_live_gates_fails_when_ece_too_high() -> None:
    result = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(spi_lite_ece=0.10),
        dataset_manifest=_dataset_manifest(),
        oos_summary=_passing_oos_summary(),
    )

    assert result["passed"] is False
    assert result["checks"]["classwise_ece_ok"] is False


def test_evaluate_baseline_go_live_gates_fails_when_oos_evidence_targets_a_different_model() -> None:
    # OOS evidence was produced for a baseline that is no longer the strongest
    # one on refreshed data; the gate must not credit stale evidence.
    result = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(),
        dataset_manifest=_dataset_manifest(),
        oos_summary=_passing_oos_summary(model="home_field_baseline"),
    )

    assert result["passed"] is False
    assert result["checks"]["is_strongest_baseline"] is False


def test_evaluate_baseline_go_live_gates_evidence_caveat_present_regardless_of_pass_fail() -> None:
    expected_caveat = (
        "OOS ROI measured on close-time, uncalibrated backtest odds; live picks run on "
        "current, calibrated odds and current gating — this evidence does not directly transfer"
    )
    failing = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(),
        dataset_manifest=_dataset_manifest(),
        oos_summary=None,
    )
    passing = evaluate_baseline_go_live_gates(
        backtest_summary=_baseline_backtest_summary(),
        evaluation_summary=_baseline_evaluation_summary(),
        dataset_manifest=_dataset_manifest(),
        oos_summary=_passing_oos_summary(),
    )

    assert failing["evidence_caveat"] == expected_caveat
    assert passing["evidence_caveat"] == expected_caveat


def test_resolve_model_artifact_promoted_baseline_alias_is_kind_baseline_promoted(tmp_path: Path) -> None:
    artifact_root = tmp_path / "models"
    create_version_dir("v-test", artifact_root)
    save_champion_registry(
        {
            "aliases": {
                "champion_pure": {
                    "version": "v-test",
                    "model_family": "spi_lite_baseline",
                    "blended": False,
                    "gating_status": "passed",
                    "mode": "baseline",
                }
            },
            "experimental": {},
        },
        artifact_root,
    )

    # No spi_lite_baseline_model.pkl was ever written for this version. If
    # resolve_model_artifact tried to load one, this would raise.
    artifact = resolve_model_artifact("champion_pure", artifact_root)

    assert artifact["model_family"] == "spi_lite_baseline"
    assert artifact["kind"] == "baseline_promoted"


def test_choose_champions_records_baseline_champion_only_when_no_pure_passes() -> None:
    passing_baseline_gate = {
        "model": "spi_lite_baseline",
        "passed": True,
        "gating_status": "passed",
        "evidence_missing": False,
        "evidence_caveat": "caveat-text",
        "checks": {},
        "metrics": {},
    }

    # No pure candidates passed -> baseline champion recorded.
    champions_no_pure = choose_champions({}, passing_baseline_gate)
    assert champions_no_pure["aliases"]["champion_pure"] == {
        "model_family": "spi_lite_baseline",
        "blended": False,
        "gating_status": "passed",
        "mode": "baseline",
        "evidence_caveat": "caveat-text",
    }

    # A passing pure candidate always outranks a passing baseline.
    pure_gate_results = {
        "dixon_coles": {
            "passed": True,
            "metrics": {"log_loss_1x2": 0.80},
        }
    }
    champions_with_pure = choose_champions(pure_gate_results, passing_baseline_gate)
    assert champions_with_pure["aliases"]["champion_pure"]["model_family"] == "dixon_coles"
    assert champions_with_pure["aliases"]["champion_pure"]["mode"] == "pure_projection"

    # A failing baseline gate never gets promoted.
    failing_baseline_gate = dict(passing_baseline_gate, passed=False, gating_status="research_only")
    champions_failed_baseline = choose_champions({}, failing_baseline_gate)
    assert champions_failed_baseline["aliases"] == {}
