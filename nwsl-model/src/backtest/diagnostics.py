from __future__ import annotations

from typing import Any


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 6)


def _shortfall(value: float | None, target: float | None) -> float | None:
    if value is None or target is None:
        return None
    return _round6(max(0.0, float(value) - float(target)))


def summarize_gate_blockers(
    promotion_summary: dict[str, Any],
    *,
    relative_improvement: float,
    totals_brier_gate: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for model_name, result in promotion_summary.get("gate_results", {}).items():
        checks = result.get("checks", {})
        metrics = result.get("metrics", {})
        failed = [name for name, passed in checks.items() if not passed]

        best_log_loss = metrics.get("best_baseline_log_loss")
        best_brier = metrics.get("best_baseline_brier")
        best_total_mae = metrics.get("best_baseline_total_goals_mae")
        log_loss_target = None if best_log_loss is None else float(best_log_loss) * relative_improvement
        brier_target = None if best_brier is None else float(best_brier) * relative_improvement

        rows.append(
            {
                "model": model_name,
                "gating_status": result.get("gating_status", "unknown"),
                "failed_checks": ",".join(failed),
                "log_loss_target": _round6(log_loss_target),
                "log_loss_shortfall": _shortfall(metrics.get("log_loss_1x2"), log_loss_target),
                "brier_target": _round6(brier_target),
                "brier_shortfall": _shortfall(metrics.get("brier_score_1x2"), brier_target),
                "totals_brier_2_5_target": _round6(totals_brier_gate),
                "totals_brier_2_5_shortfall": _shortfall(metrics.get("totals_brier_2.5"), totals_brier_gate),
                "total_goals_mae_target": _round6(best_total_mae),
                "total_goals_mae_shortfall": _shortfall(metrics.get("expected_total_goals_mae"), best_total_mae),
            }
        )
    return rows
