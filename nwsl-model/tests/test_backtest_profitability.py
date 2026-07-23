from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

import pandas as pd
import pytest

from src.backtest.runner import BacktestRunner
from src.betting.recommendations import evaluate_market_candidates, load_bet_selection_config
from src.betting.staking import StakingConfig, StakingEngine


def test_backtest_settles_moneyline_and_total_bets_when_prices_exist() -> None:
    runner = BacktestRunner(
        {
            "betting": {
                "min_edge": 0.01,
                "min_confidence": 0.01,
                "max_stake_pct": 0.01,
                "max_slate_exposure_pct": 0.05,
                "starting_bankroll": 10000.0,
            },
            "odds_provider": {"stale_line_minutes": 180},
        }
    )
    staker = StakingEngine(
        StakingConfig(
            min_edge=0.01,
            max_stake_pct=0.01,
            max_slate_exposure_pct=0.05,
            bankroll=10000.0,
        )
    )
    markets = SimpleNamespace(
        home_prob=0.80,
        draw_prob=0.10,
        away_prob=0.10,
        over_probs={2.5: 0.70},
        under_probs={2.5: 0.30},
    )
    odds_rows = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-04-01T00:00:00+00:00",
                "sportsbook": "DraftKings",
                "source_type": "close",
                "market_type": "1x2",
                "home_odds": 1.50,
                "draw_odds": 8.00,
                "away_odds": 9.00,
                "line": None,
                "over_odds": None,
                "under_odds": None,
            },
            {
                "match_id": "m1",
                "timestamp": "2026-04-01T00:00:00+00:00",
                "sportsbook": "DraftKings",
                "source_type": "close",
                "market_type": "total",
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "line": 2.5,
                "over_odds": 1.80,
                "under_odds": 2.10,
            },
        ]
    )

    runner._generate_and_settle_bets(
        row=pd.Series(
            {
                "match_id": "m1",
                "match_date": date(2026, 4, 1),
                "home_goals_90": 2,
                "away_goals_90": 1,
            }
        ),
        pred=None,
        markets=markets,
        odds_rows=odds_rows,
        staker=staker,
        model_name="dixon_coles",
    )

    bet_log = staker.get_bet_log_df()
    decision_log = staker.get_decision_log_df()
    assert set(bet_log["market"]) == {"1x2_home", "total_over_2.5"}
    assert set(bet_log["sportsbook"]) == {"DraftKings"}
    assert set(bet_log["model_family"]) == {"dixon_coles"}
    assert set(bet_log["gating_status"]) == {"passed"}
    assert set(decision_log["market"]).issuperset({"1x2_home", "total_over_2.5"})
    assert (bet_log["pnl"] > 0).all()

    diagnostics = runner._market_betting_diagnostics(
        predictions=pd.DataFrame([{"match_id": "m1"}]),
        odds=odds_rows,
        bet_log=bet_log,
        decision_log=decision_log,
    )
    assert diagnostics["moneyline_candidate_count"] == 3
    assert diagnostics["totals_candidate_count"] == 2
    assert diagnostics["moneyline_n_bets"] == 1
    assert diagnostics["totals_n_bets"] == 1
    assert diagnostics["totals_over_candidate_count"] == 1
    assert diagnostics["totals_over_n_bets"] == 1
    assert diagnostics["totals_under_candidate_count"] == 1
    assert diagnostics["totals_under_n_bets"] == 0
    assert diagnostics["moneyline_home_candidate_count"] == 1
    assert diagnostics["moneyline_home_n_bets"] == 1
    assert diagnostics["moneyline_draw_candidate_count"] == 1
    assert diagnostics["moneyline_draw_n_bets"] == 0
    assert diagnostics["moneyline_away_candidate_count"] == 1
    assert diagnostics["moneyline_away_n_bets"] == 0


def test_total_candidate_accepts_raw_line_column_from_odds_file() -> None:
    staker = StakingEngine(
        StakingConfig(
            min_edge=0.01,
            max_stake_pct=0.01,
            max_slate_exposure_pct=0.05,
            bankroll=10000.0,
        )
    )
    decisions = evaluate_market_candidates(
        match_id="m1",
        slate_key="2026-04-01",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "m1",
                    "timestamp": "2026-04-01T00:00:00+00:00",
                    "sportsbook": "DraftKings",
                    "source_type": "close",
                    "market_type": "total",
                    "line": 2.5,
                    "over_odds": 1.80,
                    "under_odds": 2.10,
                }
            ]
        ),
        markets=SimpleNamespace(
            home_prob=0.33,
            draw_prob=0.34,
            away_prob=0.33,
            over_probs={2.5: 0.70},
            under_probs={2.5: 0.30},
        ),
        staker=staker,
        selection=load_bet_selection_config(
            {
                "betting": {"min_edge": 0.01, "min_confidence": 0.01},
                "odds_provider": {"stale_line_minutes": 180},
            }
        ),
        now=pd.Timestamp("2026-04-01T00:00:00+00:00").to_pydatetime(),
        gating_status="passed",
    )

    accepted = [decision for decision in decisions if decision.accepted]
    assert [decision.market for decision in accepted] == ["total_over_2.5"]


