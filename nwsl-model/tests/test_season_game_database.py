from __future__ import annotations

import sqlite3

import pandas as pd
import pytest

from scripts.build_season_game_database import (
    MAIN_TABLE,
    METADATA_TABLE,
    ODDS_TABLE,
    build_season_game_table,
    write_database,
)
from src.betting.recommendations import BetSelectionConfig


def test_build_season_game_table_marks_projection_provenance_and_lines() -> None:
    fixtures = pd.DataFrame(
        [
            {
                "match_id": "c1",
                "season": 2026,
                "match_date": "2026-05-03",
                "match_status": "completed",
                "home_team": "Home",
                "away_team": "Away",
                "home_goals_90": 2,
                "away_goals_90": 1,
                "venue": "Stadium",
            },
            {
                "match_id": "u1",
                "season": 2026,
                "match_date": "2026-05-29",
                "match_status": "scheduled",
                "home_team": "Future Home",
                "away_team": "Future Away",
                "home_goals_90": 0,
                "away_goals_90": 0,
                "venue": "Future Stadium",
            },
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "c1",
                "timestamp": "2026-05-03T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.8,
                "source_type": "close",
            },
            {
                "match_id": "u1",
                "timestamp": "2026-05-27T20:00:00Z",
                "sportsbook": "DraftKings",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.91,
                "under_odds": 1.91,
                "source_type": "current",
            },
        ]
    )
    completed_predictions = pd.DataFrame(
        [
            {
                "match_id": "c1",
                "prob_home": 0.52,
                "prob_draw": 0.23,
                "prob_away": 0.25,
                "lambda_home": 1.4,
                "lambda_away": 1.0,
                "prob_over_2.5": 0.48,
            }
        ]
    )
    upcoming_predictions = pd.DataFrame(
        [
            {
                "match_id": "u1",
                "prob_home": 0.45,
                "prob_draw": 0.25,
                "prob_away": 0.30,
                "lambda_home": 1.2,
                "lambda_away": 1.1,
                "prob_over_2.5": 0.51,
                "recommended_leans": "total_over_2.5",
                "top_pick_tier": "lean",
            }
        ]
    )

    table = build_season_game_table(
        fixtures=fixtures,
        odds=odds,
        completed_predictions=completed_predictions,
        upcoming_predictions=upcoming_predictions,
        season=2026,
        model_version="v1",
        model_family="spi_lite_baseline",
        completed_projection_source="season_holdout_2025_to_2026_spi_lite_baseline",
    )

    completed = table.loc[table["match_id"].eq("c1")].iloc[0]
    upcoming = table.loc[table["match_id"].eq("u1")].iloc[0]
    assert completed["projection_source"] == "season_holdout_2025_to_2026_spi_lite_baseline"
    assert completed["model_pick"] == "home"
    assert completed["model_pick_correct"] is True
    assert completed["moneyline_source_type"] == "close"
    assert completed["actual_result"] == "home"
    assert upcoming["projection_source"] == "current_forward_projection"
    assert upcoming["total_source_type"] == "current"
    assert pd.isna(upcoming["home_goals_90"])


def test_build_season_game_table_selects_best_positive_ev_moneyline_pick() -> None:
    fixtures = pd.DataFrame(
        [
            {
                "match_id": "draw-value",
                "season": 2026,
                "match_date": "2026-05-03",
                "match_status": "completed",
                "home_team": "Home",
                "away_team": "Away",
                "home_goals_90": 1,
                "away_goals_90": 1,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "draw-value",
                "timestamp": "2026-05-03T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "home_odds": 1.95,
                "draw_odds": 4.80,
                "away_odds": 4.10,
                "source_type": "close",
            }
        ]
    )
    completed_predictions = pd.DataFrame(
        [
            {
                "match_id": "draw-value",
                "prob_home": 0.46,
                "prob_draw": 0.27,
                "prob_away": 0.27,
                "lambda_home": 1.2,
                "lambda_away": 1.1,
            }
        ]
    )

    table = build_season_game_table(
        fixtures=fixtures,
        odds=odds,
        completed_predictions=completed_predictions,
        upcoming_predictions=pd.DataFrame(),
        season=2026,
        model_version="v1",
        model_family="dixon_coles",
    )

    row = table.iloc[0]
    assert row["probability_pick"] == "home"
    assert row["model_pick"] == "draw"
    assert row["model_pick_market"] == "1x2"
    assert row["model_pick_odds"] == 4.80
    assert row["model_pick_expected_value"] == pytest.approx(0.296)
    assert bool(row["model_pick_correct"]) is True
    assert row["model_pick_reason"] == "positive_ev"


