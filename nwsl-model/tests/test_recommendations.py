from __future__ import annotations

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.betting.recommendations import BetSelectionConfig, evaluate_market_candidates, load_bet_selection_config
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
        selection=BetSelectionConfig(min_edge=0.02, min_confidence=0.08, lean_max_probability_edge=0.30),
        gating_status="unpromoted",
    )

    assert decisions
    assert not any(decision.accepted for decision in decisions)
    assert any(decision.reason == "lean_model_gating_not_passed" for decision in decisions)
    assert any(decision.pick_tier == "lean" and decision.actionable for decision in decisions)


def test_unvalidated_extreme_market_disagreement_suppresses_lean() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "FootyStats",
                    "market_type": "1x2",
                    "home_odds": 8.0,
                    "draw_odds": 4.0,
                    "away_odds": 1.50,
                    "source_type": "current",
                }
            ]
        ),
        markets=MarketPrices(match_id="1", home_prob=0.50, draw_prob=0.20, away_prob=0.30),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(
            min_edge=0.02,
            min_confidence=0.08,
            lean_max_probability_edge=0.20,
        ),
        gating_status="baseline_fallback",
    )

    assert not any(decision.pick_tier == "lean" for decision in decisions)
    assert any(decision.reason == "lean_probability_edge_outlier" for decision in decisions)


def test_passed_model_can_emit_official_pick_with_market_diagnostics() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "total",
                    "line": 2.5,
                    "over_odds": 2.20,
                    "under_odds": 1.75,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(
            match_id="1",
            over_probs={2.5: 0.58},
            under_probs={2.5: 0.42},
        ),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(min_edge=0.02, min_confidence=0.05),
        gating_status="passed",
    )

    official = [decision for decision in decisions if decision.pick_tier == "official_pick"]

    assert len(official) == 1
    assert official[0].market == "total_over_2.5"
    assert official[0].accepted
    assert official[0].market_no_vig_probability > 0
    assert official[0].probability_edge > 0
    assert official[0].expected_value == official[0].edge
    assert official[0].closing_market_price == 2.20
    assert official[0].clv == 0.0


def test_market_specific_price_cap_rejects_moneyline_longshot() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "1x2",
                    "home_odds": 4.5,
                    "draw_odds": 3.4,
                    "away_odds": 1.9,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(match_id="1", home_prob=0.35, draw_prob=0.25, away_prob=0.40),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(
            min_edge=0.02,
            min_confidence=0.05,
            moneyline_max_market_price=4.0,
        ),
        gating_status="passed",
    )

    assert any(
        decision.market == "1x2_home" and decision.reason == "market_price_above_max"
        for decision in decisions
    )


def test_draw_side_rule_can_emit_official_pick_when_generic_moneyline_is_too_strict() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "1x2",
                    "home_odds": 2.30,
                    "draw_odds": 3.60,
                    "away_odds": 3.20,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(match_id="1", home_prob=0.35, draw_prob=0.36, away_prob=0.29),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=load_bet_selection_config(
            {
                "betting": {
                    "min_edge": 0.02,
                    "min_confidence": 0.08,
                    "market_rules": {
                        "moneyline": {
                            "min_edge": 0.10,
                            "min_confidence": 0.12,
                            "side_rules": {
                                "draw": {
                                    "min_edge": 0.03,
                                    "min_confidence": 0.0,
                                    "min_probability_edge": 0.03,
                                    "min_market_price": 3.0,
                                    "max_market_price": 5.0,
                                }
                            },
                        }
                    },
                }
            }
        ),
        gating_status="passed",
    )

    draw = [decision for decision in decisions if decision.market == "1x2_draw"][0]
    home = [decision for decision in decisions if decision.market == "1x2_home"][0]

    assert draw.accepted
    assert draw.pick_tier == "official_pick"
    assert draw.probability_edge > 0.03
    assert home.reason == "confidence_below_threshold"


def test_draw_side_rule_can_reject_short_draw_prices() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "1x2",
                    "home_odds": 2.80,
                    "draw_odds": 2.80,
                    "away_odds": 3.20,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(match_id="1", home_prob=0.30, draw_prob=0.40, away_prob=0.30),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=load_bet_selection_config(
            {
                "betting": {
                    "market_rules": {
                        "moneyline": {
                            "min_edge": 0.02,
                            "min_confidence": 0.0,
                            "side_rules": {
                                "draw": {"min_market_price": 3.0}
                            },
                        }
                    },
                }
            }
        ),
        gating_status="passed",
    )

    assert any(
        decision.market == "1x2_draw" and decision.reason == "market_price_below_min"
        for decision in decisions
    )


def test_draw_side_rule_requires_probability_edge_for_official_pick() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "1x2",
                    "home_odds": 2.90,
                    "draw_odds": 3.60,
                    "away_odds": 3.60,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(match_id="1", home_prob=0.31, draw_prob=0.32, away_prob=0.37),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=load_bet_selection_config(
            {
                "betting": {
                    "lean_max_probability_edge": 0.20,
                    "market_rules": {
                        "moneyline": {
                            "min_edge": 0.02,
                            "min_confidence": 0.0,
                            "side_rules": {
                                "draw": {
                                    "min_edge": 0.02,
                                    "min_confidence": 0.0,
                                    "min_market_price": 3.0,
                                    "min_probability_edge": 0.08,
                                }
                            },
                        }
                    },
                }
            }
        ),
        gating_status="passed",
    )

    draw = [decision for decision in decisions if decision.market == "1x2_draw"][0]

    assert draw.expected_value > 0
    assert 0 < draw.probability_edge < 0.08
    assert not draw.accepted
    assert draw.pick_tier == "lean"
    assert draw.reason == "lean_probability_edge_below_official_threshold"