def _synthetic_baseline_matches(weeks: int = 5) -> pd.DataFrame:
    """Deterministic matches used to regression-test baseline bet settlement.

    Alpha FC crushes Beta FC every week (builds a strong home-side rating so a
    generously priced home_odds produces an unambiguous positive-edge bet),
    while Beta FC and Gamma FC draw every week (builds genuine model-vs-market
    disagreement on the draw/away sides).
    """
    records: list[dict] = []
    base_date = date(2025, 3, 1)
    match_id = 0
    for week in range(weeks):
        records.append(
            {
                "match_id": f"m{match_id:03d}",
                "match_date": base_date + timedelta(days=week * 7),
                "season": 2025,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Alpha FC",
                "away_team": "Beta FC",
                "home_goals_90": 3,
                "away_goals_90": 0,
                "home_npxg": 2.6,
                "away_npxg": 0.4,
                "home_xg": 2.6,
                "away_xg": 0.4,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            }
        )
        match_id += 1
        records.append(
            {
                "match_id": f"m{match_id:03d}",
                "match_date": base_date + timedelta(days=week * 7 + 1),
                "season": 2025,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Beta FC",
                "away_team": "Gamma FC",
                "home_goals_90": 1,
                "away_goals_90": 1,
                "home_npxg": 1.0,
                "away_npxg": 1.0,
                "home_xg": 1.0,
                "away_xg": 1.0,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            }
        )
        match_id += 1
    return pd.DataFrame(records)


def _moneyline_odds_for(matches: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": row["match_id"],
                "timestamp": pd.Timestamp(row["match_date"]).isoformat(),
                "sportsbook": "test_book",
                "market_type": "1x2",
                "home_odds": 3.0,
                "draw_odds": 4.0,
                "away_odds": 15.0,
                "line": None,
                "over_odds": None,
                "under_odds": None,
                "source_type": "close",
            }
            for _, row in matches.iterrows()
        ]
    )


def _total_odds_for(matches: pd.DataFrame, line: float = 2.5) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": row["match_id"],
                "timestamp": pd.Timestamp(row["match_date"]).isoformat(),
                "sportsbook": "test_book",
                "market_type": "total",
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "line": line,
                "over_odds": 1.9,
                "under_odds": 1.9,
                "source_type": "close",
            }
            for _, row in matches.iterrows()
        ]
    )


def _baseline_backtest_config() -> dict:
    return {
        "betting": {
            "min_edge": 0.01,
            "min_confidence": 0.01,
            "max_stake_pct": 0.01,
            "max_slate_exposure_pct": 0.05,
            "starting_bankroll": 10000.0,
            "markets": ["1x2", "total"],
        },
        "odds_provider": {"stale_line_minutes": 100000},
        "backtest": {"min_train_matches": 8, "step_size": 4, "run_ablations": False, "benchmarks": []},
        "model": {"max_goals": 8},
    }


def test_spi_lite_baseline_backtest_settles_bets_via_full_run() -> None:
    """spi_lite_baseline previously never settled bets in BacktestRunner.run():
    _evaluate_baseline_fold had no staker parameter and never called
    _generate_and_settle_bets. This is the critical-bug regression guard."""
    matches = _synthetic_baseline_matches()
    odds = _moneyline_odds_for(matches)

    runner = BacktestRunner(_baseline_backtest_config())
    results = runner.run(matches, odds=odds, models_to_run=["spi_lite_baseline"])

    assert "spi_lite_baseline" in results
    decision_log = results["spi_lite_baseline"]["decision_log"]
    bet_log = results["spi_lite_baseline"]["bet_log"]

    # evaluate_market_candidates must actually have been invoked.
    assert not decision_log.empty
    # With these deliberately mispriced odds, at least one bet must be
    # accepted and settled, not merely evaluated (a real settlement check).
    assert not bet_log.empty
    assert (bet_log["pnl"] != 0).all()
    assert results["spi_lite_baseline"]["metrics"].get("n_bets", 0) > 0


def test_baseline_predictions_include_main_total_columns() -> None:
    """_prediction_row_from_markets previously never added the main_total_*
    block that the pure-model path has, so baseline predictions (and by
    extension packet 09's totals model) had zero total-market columns."""
    matches = _synthetic_baseline_matches()
    odds = _total_odds_for(matches)

    runner = BacktestRunner(_baseline_backtest_config())
    results = runner.run(matches, odds=odds, models_to_run=["home_field_baseline"])

    predictions = results["home_field_baseline"]["predictions"]
    assert "main_total_line" in predictions.columns
    assert predictions["main_total_line"].notna().all()
    assert predictions["main_total_line"].eq(2.5).all()
    assert "main_total_over_actual" in predictions.columns
    assert "prob_over_main_total" in predictions.columns


