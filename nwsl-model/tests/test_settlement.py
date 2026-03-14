"""Tests for bet settlement logic, especially quarter lines."""

import pytest

from src.betting.settlement import (
    BetResult,
    settle_1x2,
    settle_asian_handicap,
    settle_total,
)


class TestSettle1X2:
    def test_home_win(self):
        r = settle_1x2("H", 2, 1, 2.0, 100)
        assert r.result == BetResult.WIN
        assert r.pnl == 100.0

    def test_home_loss(self):
        r = settle_1x2("H", 0, 1, 2.0, 100)
        assert r.result == BetResult.LOSS
        assert r.pnl == -100.0

    def test_draw_win(self):
        r = settle_1x2("D", 1, 1, 3.5, 100)
        assert r.result == BetResult.WIN
        assert r.pnl == 250.0

    def test_away_win(self):
        r = settle_1x2("A", 0, 2, 2.5, 100)
        assert r.result == BetResult.WIN
        assert r.pnl == 150.0


class TestSettleTotal:
    def test_over_2_5_win(self):
        r = settle_total("over", 3, 2.5, 1.90, 100)
        assert r.result == BetResult.WIN
        assert r.pnl == pytest.approx(90.0)

    def test_over_2_5_loss(self):
        r = settle_total("over", 2, 2.5, 1.90, 100)
        assert r.result == BetResult.LOSS
        assert r.pnl == -100.0

    def test_under_2_5_win(self):
        r = settle_total("under", 1, 2.5, 1.90, 100)
        assert r.result == BetResult.WIN

    def test_whole_line_push(self):
        """Total equals whole-number line = push."""
        r = settle_total("over", 2, 2.0, 1.90, 100)
        assert r.result == BetResult.PUSH
        assert r.pnl == 0.0

    def test_quarter_line_over_2_25_total_3(self):
        """Over 2.25, total=3: both halves win."""
        r = settle_total("over", 3, 2.25, 1.90, 100)
        assert r.result == BetResult.WIN
        # Half on over 2.0 (win) + half on over 2.5 (win)
        assert r.pnl == pytest.approx(90.0)

    def test_quarter_line_over_2_25_total_2(self):
        """Over 2.25, total=2: half push (over 2.0), half loss (over 2.5)."""
        r = settle_total("over", 2, 2.25, 1.90, 100)
        assert r.result == BetResult.HALF_LOSS
        # Half on over 2.0 (push=0) + half on over 2.5 (loss=-50)
        assert r.pnl == pytest.approx(-50.0)

    def test_quarter_line_over_2_75_total_3(self):
        """Over 2.75, total=3: half win (over 2.5), half push (over 3.0)."""
        r = settle_total("over", 3, 2.75, 1.90, 100)
        assert r.result == BetResult.HALF_WIN
        # Half on over 2.5 (win=45) + half on over 3.0 (push=0)
        assert r.pnl == pytest.approx(45.0)

    def test_quarter_line_over_2_75_total_2(self):
        """Over 2.75, total=2: both halves lose."""
        r = settle_total("over", 2, 2.75, 1.90, 100)
        assert r.result == BetResult.LOSS
        assert r.pnl == -100.0

    def test_quarter_line_under_2_25_total_2(self):
        """Under 2.25, total=2: half push (under 2.0), half win (under 2.5)."""
        r = settle_total("under", 2, 2.25, 1.90, 100)
        assert r.result == BetResult.HALF_WIN
        assert r.pnl == pytest.approx(45.0)


class TestSettleAsianHandicap:
    def test_home_minus_half_win(self):
        """Home -0.5, home wins 2-1."""
        r = settle_asian_handicap("home", 2, 1, -0.5, 1.90, 100)
        assert r.result == BetResult.WIN
        assert r.pnl == pytest.approx(90.0)

    def test_home_minus_half_loss(self):
        """Home -0.5, draw 1-1."""
        r = settle_asian_handicap("home", 1, 1, -0.5, 1.90, 100)
        assert r.result == BetResult.LOSS
        assert r.pnl == -100.0

    def test_home_minus_one_push(self):
        """Home -1.0, home wins 2-1: push."""
        r = settle_asian_handicap("home", 2, 1, -1.0, 1.90, 100)
        assert r.result == BetResult.PUSH
        assert r.pnl == 0.0

    def test_quarter_line_ah(self):
        """Home -0.75, home wins 2-1: half win on -0.5, push on -1.0."""
        r = settle_asian_handicap("home", 2, 1, -0.75, 1.90, 100)
        assert r.result == BetResult.HALF_WIN
        # Half on -0.5 (win=45) + half on -1.0 (push=0)
        assert r.pnl == pytest.approx(45.0)

    def test_away_plus_half_win(self):
        """Away +0.5, draw 0-0: away covers."""
        r = settle_asian_handicap("away", 0, 0, 0.5, 1.90, 100)
        assert r.result == BetResult.WIN
