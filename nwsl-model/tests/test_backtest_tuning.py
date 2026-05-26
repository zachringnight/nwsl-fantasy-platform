import pandas as pd

from src.backtest.tuning import rank_tuning_results


def test_rank_tuning_results_prefers_lower_log_loss_then_lower_brier() -> None:
    results = pd.DataFrame(
        [
            {"candidate": "reg_1000", "log_loss_1x2": 1.09, "brier_score_1x2": 0.66},
            {"candidate": "reg_2000", "log_loss_1x2": 1.08, "brier_score_1x2": 0.655},
            {"candidate": "reg_3000", "log_loss_1x2": 1.08, "brier_score_1x2": 0.650},
        ]
    )

    ranked = rank_tuning_results(results)

    assert ranked["candidate"].tolist() == ["reg_3000", "reg_2000", "reg_1000"]
