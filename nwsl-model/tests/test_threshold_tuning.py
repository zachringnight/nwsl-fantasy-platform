from __future__ import annotations

import json

import pandas as pd

from src.backtest.threshold_tuning import (
    DEFAULT_BASE_THRESHOLDS,
    run_nested_threshold_tuning,
)

EDGE_GRID = [0.0, 0.05]
CONFIDENCE_GRID = [0.0, 0.05]


def _decision(match_id, market_date, *, edge, confidence, price, side="home", market="1x2_home"):
    return {
        "match_id": match_id,
        "market": market,
        "side": side,
        "line": None,
        "market_price": price,
        "edge": edge,
        "confidence": confidence,
        "match_date": market_date,
    }


def _prediction(match_id, home_goals, away_goals):
    return {"match_id": match_id, "home_goals_90": home_goals, "away_goals_90": away_goals}


def _base_fixture():
    """3-block fixture (day1/day2/day3), hand-computable by construction.

    day1 (block b0): 6 moneyline candidates, no prior history -> fallback.
    day2 (block b1): history = day1 only -> tunes to (min_edge=0.05, min_confidence=0.0).
    day3 (block b2): history = day1+day2 -> tunes to (min_edge=0.0, min_confidence=0.0).
    """
    decisions = [
        # day1
        _decision("m1", "2026-01-01", edge=0.06, confidence=0.06, price=2.0),
        _decision("m2", "2026-01-01", edge=0.06, confidence=0.06, price=2.0),
        _decision("m3", "2026-01-01", edge=0.02, confidence=0.02, price=1.5),
        _decision("m4", "2026-01-01", edge=0.02, confidence=0.02, price=1.5),
        _decision("m5", "2026-01-01", edge=0.06, confidence=0.02, price=1.8),
        _decision("m6", "2026-01-01", edge=0.02, confidence=0.06, price=1.2),
        # day2
        _decision("d2_1", "2026-01-02", edge=0.06, confidence=0.01, price=2.5),
        _decision("d2_2", "2026-01-02", edge=0.06, confidence=0.01, price=1.9),
        _decision("d2_3", "2026-01-02", edge=0.02, confidence=0.09, price=3.0),
        _decision("d2_4", "2026-01-02", edge=0.08, confidence=0.0, price=2.0),
        # day3
        _decision("e3_1", "2026-01-03", edge=0.01, confidence=0.01, price=2.2),
        _decision("e3_2", "2026-01-03", edge=0.09, confidence=0.09, price=1.7),
        _decision("e3_3", "2026-01-03", edge=0.0, confidence=0.0, price=3.0),
    ]
    predictions = [
        _prediction("m1", 1, 0),  # win
        _prediction("m2", 0, 1),  # loss
        _prediction("m3", 1, 0),  # win
        _prediction("m4", 1, 0),  # win
        _prediction("m5", 1, 0),  # win
        _prediction("m6", 0, 1),  # loss
        _prediction("d2_1", 1, 0),  # win
        _prediction("d2_2", 0, 1),  # loss
        _prediction("d2_3", 1, 0),  # win (excluded by day2's chosen cell)
        _prediction("d2_4", 1, 0),  # win
        _prediction("e3_1", 1, 1),  # draw -> home side loses
        _prediction("e3_2", 2, 0),  # win
        _prediction("e3_3", 0, 2),  # loss
    ]
    return pd.DataFrame(decisions), pd.DataFrame(predictions)


def _run(decisions, predictions, **overrides):
    kwargs = dict(
        edge_grid=EDGE_GRID,
        confidence_grid=CONFIDENCE_GRID,
        min_bets_per_cell=2,
        min_history_bets=4,
        rank_metric="roi_units",
    )
    kwargs.update(overrides)
    return run_nested_threshold_tuning(decisions, predictions, **kwargs)


def test_no_lookahead_early_blocks_unaffected_by_future_mutation():
    decisions_a, predictions_a = _base_fixture()
    result_a = _run(decisions_a, predictions_a)

    # Scramble ONLY the future (day3) rows: different prices/edges/results
    # that would blow up any cell if it leaked into earlier selections.
    decisions_b, predictions_b = _base_fixture()
    day3_mask = decisions_b["match_date"] == "2026-01-03"
    decisions_b.loc[day3_mask, "market_price"] = 9.5
    decisions_b.loc[day3_mask, "edge"] = 0.5
    decisions_b.loc[day3_mask, "confidence"] = 0.5
    predictions_b.loc[predictions_b["match_id"].isin(["e3_1", "e3_2", "e3_3"]), "home_goals_90"] = 5
    predictions_b.loc[predictions_b["match_id"].isin(["e3_1", "e3_2", "e3_3"]), "away_goals_90"] = 0

    result_b = _run(decisions_b, predictions_b)

    curve_a = result_a.oos_curve
    curve_b = result_b.oos_curve

    early_a = curve_a[curve_a["block"] != "2026-01-03"].reset_index(drop=True)
    early_b = curve_b[curve_b["block"] != "2026-01-03"].reset_index(drop=True)

    pd.testing.assert_frame_equal(early_a, early_b)

    # Run A again with a second independent scramble to double-check.
    decisions_c, predictions_c = _base_fixture()
    decisions_c.loc[decisions_c["match_date"] == "2026-01-03", "market_price"] = 1.01
    predictions_c.loc[predictions_c["match_id"].isin(["e3_1", "e3_2", "e3_3"]), "home_goals_90"] = 0
    predictions_c.loc[predictions_c["match_id"].isin(["e3_1", "e3_2", "e3_3"]), "away_goals_90"] = 9
    result_c = _run(decisions_c, predictions_c)
    early_c = result_c.oos_curve[result_c.oos_curve["block"] != "2026-01-03"].reset_index(drop=True)
    pd.testing.assert_frame_equal(early_a, early_c)


