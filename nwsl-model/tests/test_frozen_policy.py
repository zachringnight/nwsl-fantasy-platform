from __future__ import annotations

import pandas as pd

from src.backtest.frozen_policy import validate_frozen_policy


def _inputs() -> tuple[pd.DataFrame, pd.DataFrame]:
    decisions: list[dict] = []
    predictions: list[dict] = []
    for season, n_rows in ((2025, 40), (2026, 30)):
        for index in range(n_rows):
            match_id = f"{season}-{index}"
            good = index < 30
            win = good
            decisions.append(
                {
                    "match_id": match_id,
                    "match_date": f"{season}-05-{index % 20 + 1:02d}",
                    "market": "total_over_2.5",
                    "side": "over",
                    "line": 2.5,
                    "sportsbook": "OddsPortalAvg",
                    "source_type": "open",
                    "market_price": 1.9,
                    "edge": 0.05 if good else 0.0,
                    "confidence": 0.05 if good else 0.0,
                    "clv": 0.04 if good else -0.01,
                    "reason": "accepted",
                }
            )
            predictions.append(
                {
                    "match_id": match_id,
                    "home_goals_90": 2 if win else 1,
                    "away_goals_90": 1 if win else 0,
                }
            )
    return pd.DataFrame(decisions), pd.DataFrame(predictions)


def test_frozen_policy_thresholds_do_not_depend_on_test_outcomes() -> None:
    decisions, predictions = _inputs()
    kwargs = {
        "policy_id": "test-policy",
        "model_family": "team_ratings_poisson",
        "train_season": 2025,
        "test_season": 2026,
        "market_group": "totals",
        "side": "over",
        "edge_grid": [0.0, 0.01, 0.02, 0.05],
        "confidence_grid": [0.0, 0.03, 0.05],
        "bootstrap_iterations": 200,
        "minimum_test_bets": 10,
    }

    original = validate_frozen_policy(decisions, predictions, **kwargs)
    flipped = predictions.copy()
    test_mask = flipped["match_id"].str.startswith("2026-")
    flipped.loc[test_mask, ["home_goals_90", "away_goals_90"]] = [0, 0]
    changed = validate_frozen_policy(decisions, flipped, **kwargs)

    assert original.summary["thresholds"] == changed.summary["thresholds"]
    assert original.summary["test"]["roi_units"] > changed.summary["test"]["roi_units"]


def test_frozen_policy_exports_one_selected_row_per_test_match() -> None:
    decisions, predictions = _inputs()
    result = validate_frozen_policy(
        decisions,
        predictions,
        policy_id="test-policy",
        model_family="team_ratings_poisson",
        train_season=2025,
        test_season=2026,
        market_group="totals",
        side="over",
        edge_grid=[0.0, 0.01, 0.02, 0.05],
        confidence_grid=[0.0, 0.03, 0.05],
        bootstrap_iterations=200,
        minimum_test_bets=10,
    )

    assert result.summary["odds_source_types"] == ["open"]
    assert result.summary["readiness_checks"]["one_bet_per_test_match"] is True
    assert result.selected_bets["match_id"].nunique() == len(result.selected_bets)
    assert set(result.selected_bets["side"]) == {"over"}
