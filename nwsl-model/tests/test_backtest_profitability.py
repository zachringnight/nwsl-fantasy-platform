from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pandas as pd

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