def test_min_history_bets_guardrail_uses_fallback():
    # Sparse history: only 2 settled candidates on day1 (< min_history_bets=4).
    decisions = pd.DataFrame(
        [
            _decision("s1", "2026-02-01", edge=0.20, confidence=0.20, price=5.0),
            _decision("s2", "2026-02-01", edge=0.20, confidence=0.20, price=5.0),
            _decision("s3", "2026-02-02", edge=0.01, confidence=0.01, price=1.5),
        ]
    )
    predictions = pd.DataFrame(
        [
            _prediction("s1", 1, 0),
            _prediction("s2", 1, 0),
            _prediction("s3", 1, 0),
        ]
    )
    result = _run(decisions, predictions, min_history_bets=4, min_bets_per_cell=1)
    block2 = result.oos_curve[
        (result.oos_curve["block"] == "2026-02-02") & (result.oos_curve["market_group"] == "moneyline")
    ]
    assert len(block2) == 1
    row = block2.iloc[0]
    assert row["source"] == "fallback"
    assert row["chosen_min_edge"] == DEFAULT_BASE_THRESHOLDS["moneyline"]["min_edge"]
    assert row["chosen_min_confidence"] == DEFAULT_BASE_THRESHOLDS["moneyline"]["min_confidence"]


def test_oos_accumulation_matches_hand_computed_values():
    decisions, predictions = _base_fixture()
    result = _run(decisions, predictions)

    moneyline_curve = result.oos_curve[result.oos_curve["market_group"] == "moneyline"].set_index("block")

    # day1: no history -> fallback (0.03 / 0.05); only m1, m2 clear both gates.
    row1 = moneyline_curve.loc["2026-01-01"]
    assert row1["source"] == "fallback"
    assert row1["chosen_min_edge"] == 0.03
    assert row1["chosen_min_confidence"] == 0.05
    assert row1["n_bets"] == 2
    assert row1["pnl_units"] == 0.0

    # day2: history = day1 (6 rows) -> tunes to (0.05, 0.0).
    row2 = moneyline_curve.loc["2026-01-02"]
    assert row2["source"] == "tuned"
    assert row2["chosen_min_edge"] == 0.05
    assert row2["chosen_min_confidence"] == 0.0
    assert row2["n_bets"] == 3
    assert row2["pnl_units"] == 1.5

    # day3: history = day1+day2 (10 rows) -> tunes to (0.0, 0.0).
    row3 = moneyline_curve.loc["2026-01-03"]
    assert row3["source"] == "tuned"
    assert row3["chosen_min_edge"] == 0.0
    assert row3["chosen_min_confidence"] == 0.0
    assert row3["n_bets"] == 3
    assert abs(row3["pnl_units"] - (-1.3)) < 1e-9

    summary = result.oos_summary["moneyline"]
    assert summary["n_bets"] == 8
    assert abs(summary["pnl_units"] - 0.2) < 1e-9
    assert abs(summary["roi_units"] - (0.2 / 8)) < 1e-9
    assert summary["n_blocks_tuned"] == 2
    assert summary["n_blocks_fallback"] == 1


def test_recommended_shape_matches_market_rules_fragment_and_json_roundtrips():
    decisions, predictions = _base_fixture()
    result = _run(decisions, predictions)

    assert set(result.recommended["moneyline"].keys()) == {"min_edge", "min_confidence"}
    assert set(result.recommended["totals"].keys()) == {"min_edge", "min_confidence"}
    assert "global_min_edge_note" in result.recommended
    assert isinstance(result.recommended["global_min_edge_note"], str)

    payload = {
        "version": "v_test",
        "model": "spi_lite_baseline",
        "oos": result.oos_summary,
        "recommended": result.recommended,
        "metadata": result.metadata,
    }
    dumped = json.dumps(payload)
    reloaded = json.loads(dumped)
    assert reloaded["recommended"]["moneyline"]["min_edge"] == result.recommended["moneyline"]["min_edge"]
    assert reloaded["oos"]["moneyline"]["n_bets"] == result.oos_summary["moneyline"]["n_bets"]
    assert reloaded["metadata"]["evidence_missing"] is False


def test_empty_input_contract_returns_cleanly_without_raising():
    result = run_nested_threshold_tuning(
        decisions=pd.DataFrame(),
        predictions=pd.DataFrame(),
        edge_grid=EDGE_GRID,
        confidence_grid=CONFIDENCE_GRID,
    )
    assert result.metadata["evidence_missing"] is True
    assert result.oos_curve.empty
    for group in ("moneyline", "totals"):
        summary = result.oos_summary[group]
        assert summary == {
            "n_bets": 0,
            "pnl_units": 0.0,
            "roi_units": 0.0,
            "hit_rate": 0.0,
            "n_blocks_tuned": 0,
            "n_blocks_fallback": 0,
        }
    assert result.recommended == {
        group: dict(values) for group, values in DEFAULT_BASE_THRESHOLDS.items()
    }


def test_empty_input_contract_missing_match_date_column():
    decisions = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "market": "1x2_home",
                "side": "home",
                "line": None,
                "market_price": 2.0,
                "edge": 0.1,
                "confidence": 0.1,
            }
        ]
    )
    predictions = pd.DataFrame([_prediction("m1", 1, 0)])
    result = run_nested_threshold_tuning(
        decisions=decisions,
        predictions=predictions,
        edge_grid=EDGE_GRID,
        confidence_grid=CONFIDENCE_GRID,
    )
    assert result.metadata["evidence_missing"] is True
    assert result.oos_curve.empty
