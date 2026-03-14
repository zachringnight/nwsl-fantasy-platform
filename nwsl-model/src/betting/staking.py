"""Staking and bankroll management module.

Implements fractional Kelly criterion with configurable constraints.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger("nwsl_model.betting.staking")


@dataclass
class BetRecommendation:
    """A recommended bet with sizing."""
    match_id: str
    market: str  # e.g., "1x2_home", "total_over_2.5", "ah_home_-0.5"
    side: str  # e.g., "home", "over", etc.
    line: float = 0.0
    model_prob: float = 0.0
    market_odds: float = 0.0
    fair_odds: float = 0.0
    edge: float = 0.0
    kelly_fraction: float = 0.0
    stake: float = 0.0
    stake_pct: float = 0.0


@dataclass
class StakingConfig:
    """Staking configuration."""
    min_edge: float = 0.02
    kelly_fraction: float = 0.25
    max_stake_pct: float = 0.01
    bankroll: float = 10000.0


class StakingEngine:
    """Fractional Kelly staking with edge thresholds and caps."""

    def __init__(self, config: StakingConfig):
        self.config = config
        self.bankroll = config.bankroll
        self.initial_bankroll = config.bankroll
        self.bet_log: list[dict] = []

    def compute_edge(self, model_prob: float, market_odds: float) -> float:
        """Compute edge: model_prob * odds - 1."""
        return model_prob * market_odds - 1.0

    def kelly_stake(self, model_prob: float, market_odds: float) -> float:
        """Compute full Kelly stake fraction.

        f* = (p * (b + 1) - 1) / b  where b = odds - 1, p = probability
        """
        b = market_odds - 1.0
        if b <= 0:
            return 0.0
        f = (model_prob * (b + 1) - 1) / b
        return max(f, 0.0)

    def recommend_bet(
        self,
        match_id: str,
        market: str,
        side: str,
        model_prob: float,
        market_odds: float,
        line: float = 0.0,
    ) -> BetRecommendation | None:
        """Generate a bet recommendation if edge exceeds threshold.

        Returns None if no bet recommended.
        """
        edge = self.compute_edge(model_prob, market_odds)

        if edge < self.config.min_edge:
            return None

        full_kelly = self.kelly_stake(model_prob, market_odds)
        frac_kelly = full_kelly * self.config.kelly_fraction

        # Cap at max stake percentage
        stake_pct = min(frac_kelly, self.config.max_stake_pct)
        stake = stake_pct * self.bankroll

        fair_odds = 1.0 / model_prob if model_prob > 0 else float("inf")

        return BetRecommendation(
            match_id=match_id,
            market=market,
            side=side,
            line=line,
            model_prob=model_prob,
            market_odds=market_odds,
            fair_odds=fair_odds,
            edge=edge,
            kelly_fraction=frac_kelly,
            stake=stake,
            stake_pct=stake_pct,
        )

    def update_bankroll(self, pnl: float) -> float:
        """Update bankroll after a bet settles."""
        self.bankroll += pnl
        return self.bankroll

    def log_bet(self, rec: BetRecommendation, pnl: float, result: str) -> None:
        """Record a settled bet."""
        self.bet_log.append({
            "match_id": rec.match_id,
            "market": rec.market,
            "side": rec.side,
            "line": rec.line,
            "model_prob": rec.model_prob,
            "market_odds": rec.market_odds,
            "edge": rec.edge,
            "stake": rec.stake,
            "stake_pct": rec.stake_pct,
            "pnl": pnl,
            "result": result,
            "bankroll_after": self.bankroll,
        })

    def get_bet_log_df(self) -> "pd.DataFrame":
        """Return bet log as DataFrame."""
        import pandas as pd
        return pd.DataFrame(self.bet_log)

    def summary(self) -> dict:
        """Return summary statistics."""
        if not self.bet_log:
            return {"n_bets": 0, "roi": 0.0, "pnl": 0.0}

        import pandas as pd
        df = pd.DataFrame(self.bet_log)
        total_staked = df["stake"].sum()
        total_pnl = df["pnl"].sum()
        n_bets = len(df)
        wins = (df["pnl"] > 0).sum()

        return {
            "n_bets": n_bets,
            "total_staked": total_staked,
            "total_pnl": total_pnl,
            "roi": total_pnl / total_staked if total_staked > 0 else 0.0,
            "hit_rate": wins / n_bets if n_bets > 0 else 0.0,
            "final_bankroll": self.bankroll,
            "bankroll_growth": self.bankroll / self.initial_bankroll - 1.0,
        }
