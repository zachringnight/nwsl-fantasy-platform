from __future__ import annotations

import pandas as pd
import pytest

from scripts.evaluate import _summarize_launch_totals


def test_summarize_launch_totals_reports_directional_over_bias() -> None:
    preds = pd.DataFrame(
        {
            "main_total_line": [2.5, 2.5, 2.5, 2.5],
            "prob_over_main_total": [0.40, 0.45, 0.50, 0.45],
            "main_total_over_actual": [1, 1, 0, 1],
        }
    )

    summary = _summarize_launch_totals(preds)

    assert summary["n"] == 4
    assert summary["mean_predicted_over_probability"] == pytest.approx(0.45)
    assert summary["actual_over_rate"] == pytest.approx(0.75)
    assert summary["over_probability_bias"] == pytest.approx(0.30)
    assert summary["bias_direction"] == "underprices_overs"
    assert summary["recommended_action"] == "suppress_totals_until_recalibrated"
