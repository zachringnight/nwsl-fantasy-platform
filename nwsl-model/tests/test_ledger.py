from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from src.betting.ledger import (
    append_ledger_rows,
    decisions_to_ledger_rows,
    load_ledger,
    reconcile_closing_prices,
    record_manual_placement,
    settle_ledger,
)
from src.betting.recommendations import BetDecision


def test_ledger_place_reconcile_and_settle(tmp_path: Path) -> None:
    ledger_path = tmp_path / "bet_ledger.csv"
    decision = BetDecision(
        match_id="m1",
        market="1x2_home",
        side="home",
        line=None,
        sportsbook="Book A",
        source_type="current",
        timestamp="2026-04-07T18:00:00Z",
        model_probability=0.55,
        model_price=1.82,
        market_price=2.30,
        edge=0.265,
        confidence=0.22,
        confidence_band="high",
        accepted=True,
        reason="accepted",
        stake=20.0,
        stake_pct=0.002,
        slate_key="2026-04-10",
        model_version="v1",
        model_family="dixon_coles",
        blended=False,
        gating_status="passed",
    )

    append_ledger_rows(ledger_path, decisions_to_ledger_rows([decision], "run-1"))
    ledger = record_manual_placement(
        ledger_path,
        run_id="run-1",
        match_id="m1",
        sportsbook="Book A",
        market="1x2_home",
        side="home",
        line=None,
        market_price=2.30,
    )
    assert ledger.loc[0, "status"] == "placed"

    closing_odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-04-10T01:55:00Z",
                "sportsbook": "Book A",
                "market_type": "1x2",
                "home_odds": 2.10,
                "draw_odds": 3.40,
                "away_odds": 3.60,
                "source_type": "close",
            }
        ]
    )
    ledger = reconcile_closing_prices(ledger_path, closing_odds)
    assert float(ledger.loc[0, "closing_price"]) == pytest.approx(2.10)
    assert float(ledger.loc[0, "clv"]) == pytest.approx((2.30 / 2.10) - 1.0)

    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "home_goals_90": 2,
                "away_goals_90": 1,
            }
        ]
    )
    ledger = settle_ledger(ledger_path, matches)
    assert ledger.loc[0, "status"] == "settled"
    assert ledger.loc[0, "result"] == "win"
    assert float(ledger.loc[0, "pnl"]) > 0

    persisted = load_ledger(ledger_path)
    assert len(persisted) == 1