def test_build_season_game_table_selects_best_positive_ev_total_pick() -> None:
    fixtures = pd.DataFrame(
        [
            {
                "match_id": "total-value",
                "season": 2026,
                "match_date": "2026-05-10",
                "match_status": "completed",
                "home_team": "Home",
                "away_team": "Away",
                "home_goals_90": 2,
                "away_goals_90": 1,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "total-value",
                "timestamp": "2026-05-10T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "home_odds": 1.80,
                "draw_odds": 3.70,
                "away_odds": 4.60,
                "source_type": "close",
            },
            {
                "match_id": "total-value",
                "timestamp": "2026-05-10T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 2.20,
                "under_odds": 1.74,
                "source_type": "close",
            },
        ]
    )
    completed_predictions = pd.DataFrame(
        [
            {
                "match_id": "total-value",
                "prob_home": 0.49,
                "prob_draw": 0.26,
                "prob_away": 0.25,
                "lambda_home": 1.5,
                "lambda_away": 1.2,
                "prob_over_2.5": 0.55,
            }
        ]
    )

    table = build_season_game_table(
        fixtures=fixtures,
        odds=odds,
        completed_predictions=completed_predictions,
        upcoming_predictions=pd.DataFrame(),
        season=2026,
        model_version="v1",
        model_family="dixon_coles",
    )

    row = table.iloc[0]
    assert row["model_pick"] == "over"
    assert row["model_pick_market"] == "total"
    assert row["model_pick_line"] == 2.5
    assert row["model_pick_expected_value"] == pytest.approx(0.21)
    assert bool(row["model_pick_correct"]) is True


def test_build_season_game_table_respects_total_side_rules_for_ev_pick() -> None:
    fixtures = pd.DataFrame(
        [
            {
                "match_id": "under-bias",
                "season": 2026,
                "match_date": "2026-05-10",
                "match_status": "completed",
                "home_team": "Home",
                "away_team": "Away",
                "home_goals_90": 2,
                "away_goals_90": 1,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "under-bias",
                "timestamp": "2026-05-10T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 1.80,
                "under_odds": 2.20,
                "source_type": "close",
            }
        ]
    )
    completed_predictions = pd.DataFrame(
        [
            {
                "match_id": "under-bias",
                "prob_home": 0.40,
                "prob_draw": 0.30,
                "prob_away": 0.30,
                "lambda_home": 1.2,
                "lambda_away": 1.0,
                "prob_over_2.5": 0.30,
            }
        ]
    )

    table = build_season_game_table(
        fixtures=fixtures,
        odds=odds,
        completed_predictions=completed_predictions,
        upcoming_predictions=pd.DataFrame(),
        season=2026,
        model_version="v1",
        model_family="dixon_coles",
        selection_config=BetSelectionConfig(total_allowed_sides=("over",), total_min_edge=0.01),
    )

    row = table.iloc[0]
    assert row["model_pick"] is None or pd.isna(row["model_pick"])
    assert row["model_pick_reason"] == "no_eligible_ev_after_market_rules"


def test_build_season_game_table_respects_disabled_total_market() -> None:
    fixtures = pd.DataFrame(
        [
            {
                "match_id": "disabled-total",
                "season": 2026,
                "match_date": "2026-05-10",
                "match_status": "completed",
                "home_team": "Home",
                "away_team": "Away",
                "home_goals_90": 3,
                "away_goals_90": 1,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "disabled-total",
                "timestamp": "2026-05-10T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "total",
                "line": 2.5,
                "over_odds": 2.20,
                "under_odds": 1.75,
                "source_type": "close",
            }
        ]
    )
    completed_predictions = pd.DataFrame(
        [
            {
                "match_id": "disabled-total",
                "prob_home": 0.40,
                "prob_draw": 0.30,
                "prob_away": 0.30,
                "lambda_home": 1.7,
                "lambda_away": 1.3,
                "prob_over_2.5": 0.60,
            }
        ]
    )

    table = build_season_game_table(
        fixtures=fixtures,
        odds=odds,
        completed_predictions=completed_predictions,
        upcoming_predictions=pd.DataFrame(),
        season=2026,
        model_version="v1",
        model_family="dixon_coles",
        selection_config=BetSelectionConfig(total_enabled=False, total_min_edge=0.01),
    )

    row = table.iloc[0]
    assert row["model_pick"] is None or pd.isna(row["model_pick"])
    assert row["model_pick_reason"] == "no_eligible_ev_after_market_rules"


def test_write_database_creates_main_odds_and_metadata_tables(tmp_path) -> None:
    main_table = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-05-03",
                "home_team": "Home",
                "away_team": "Away",
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "timestamp": "2026-05-03T20:00:00Z",
                "sportsbook": "OddsPortalAvg",
                "market_type": "1x2",
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.8,
                "source_type": "close",
            }
        ]
    )
    output = tmp_path / "season.sqlite"

    write_database(
        main_table=main_table,
        odds=odds,
        output_path=output,
        metadata={"season": 2026, "fixture_count": 1},
    )

    with sqlite3.connect(output) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        assert {MAIN_TABLE, ODDS_TABLE, METADATA_TABLE}.issubset(tables)
        assert conn.execute(f"SELECT COUNT(*) FROM {MAIN_TABLE}").fetchone()[0] == 1
        assert conn.execute(f"SELECT COUNT(*) FROM {ODDS_TABLE}").fetchone()[0] == 3
