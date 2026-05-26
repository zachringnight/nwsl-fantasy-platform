from src.backtest.diagnostics import summarize_gate_blockers


def test_summarize_gate_blockers_reports_target_shortfalls() -> None:
    promotion = {
        "gate_results": {
            "dixon_coles": {
                "gating_status": "research_only",
                "checks": {
                    "beats_best_baseline_log_loss": False,
                    "totals_brier_ok": False,
                },
                "metrics": {
                    "log_loss_1x2": 1.0815,
                    "best_baseline_log_loss": 1.0905,
                    "brier_score_1x2": 0.6549,
                    "best_baseline_brier": 0.6608,
                    "totals_brier_2.5": 0.2505,
                    "expected_total_goals_mae": 1.2634,
                    "best_baseline_total_goals_mae": 1.2612,
                },
            }
        }
    }

    rows = summarize_gate_blockers(promotion, relative_improvement=0.98, totals_brier_gate=0.24)

    assert rows == [
        {
            "model": "dixon_coles",
            "gating_status": "research_only",
            "failed_checks": "beats_best_baseline_log_loss,totals_brier_ok",
            "log_loss_target": 1.06869,
            "log_loss_shortfall": 0.01281,
            "brier_target": 0.647584,
            "brier_shortfall": 0.007316,
            "totals_brier_2_5_target": 0.24,
            "totals_brier_2_5_shortfall": 0.0105,
            "total_goals_mae_target": 1.2612,
            "total_goals_mae_shortfall": 0.0022,
        }
    ]
