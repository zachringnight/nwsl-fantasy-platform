from __future__ import annotations

import pandas as pd
import pytest

from src.backtest.metrics import compute_all_metrics


def test_compute_all_metrics_includes_expected_total_goals_mae_from_lambdas() -> None:
    metrics = compute_all_metrics(
        pd.DataFrame(
            [
                {
                    "prob_home": 0.4,
                    "prob_draw": 0.3,
                    "prob_away": 0.3,
                    "home_goals_90": 2,
                    "away_goals_90": 1,
                    "home_win": 1,
                    "over_2_5": 1,
                    "lambda_home": 1.7,
                    "lambda_away": 1.1,
                },
                {
                    "prob_home": 0.3,
                    "prob_draw": 0.3,
                    "prob_away": 0.4,
                    "home_goals_90": 0,
                    "away_goals_90": 1,
                    "home_win": 0,
                    "over_2_5": 0,
                    "lambda_home": 1.0,
                    "lambda_away": 1.2,
                },
            ]
        )
    )

    assert metrics["expected_total_goals_mae"] == pytest.approx(0.7)
