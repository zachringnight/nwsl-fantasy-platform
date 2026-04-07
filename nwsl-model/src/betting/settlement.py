"""Bet settlement logic including quarter-line handling.

Correctly settles Asian handicaps and totals including quarter lines
where half the stake goes on each adjacent half/whole line.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class BetResult(str, Enum):
    WIN = "win"
    LOSS = "loss"
    PUSH = "push"
    HALF_WIN = "half_win"
    HALF_LOSS = "half_loss"


@dataclass
class SettlementResult:
    """Result of settling a single bet."""
    result: BetResult
    pnl: float  # Profit/loss in units of stake
    stake: float
    odds: float
    line: float


def settle_1x2(
    bet_side: str,
    home_goals: int,
    away_goals: int,
    odds: float,
    stake: float,
) -> SettlementResult:
    """Settle a 1X2 bet."""
    diff = home_goals - away_goals

    if bet_side == "H":
        won = diff > 0
    elif bet_side == "D":
        won = diff == 0
    elif bet_side == "A":
        won = diff < 0
    else:
        raise ValueError(f"Invalid bet_side: {bet_side}")

    if won:
        pnl = stake * (odds - 1)
        return SettlementResult(BetResult.WIN, pnl, stake, odds, 0.0)
    else:
        return SettlementResult(BetResult.LOSS, -stake, stake, odds, 0.0)


def settle_total(
    bet_side: str,
    total_goals: int,
    line: float,
    odds: float,
    stake: float,
) -> SettlementResult:
    """Settle a totals bet, handling half and quarter lines.

    Quarter-line logic:
        Over 2.25 at odds X:
          - Half stake on Over 2.0 at odds X
          - Half stake on Over 2.5 at odds X
    """
    is_quarter = abs(line * 4 - round(line * 4)) < 1e-10 and abs(line * 2 - round(line * 2)) > 1e-10

    if is_quarter:
        # Split into two half-line bets
        import math
        lo = math.floor(line * 2) / 2.0
        hi = math.ceil(line * 2) / 2.0
        half_stake = stake / 2.0

        r1 = _settle_total_single(bet_side, total_goals, lo, odds, half_stake)
        r2 = _settle_total_single(bet_side, total_goals, hi, odds, half_stake)

        total_pnl = r1.pnl + r2.pnl

        # Determine composite result
        if r1.result == BetResult.WIN and r2.result == BetResult.WIN:
            result = BetResult.WIN
        elif r1.result == BetResult.LOSS and r2.result == BetResult.LOSS:
            result = BetResult.LOSS
        elif r1.result == BetResult.WIN and r2.result == BetResult.PUSH:
            result = BetResult.HALF_WIN
        elif r1.result == BetResult.PUSH and r2.result == BetResult.LOSS:
            result = BetResult.HALF_LOSS
        elif r1.result == BetResult.WIN and r2.result == BetResult.LOSS:
            result = BetResult.HALF_WIN if total_pnl > 0 else BetResult.HALF_LOSS
        else:
            result = BetResult.HALF_WIN if total_pnl >= 0 else BetResult.HALF_LOSS

        return SettlementResult(result, total_pnl, stake, odds, line)
    else:
        return _settle_total_single(bet_side, total_goals, line, odds, stake)


def _settle_total_single(
    bet_side: str,
    total_goals: int,
    line: float,
    odds: float,
    stake: float,
) -> SettlementResult:
    """Settle a single total bet on a half or whole line."""
    diff = total_goals - line

    if bet_side.lower() == "over":
        if diff > 1e-10:
            return SettlementResult(BetResult.WIN, stake * (odds - 1), stake, odds, line)
        elif diff < -1e-10:
            return SettlementResult(BetResult.LOSS, -stake, stake, odds, line)
        else:
            return SettlementResult(BetResult.PUSH, 0.0, stake, odds, line)
    elif bet_side.lower() == "under":
        if diff < -1e-10:
            return SettlementResult(BetResult.WIN, stake * (odds - 1), stake, odds, line)
        elif diff > 1e-10:
            return SettlementResult(BetResult.LOSS, -stake, stake, odds, line)
        else:
            return SettlementResult(BetResult.PUSH, 0.0, stake, odds, line)
    else:
        raise ValueError(f"Invalid bet_side for total: {bet_side}")


def settle_asian_handicap(
    bet_side: str,
    home_goals: int,
    away_goals: int,
    line: float,
    odds: float,
    stake: float,
) -> SettlementResult:
    """Settle an Asian handicap bet, handling quarter lines.

    line is applied to the bet_side team.
    E.g., bet_side="home", line=-0.5 means home team -0.5.
    """
    import math

    is_quarter = abs(line * 4 - round(line * 4)) < 1e-10 and abs(line * 2 - round(line * 2)) > 1e-10

    if is_quarter:
        lo = math.floor(line * 2) / 2.0
        hi = math.ceil(line * 2) / 2.0
        half_stake = stake / 2.0

        r1 = _settle_ah_single(bet_side, home_goals, away_goals, lo, odds, half_stake)
        r2 = _settle_ah_single(bet_side, home_goals, away_goals, hi, odds, half_stake)

        total_pnl = r1.pnl + r2.pnl

        if r1.result == BetResult.WIN and r2.result == BetResult.WIN:
            result = BetResult.WIN
        elif r1.result == BetResult.LOSS and r2.result == BetResult.LOSS:
            result = BetResult.LOSS
        else:
            result = BetResult.HALF_WIN if total_pnl >= 0 else BetResult.HALF_LOSS

        return SettlementResult(result, total_pnl, stake, odds, line)
    else:
        return _settle_ah_single(bet_side, home_goals, away_goals, line, odds, stake)


def _settle_ah_single(
    bet_side: str,
    home_goals: int,
    away_goals: int,
    line: float,
    odds: float,
    stake: float,
) -> SettlementResult:
    """Settle a single Asian handicap bet."""
    goal_diff = home_goals - away_goals

    if bet_side.lower() == "home":
        adjusted = goal_diff + line
    elif bet_side.lower() == "away":
        adjusted = (away_goals - home_goals) + line
    else:
        raise ValueError(f"Invalid bet_side for AH: {bet_side}")

    if adjusted > 1e-10:
        return SettlementResult(BetResult.WIN, stake * (odds - 1), stake, odds, line)
    elif adjusted < -1e-10:
        return SettlementResult(BetResult.LOSS, -stake, stake, odds, line)
    else:
        return SettlementResult(BetResult.PUSH, 0.0, stake, odds, line)
