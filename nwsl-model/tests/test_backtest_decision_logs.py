from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.backtest.reports import generate_backtest_report


def test_backtest_report_writes_candidate_decision_logs(tmp_path: Path) -> None:
    results = {
        "dixon_coles": {
            "metrics": {"log_loss_1x2": 1.01, "roi": 0.0},
            "predictions": pd.DataFrame(
                [
                    {
                        "match_id": "m1",
                        "home_goals_90": 1,
                        "away_goals_90": 0,
                        "prob_home": 0.5,
                        "prob_draw": 0.25,
                        "prob_away": 0.25,
                    }
                ]
            ),
            "bet_log": pd.DataFrame(),
            "decision_log": pd.DataFrame(
                [
                    {
                        "match_id": "m1",
                        "market": "1x2_home",
                        "side": "home",
                        "accepted": False,
                        "reason": "edge_below_threshold",
                    }
                ]
            ),
        }
    }

    generate_backtest_report(results, tmp_path)

    decision_path = tmp_path / "decision_log_dixon_coles.csv"
    assert decision_path.exists()
    written = pd.read_csv(decision_path)
    assert written.loc[0, "reason"] == "edge_below_threshold"
