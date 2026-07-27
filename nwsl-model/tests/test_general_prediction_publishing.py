from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from src.publishing.general_predictions import build_general_prediction_payload


NOW = datetime(2026, 7, 27, 18, 0, tzinfo=timezone.utc)


def _training_summary() -> dict:
    return {
        "version": "20260727T180000Z",
        "serving_model_family": "spi_lite_baseline",
        "training_cutoff": "2026-07-27",
        "source_manifest_generated_at": "2026-07-27T17:55:00Z",
        "generated_at": "2026-07-27T18:00:00Z",
        "gating_status": "current",
        "feature_status": "complete",
    }


def _predictions() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": "completed-1",
                "match_date": "2026-07-27",
                "home_team": "Old Home",
                "away_team": "Old Away",
                "model_version": "20260727T180000Z",
                "model_family": "spi_lite_baseline",
                "prob_home": 0.4,
                "prob_draw": 0.3,
                "prob_away": 0.3,
                "lambda_home": 1.2,
                "lambda_away": 1.0,
                "btts_yes_prob": 0.5,
                "prob_over_2.5": 0.48,
                "prob_under_2.5": 0.52,
            },
            {
                "match_id": "upcoming-1",
                "match_date": "2026-07-30",
                "home_team": "New Home",
                "away_team": "New Away",
                "model_version": "20260727T180000Z",
                "model_family": "spi_lite_baseline",
                "prob_home": 0.45,
                "prob_draw": 0.28,
                "prob_away": 0.27,
                "lambda_home": 1.6,
                "lambda_away": 1.1,
                "btts_yes_prob": 0.51,
                "prob_over_2.5": 0.52,
                "prob_under_2.5": 0.48,
            },
        ]
    )


def _quality() -> dict:
    return {
        "status": "ready",
        "feature_status": "complete",
        "coverage": {
            "completed_appearance_matches": {
                "covered_matches": 127,
                "reference_matches": 127,
                "missing_match_ids": [],
            },
            "upcoming_projected_lineup_matches": {
                "covered_matches": 1,
                "reference_matches": 1,
                "missing_match_ids": [],
            },
        },
    }


def test_payload_excludes_completed_rows_and_records_lineage() -> None:
    payload = build_general_prediction_payload(
        predictions=_predictions(),
        training_summary=_training_summary(),
        completed=pd.DataFrame(
            [{"match_id": "completed-1", "match_date": "2026-07-27"}]
        ),
        upcoming=pd.DataFrame(
            [{"match_id": "upcoming-1", "match_date": "2026-07-30"}]
        ),
        quality=_quality(),
        now=NOW,
    )

    assert payload["run"]["runKey"] == "nwsl-general:20260727T180000Z"
    assert payload["run"]["trainingCutoff"] == "2026-07-27"
    assert payload["run"]["sourceManifestGeneratedAt"] == "2026-07-27T17:55:00Z"
    assert payload["run"]["rowCount"] == 1
    assert [row["matchId"] for row in payload["predictions"]] == ["upcoming-1"]


def test_payload_fails_on_completed_upcoming_overlap() -> None:
    with pytest.raises(ValueError, match="completed and upcoming match IDs overlap"):
        build_general_prediction_payload(
            predictions=_predictions(),
            training_summary=_training_summary(),
            completed=pd.DataFrame([{"match_id": "upcoming-1"}]),
            upcoming=pd.DataFrame([{"match_id": "upcoming-1"}]),
            quality=_quality(),
            now=NOW,
        )


def test_payload_requires_predictions_from_the_selected_artifact() -> None:
    predictions = _predictions()
    predictions.loc[
        predictions["match_id"].eq("upcoming-1"), "model_version"
    ] = "old-version"

    with pytest.raises(ValueError, match="does not match the selected artifact"):
        build_general_prediction_payload(
            predictions=predictions,
            training_summary=_training_summary(),
            completed=pd.DataFrame([{"match_id": "completed-1"}]),
            upcoming=pd.DataFrame([{"match_id": "upcoming-1"}]),
            quality=_quality(),
            now=NOW,
        )
