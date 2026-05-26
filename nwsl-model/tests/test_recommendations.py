from __future__ import annotations

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.betting.recommendations import BetSelectionConfig, evaluate_market_candidates
from src.betting.staking import StakingConfig, StakingEngine


def test_empty_odds_rows_return_no_decisions() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(),
        markets=MarketPrices(match_id="1"),
        staker=StakingEngine(StakingConfig(max_slate_exposure_pct=0.01)),
        selection=BetSelectionConfig(),
    )

    assert decisions == []


def test_staking_engine_enforces_slate_exposure_cap() -> None:
    staker = StakingEngine(
        StakingConfig(bankroll=1000.0, max_stake_pct=0.02, max_slate_exposure_pct=0.02)
    )

    assert staker.can_allocate("slate", 20.0)
    staker.reserve_exposure("slate", 20.0)
    assert not staker.can_allocate("slate", 0.01)


def test_unpassed_model_gating_suppresses_accepted_bets() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "FootyStats",
                    "market_type": "1x2",
                    "home_odds": 4.0,
                    "draw_odds": 3.2,
                    "away_odds": 2.1,
                    "source_type": "current",
                }
            ]
        ),
        markets=MarketPrices(match_id="1", home_prob=0.50, draw_prob=0.25, away_prob=0.25),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(min_edge=0.02, min_confidence=0.08),
        gating_status="unpromoted",
    )

    assert decisions
    assert not any(decision.accepted for decision in decisions)
    assert any(decision.reason == "model_gating_not_passed" for decision in decisions)
