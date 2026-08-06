from __future__ import annotations

import pandas as pd

from src.data.xg_enrichment import (
    enrich_matches_with_asa_xg,
    summarize_asa_xg_coverage,
)


def test_enrich_matches_with_asa_xg_matches_team_aliases() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "San Diego Wave FC",
                "away_team": "Kansas City Current",
                "home_goals_90": 1,
                "away_goals_90": 0,
            }
        ]
    )
    asa = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_date": "2026-04-01",
                "home_team": "SD Wave",
                "away_team": "Current",
                "home_xg": 1.42,
                "away_xg": 0.77,
                "home_xg_players": 1.4,
                "away_xg_players": 0.8,
            }
        ]
    )

    enriched = enrich_matches_with_asa_xg(matches, asa)

    assert enriched.loc[0, "home_xg"] == 1.42
    assert enriched.loc[0, "away_xg"] == 0.77
    # This ASA fixture predates the penalty split and carries no npxG. Total xG
    # must not stand in for it, so npxG stays null.
    assert pd.isna(enriched.loc[0, "home_npxg"])
    assert pd.isna(enriched.loc[0, "away_npxg"])


def test_enrich_matches_with_asa_xg_preserves_existing_values() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 1,
                "away_goals_90": 0,
                "home_xg": 2.0,
                "away_xg": 0.5,
                "home_npxg": 1.9,
                "away_npxg": 0.4,
            }
        ]
    )
    asa = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_date": "2026-04-01",
                "home_team": "Orlando Pride",
                "away_team": "Bay",
                "home_xg": 1.42,
                "away_xg": 0.77,
            }
        ]
    )

    enriched = enrich_matches_with_asa_xg(matches, asa)

    assert enriched.loc[0, "home_xg"] == 2.0
    assert enriched.loc[0, "away_xg"] == 0.5
    assert enriched.loc[0, "home_npxg"] == 1.9
    assert enriched.loc[0, "away_npxg"] == 0.4


def test_asa_coverage_lists_every_goals_fallback_match_id() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "covered",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "San Diego Wave FC",
                "away_team": "Kansas City Current",
            },
            {
                "match_id": "fallback",
                "match_date": "2026-04-02",
                "season": 2026,
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
            },
        ]
    )
    asa = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_date": "2026-04-01",
                "home_team": "SD Wave",
                "away_team": "Current",
                "home_xg": 1.4,
                "away_xg": 0.8,
            }
        ]
    )

    coverage = summarize_asa_xg_coverage(matches, asa)

    assert coverage["fallback_match_ids"] == ["fallback"]
    assert coverage["seasons"]["2026"] == {
        "covered_matches": 1,
        "reference_matches": 2,
        "coverage_pct": 50.0,
        "fallback_match_ids": ["fallback"],
    }


def test_enrichment_prefers_asa_npxg_over_total_xg() -> None:
    """npxG must come from the penalty-adjusted column, not total xG.

    Copying total xG into npxG inflates every scoring rate by the league's
    penalty share, which is the bias this column exists to avoid.
    """
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": "2026-04-01",
                "season": 2026,
                "home_team": "San Diego Wave FC",
                "away_team": "Kansas City Current",
                "home_goals_90": 1,
                "away_goals_90": 0,
            }
        ]
    )
    asa = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_date": "2026-04-01",
                "home_team": "SD Wave",
                "away_team": "Current",
                "home_xg": 1.42,
                "away_xg": 0.77,
                "home_npxg": 0.66,
                "away_npxg": 0.77,
                "home_xg_players": 1.4,
                "away_xg_players": 0.8,
            }
        ]
    )

    enriched = enrich_matches_with_asa_xg(matches, asa)

    row = enriched.iloc[0]
    assert row["home_npxg"] == 0.66
    assert row["home_xg"] == 1.42