def test_total_market_rule_can_use_lower_confidence_with_higher_edge() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "total",
                    "line": 2.5,
                    "over_odds": 2.10,
                    "under_odds": 1.85,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(
            match_id="1",
            over_probs={2.5: 0.525},
            under_probs={2.5: 0.475},
        ),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(
            min_edge=0.02,
            min_confidence=0.08,
            lean_min_confidence=0.03,
            total_min_edge=0.10,
            total_min_confidence=0.0,
        ),
        gating_status="passed",
    )

    official = [decision for decision in decisions if decision.pick_tier == "official_pick"]
    assert len(official) == 1
    assert official[0].market == "total_over_2.5"
    assert official[0].confidence < 0.03


def test_disabled_total_market_rule_rejects_otherwise_valid_pick() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "DraftKings",
                    "market_type": "total",
                    "line": 2.5,
                    "over_odds": 2.20,
                    "under_odds": 1.75,
                    "source_type": "close",
                }
            ]
        ),
        markets=MarketPrices(
            match_id="1",
            over_probs={2.5: 0.60},
            under_probs={2.5: 0.40},
        ),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(
            min_edge=0.02,
            min_confidence=0.0,
            total_enabled=False,
            total_min_edge=0.01,
            total_min_confidence=0.0,
        ),
        gating_status="passed",
    )

    assert decisions
    assert not any(decision.accepted for decision in decisions)
    assert not any(decision.pick_tier == "lean" for decision in decisions)
    assert {decision.reason for decision in decisions} == {"market_disabled_by_validation"}


def test_totals_official_picks_disabled_still_emits_lean() -> None:
    decisions = evaluate_market_candidates(
        match_id="1",
        slate_key="2026-05-29",
        odds_rows=pd.DataFrame(
            [
                {
                    "match_id": "1",
                    "sportsbook": "FoxSports",
                    "market_type": "total",
                    "line": 2.5,
                    "over_odds": 1.91,
                    "under_odds": 1.80,
                    "source_type": "current",
                }
            ]
        ),
        markets=MarketPrices(
            match_id="1",
            over_probs={2.5: 0.60},
            under_probs={2.5: 0.40},
        ),
        staker=StakingEngine(StakingConfig(bankroll=1000.0, max_slate_exposure_pct=0.05)),
        selection=BetSelectionConfig(
            min_edge=0.02,
            min_confidence=0.0,
            total_enabled=True,
            total_official_picks_enabled=False,
            total_min_edge=0.10,
            total_min_confidence=0.0,
            total_allowed_sides=("over",),
            lean_max_probability_edge=0.30,
        ),
        gating_status="passed",
    )

    over = [decision for decision in decisions if decision.market == "total_over_2.5"][0]
    assert not over.accepted
    assert over.pick_tier == "lean"
    assert over.actionable
    assert over.reason == "lean_market_official_picks_disabled"
    # Official totals picks must never be emitted while official picks are disabled.
    assert not any(decision.pick_tier == "official_pick" for decision in decisions)


def test_bet_selection_config_loads_official_picks_enabled_flags() -> None:
    selection = load_bet_selection_config(
        {
            "betting": {
                "market_rules": {
                    "moneyline": {"enabled": True},
                    "totals": {"enabled": True, "official_picks_enabled": False},
                },
            }
        }
    )

    assert selection.rule_for("1x2", "home").official_picks_enabled is True
    assert selection.rule_for("total", "over").enabled is True
    assert selection.rule_for("total", "over").official_picks_enabled is False


def test_bet_selection_config_normalizes_ml_and_totals_aliases() -> None:
    selection = load_bet_selection_config(
        {
            "betting": {
                "markets": ["ml", "moneyline", "totals", "total_goals"],
                "market_rules": {
                    "moneyline": {"min_edge": 0.03, "max_market_price": 4.0},
                    "totals": {"min_edge": 0.10, "min_confidence": 0.0},
                },
            }
        }
    )

    assert selection.allowed_markets == ("1x2", "total")
    assert selection.moneyline_min_edge == 0.03
    assert selection.moneyline_max_market_price == 4.0
    assert selection.total_min_edge == 0.10
    assert selection.total_min_confidence == 0.0


def test_bet_selection_config_loads_moneyline_side_rules() -> None:
    selection = load_bet_selection_config(
        {
            "betting": {
                "market_rules": {
                    "moneyline": {
                        "min_edge": 0.08,
                        "side_rules": {
                            "draw": {
                                "min_edge": 0.03,
                                "min_confidence": 0.0,
                                "min_probability_edge": 0.02,
                                "min_market_price": 3.0,
                            },
                        },
                    },
                },
            }
        }
    )

    draw_rule = selection.rule_for("1x2", "draw")
    home_rule = selection.rule_for("1x2", "home")

    assert home_rule.min_edge == 0.08
    assert draw_rule.min_edge == 0.03
    assert draw_rule.min_confidence == 0.0
    assert draw_rule.min_probability_edge == 0.02
    assert draw_rule.min_market_price == 3.0


def test_bet_selection_config_loads_market_enabled_flags() -> None:
    selection = load_bet_selection_config(
        {
            "betting": {
                "market_rules": {
                    "moneyline": {"enabled": True},
                    "totals": {"enabled": False},
                },
            }
        }
    )

    assert selection.rule_for("1x2", "home").enabled is True
    assert selection.rule_for("total", "over").enabled is False
