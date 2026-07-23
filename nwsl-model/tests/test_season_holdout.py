from __future__ import annotations

import pytest
import pandas as pd

from scripts.season_holdout import _holdout_config, _summary_payload, season_split


def test_season_split_uses_prior_season_only_for_training() -> None:
    matches = pd.DataFrame(
        [
            {"match_id": "a", "season": 2025, "match_date": pd.Timestamp("2025-11-01").date()},
            {"match_id": "b", "season": 2026, "match_date": pd.Timestamp("2026-03-14").date()},
        ]
    )

    train, test = season_split(matches, 2025, 2026)

    assert train["match_id"].tolist() == ["a"]
    assert test["match_id"].tolist() == ["b"]


def test_season_split_rejects_leaky_date_order() -> None:
    matches = pd.DataFrame(
        [
            {"match_id": "a", "season": 2025, "match_date": pd.Timestamp("2026-03-15").date()},
            {"match_id": "b", "season": 2026, "match_date": pd.Timestamp("2026-03-14").date()},
        ]
    )

    with pytest.raises(ValueError, match="would leak"):
        season_split(matches, 2025, 2026)


def test_holdout_config_caps_prior_data_at_train_season() -> None:
    config = {"data": {"history_start_season": 2026}, "backtest": {"run_ablations": True}}

    output = _holdout_config(config, 2025, 2026)

    assert output["data"]["history_start_season"] == 2025
    assert output["data"]["history_end_season"] == 2026
    assert output["data"]["prior_history_end_season"] == 2025
    assert output["backtest"]["run_ablations"] is False


def test_summary_payload_keeps_model_list_separate_from_metrics() -> None:
    payload = _summary_payload(
        {
            "dixon_coles": {
                "metrics": {
                    "model": "dixon_coles",
                    "log_loss_1x2": 1.0,
                    "staking_summary": {"n_bets": 1},
                }
            }
        },
        {"models": ["dixon_coles"]},
    )

    assert payload["models"] == ["dixon_coles"]
    assert payload["model_metrics"]["dixon_coles"]["log_loss_1x2"] == 1.0
    assert "staking_summary" not in payload["model_metrics"]["dixon_coles"]