def test_baseline_betting_uses_the_same_probabilities_it_reports() -> None:
    """uniform_baseline and home_field_baseline set probs_override to values
    NOT derived from the raw independent-Poisson matrix (a flat 1/3 split,
    and the empirical historical W/D/L rate, respectively). Before the
    matrix-rescale fix, `markets` (used for betting edge/EV/settlement) was
    derived straight from that raw matrix while predictions.prob_home/
    draw/away reported probs_override instead -- silently scoring log-loss
    against one forecast and profitability against a different one."""
    matches = _synthetic_baseline_matches()
    odds = _moneyline_odds_for(matches)

    for model_name in ("uniform_baseline", "home_field_baseline"):
        runner = BacktestRunner(_baseline_backtest_config())
        results = runner.run(matches, odds=odds, models_to_run=[model_name])

        predictions = results[model_name]["predictions"].set_index("match_id")
        decision_log = results[model_name]["decision_log"]
        moneyline_decisions = decision_log[decision_log["market"].str.startswith("1x2_")]
        assert not moneyline_decisions.empty, f"{model_name}: expected settled moneyline candidates"

        side_to_column = {"home": "prob_home", "draw": "prob_draw", "away": "prob_away"}
        for _, decision in moneyline_decisions.iterrows():
            side = decision["market"].removeprefix("1x2_")
            reported = predictions.loc[decision["match_id"], side_to_column[side]]
            assert decision["model_probability"] == pytest.approx(reported, abs=1e-6), (
                f"{model_name}/{side}: betting used {decision['model_probability']} "
                f"but predictions reported {reported}"
            )


def test_fold_id_persists_across_baseline_decision_and_prediction_rows() -> None:
    matches = _synthetic_baseline_matches()
    odds = _moneyline_odds_for(matches)

    runner = BacktestRunner(_baseline_backtest_config())
    results = runner.run(matches, odds=odds, models_to_run=["spi_lite_baseline"])

    predictions = results["spi_lite_baseline"]["predictions"]
    decision_log = results["spi_lite_baseline"]["decision_log"]

    assert "fold_id" in predictions.columns
    assert predictions["fold_id"].notna().all()
    assert "fold_id" in decision_log.columns
    assert "match_date" in decision_log.columns
    assert decision_log["fold_id"].notna().all()
    assert (decision_log["match_date"] != "").all()


def test_fold_id_persists_in_pure_model_decision_and_prediction_rows() -> None:
    matches = _synthetic_baseline_matches()
    odds = _moneyline_odds_for(matches)

    config = _baseline_backtest_config()
    config["dixon_coles"] = {"max_iter": 50, "tol": 1e-6}

    runner = BacktestRunner(config)
    results = runner.run(matches, odds=odds, models_to_run=["dixon_coles"])

    predictions = results["dixon_coles"]["predictions"]
    decision_log = results["dixon_coles"]["decision_log"]

    assert "fold_id" in predictions.columns
    assert predictions["fold_id"].notna().all()
    assert "fold_id" in decision_log.columns
    assert decision_log["fold_id"].notna().all()


def test_evaluate_market_candidates_defaults_fold_kwargs_for_backward_compat() -> None:
    """Live predict.py never passes fold_id/match_date; defaults must be inert
    so the existing production call site keeps working unchanged."""
    staker = StakingEngine(
        StakingConfig(min_edge=0.01, max_stake_pct=0.01, max_slate_exposure_pct=0.05, bankroll=10000.0)
    )
    decisions = evaluate_market_candidates(
        match_id="m1",
        slate_key="2026-04-01",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "m1",
                    "timestamp": "2026-04-01T00:00:00+00:00",
                    "sportsbook": "DraftKings",
                    "source_type": "close",
                    "market_type": "total",
                    "line": 2.5,
                    "over_odds": 1.80,
                    "under_odds": 2.10,
                }
            ]
        ),
        markets=SimpleNamespace(
            home_prob=0.33,
            draw_prob=0.34,
            away_prob=0.33,
            over_probs={2.5: 0.70},
            under_probs={2.5: 0.30},
        ),
        staker=staker,
        selection=load_bet_selection_config(
            {
                "betting": {"min_edge": 0.01, "min_confidence": 0.01},
                "odds_provider": {"stale_line_minutes": 180},
            }
        ),
        now=pd.Timestamp("2026-04-01T00:00:00+00:00").to_pydatetime(),
        gating_status="passed",
    )

    assert decisions
    assert all(decision.fold_id is None for decision in decisions)
    assert all(decision.match_date == "" for decision in decisions)
