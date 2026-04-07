#!/usr/bin/env python3
"""Manual ledger operations for launch-phase betting support."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.betting.ledger import (
    load_ledger,
    record_manual_placement,
    reconcile_closing_prices,
    settle_ledger,
)
from src.data.loaders import load_matches, load_odds
from src.utils.io import load_config
from src.utils.logging import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage the internal betting ledger")
    parser.add_argument("--config", type=str, default="configs/default.yaml")

    subparsers = parser.add_subparsers(dest="command", required=True)

    place_parser = subparsers.add_parser("place", help="Mark a candidate bet as manually placed")
    place_parser.add_argument("--run-id", required=True)
    place_parser.add_argument("--match-id", required=True)
    place_parser.add_argument("--sportsbook", required=True)
    place_parser.add_argument("--market", required=True)
    place_parser.add_argument("--side", required=True)
    place_parser.add_argument("--line", type=float, default=None)
    place_parser.add_argument("--market-price", type=float, default=None)

    reconcile_parser = subparsers.add_parser("reconcile-close", help="Attach closing prices and CLV")
    reconcile_parser.add_argument("--closing-odds", default="")

    settle_parser = subparsers.add_parser("settle", help="Settle placed bets against match results")
    settle_parser.add_argument("--matches", default="")

    args = parser.parse_args()

    config = load_config(args.config)
    log_cfg = config.get("logging", {})
    setup_logging(log_cfg.get("level", "INFO"), log_cfg.get("file"))
    logger = logging.getLogger("nwsl_model.ledger")

    operator_cfg = config.get("operator", {})
    ledger_path = Path(operator_cfg.get("ledger_path", "data/processed/ops/bet_ledger.csv"))

    if args.command == "place":
        ledger = record_manual_placement(
            ledger_path,
            run_id=args.run_id,
            match_id=args.match_id,
            sportsbook=args.sportsbook,
            market=args.market,
            side=args.side,
            line=args.line,
            market_price=args.market_price,
        )
        print(f"Marked ledger row as placed. Ledger now has {len(ledger)} rows.")
        return

    if args.command == "reconcile-close":
        odds_path = args.closing_odds or config.get("data", {}).get("odds_path", "")
        if not odds_path:
            raise ValueError("Provide --closing-odds or configure data.odds_path.")
        closing_odds = load_odds(odds_path)
        if closing_odds is None:
            raise FileNotFoundError(f"No closing odds found at {odds_path}")
        ledger = reconcile_closing_prices(ledger_path, closing_odds)
        print(f"Reconciled closing prices for {len(ledger)} ledger rows.")
        return

    if args.command == "settle":
        matches_path = args.matches or config.get("data", {}).get("matches_path", "")
        if not matches_path:
            raise ValueError("Provide --matches or configure data.matches_path.")
        matches = load_matches(matches_path)
        ledger = settle_ledger(ledger_path, matches)
        settled_rows = len(ledger[ledger["status"] == "settled"]) if not ledger.empty else 0
        print(f"Settled ledger rows: {settled_rows}")
        return

    current = load_ledger(ledger_path)
    logger.info(f"Ledger has {len(current)} rows.")


if __name__ == "__main__":
    main()
