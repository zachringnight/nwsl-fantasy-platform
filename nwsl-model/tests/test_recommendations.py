from __future__ import annotations

from datetime import datetime, timezone

UTC = timezone.utc

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.betting.recommendations import BetSelectionConfig, evaluate_market_candidates
from src.betting.staking import StakingConfig, StakingEngine


def _build_markets() -> MarketPrices:
    return MarketPrices(
        match_id="m1",
        home_prob=0.55,
        draw_prob=0.23,
        away_prob=0.22,
        home_fair_odds=1.82,
        draw_fair_odds=4.35,
        away_fair_odds=4.55,
        over_probs={2.5: 0.62},
        under_probs={2.5: 0.38},
        over_fair_odds={2.5: 1.61},
        under_fair_odds={2.5: 2.63},
    )


def test_evaluate_market_candidates_accepts_edges_and_rejects_low_confidence() -> None:
    odds_rows = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-04-07T19:30:00Z",
                "sportsbook": "Book A",
                "market_type": "1x2",
                "home_odds": 2.20,
                "draw_odds": 3.20,
                "away_odds": 3.20,
                "source_type": "current",
            },
            {
                "match_id": "m1",
                "timestamp": "2026-04-07T19:30:00Z",
                "sportsbook": "Book A",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 2.05,
                "under_odds": 1.80,
                "source_type": "current",
            },
        ]
    )
    staker = StakingEngine(
        StakingConfig(
            min_edge=0.02,
            kelly_fraction=0.25,
            max_stake_pct=0.02,
            max_slate_exposure_pct=0.10,
            bankroll=10000.0,
        )
    )
    decisions = evaluate_market_candidates(
        match_id="m1",
        slate_key="2026-04-10",
        odds_rows=odds_rows,
        markets=_build_markets(),
        staker=staker,
        selection=BetSelectionConfig(min_edge=0.02, min_confidence=0.08, stale_line_minutes=60),
        now=datetime(2026, 4, 7, 20, 0, tzinfo=UTC),
        model_version="v1",
        model_family="dixon_coles",
        blended=False,
        gating_status="passed",
    )

    accepted_markets = {decision.market for decision in decisions if decision.accepted}
    rejected = {decision.market: decision.reason for decision in decisions if not decision.accepted}

    assert "1x2_home" in accepted_markets
    assert "total_over_2.5" in accepted_markets
    assert rejected["1x2_draw"] == "confidence_below_threshold"
    assert rejected["1x2_away"] == "confidence_below_threshold"


def test_evaluate_market_candidates_rejects_stale_current_lines() -> None:
    odds_rows = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-04-07T15:00:00Z",
                "sportsbook": "Book A",
                "market_type": "1x2",
                "home_odds": 2.20,
                "draw_odds": 3.20,
                "away_odds": 3.20,
                "source_type": "current",
            }
        ]
    )
    staker = StakingEngine(StakingConfig(bankroll=10000.0))
    decisions = evaluate_market_candidates(
        match_id="m1",
        slate_key="2026-04-10",
        odds_rows=odds_rows,
        markets=_build_markets(),
        staker=staker,
        selection=BetSelectionConfig(min_edge=0.02, min_confidence=0.08, stale_line_minutes=60),
        now=datetime(2026, 4, 7, 20, 0, tzinfo=UTC),
    )

    assert decisions
    assert all(decision.reason == "stale_line" for decision in decisions)
    assert all(not decision.accepted for decision in decisions)
