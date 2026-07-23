from __future__ import annotations

import pandas as pd

from src.data.xg_enrichment import enrich_matches_with_asa_xg


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
    assert enriched.loc[0, "home_npxg"] == 1.42
    assert enriched.loc[0, "away_npxg"] == 0.77


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
