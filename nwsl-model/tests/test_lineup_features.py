import pandas as pd

from src.features.lineup_features import compute_projected_lineup_delta


def test_projected_lineup_delta_ignores_post_match_reports() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "match_date": pd.Timestamp("2026-05-24").date(),
                "home_team": "Bay FC",
                "away_team": "Utah Royals",
            }
        ]
    )
    projected = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "team": "Bay FC",
                "player_id": "p1",
                "projected_start": True,
                "status": "available",
                "report_timestamp": "2026-05-26T00:00:00Z",
            },
            {
                "match_id": "m1",
                "team": "Utah Royals",
                "player_id": "p2",
                "projected_start": True,
                "status": "available",
                "report_timestamp": "2026-05-23T00:00:00Z",
            },
        ]
    )

    output = compute_projected_lineup_delta(matches, projected, player_ratings={"p1": 1.0, "p2": 2.0})

    assert output.loc[0, "home_lineup_strength"] == 0.0
    assert output.loc[0, "away_lineup_strength"] == 2.0
