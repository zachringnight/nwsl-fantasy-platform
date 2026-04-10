"""Tests for the FastAPI prediction model server."""

from __future__ import annotations

import json
import os
import pickle
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

# Set the secret before importing the app
os.environ["PREDICTION_API_SECRET"] = "test-secret-token"


@dataclass
class FakePredictionResult:
    """Minimal stand-in for PredictionResult from the real model."""

    match_id: str = ""
    home_team: str = ""
    away_team: str = ""
    lambda_home: float = 1.5
    lambda_away: float = 1.0
    score_matrix: Any = None
    home_win_prob: float = 0.45
    draw_prob: float = 0.25
    away_win_prob: float = 0.30
    metadata: dict = field(default_factory=lambda: {"model": "fake"})

    def __post_init__(self) -> None:
        if self.score_matrix is None:
            # Build a small 3x3 score matrix for testing
            self.score_matrix = np.array(
                [
                    [0.10, 0.08, 0.02],
                    [0.15, 0.12, 0.05],
                    [0.10, 0.08, 0.03],
                ],
                dtype=np.float64,
            )
            # Normalize
            self.score_matrix /= self.score_matrix.sum()


class FakeModel:
    """Fake model that returns a fixed PredictionResult."""

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: float | None = None,
        contextual_features: dict | None = None,
    ) -> FakePredictionResult:
        return FakePredictionResult(home_team=home_team, away_team=away_team)


class FakeContextProvider:
    def for_match(self, home_team: str, away_team: str, match_date: object | None = None) -> dict[str, float]:
        return {"rest_diff": 0.0}


@dataclass
class FakeModelBundle:
    model: Any = field(default_factory=FakeModel)
    context_provider: Any = field(default_factory=FakeContextProvider)
    model_family: str = "dixon_coles"
    version: str = "test-version"
    blended: bool = False
    gating_status: str = "passed"
    metadata: dict = field(default_factory=lambda: {"alias": "champion_pure"})


@pytest.fixture(autouse=True)
def _patch_load_model_bundle():
    """Patch champion artifact loading so API tests stay isolated from disk."""
    with patch("api.main.load_model_bundle", return_value=FakeModelBundle()) as mock:
        yield mock


@pytest.fixture()
def client():
    from api.main import app

    return TestClient(app)


AUTH_HEADER = {"Authorization": "Bearer test-secret-token"}
BAD_AUTH_HEADER = {"Authorization": "Bearer wrong-token"}


# ---------- /health ----------


class TestHealth:
    def test_health_returns_ok(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "models_available" in data

    def test_health_no_auth_required(self, client: TestClient) -> None:
        # No Authorization header at all
        resp = client.get("/health")
        assert resp.status_code == 200


# ---------- /predict ----------


class TestPredict:
    def test_predict_success(self, client: TestClient) -> None:
        payload = {
            "home_team": "Portland Thorns",
            "away_team": "OL Reign",
            "model": "dixon_coles",
        }
        resp = client.post("/predict", json=payload, headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert "home_win_prob" in data
        assert "draw_prob" in data
        assert "away_win_prob" in data
        assert "lambda_home" in data
        assert "lambda_away" in data
        assert "projected_home_goals" in data
        assert "projected_away_goals" in data
        assert "score_matrix" in data
        assert "fair_odds" in data
        assert "totals" in data
        assert "projection_quality" in data
        assert data["model_version"] == "test-version"
        assert data["model_family"] == "dixon_coles"
        assert data["gating_status"] == "passed"
        assert data["projection_quality"]["confidence_band"] in {"low", "medium", "high"}
        assert isinstance(data["score_matrix"], list)
        assert isinstance(data["score_matrix"][0], list)
        # Probabilities should sum close to 1
        total = data["home_win_prob"] + data["draw_prob"] + data["away_win_prob"]
        assert 0.99 <= total <= 1.01

    def test_predict_projected_scoreline(self, client: TestClient) -> None:
        payload = {
            "home_team": "Portland Thorns",
            "away_team": "OL Reign",
        }
        resp = client.post("/predict", json=payload, headers=AUTH_HEADER)
        data = resp.json()
        # projected goals should be non-negative integers
        assert data["projected_home_goals"] >= 0
        assert data["projected_away_goals"] >= 0

    def test_predict_lambda_is_expected_value(self, client: TestClient) -> None:
        payload = {
            "home_team": "Portland Thorns",
            "away_team": "OL Reign",
        }
        resp = client.post("/predict", json=payload, headers=AUTH_HEADER)
        data = resp.json()
        matrix = np.array(data["score_matrix"])
        goals_range = np.arange(matrix.shape[0], dtype=np.float64)
        expected_home = float(np.dot(goals_range, matrix.sum(axis=1)))
        expected_away = float(np.dot(goals_range, matrix.sum(axis=0)))
        assert abs(data["lambda_home"] - expected_home) < 1e-6
        assert abs(data["lambda_away"] - expected_away) < 1e-6

    def test_predict_missing_auth(self, client: TestClient) -> None:
        payload = {"home_team": "A", "away_team": "B"}
        resp = client.post("/predict", json=payload)
        assert resp.status_code == 401

    def test_predict_wrong_token(self, client: TestClient) -> None:
        payload = {"home_team": "A", "away_team": "B"}
        resp = client.post("/predict", json=payload, headers=BAD_AUTH_HEADER)
        assert resp.status_code == 401

    def test_predict_missing_body(self, client: TestClient) -> None:
        resp = client.post("/predict", json={}, headers=AUTH_HEADER)
        assert resp.status_code == 422  # validation error


# ---------- /batch-predict ----------


class TestBatchPredict:
    def test_batch_predict_success(self, client: TestClient) -> None:
        payload = {
            "matches": [
                {"home_team": "Portland Thorns", "away_team": "OL Reign"},
                {"home_team": "Kansas City Current", "away_team": "Chicago Red Stars"},
            ]
        }
        resp = client.post("/batch-predict", json=payload, headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["predictions"]) == 2

    def test_batch_predict_empty(self, client: TestClient) -> None:
        payload = {"matches": []}
        resp = client.post("/batch-predict", json=payload, headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["predictions"]) == 0

    def test_batch_predict_requires_auth(self, client: TestClient) -> None:
        payload = {"matches": []}
        resp = client.post("/batch-predict", json=payload)
        assert resp.status_code == 401


# ---------- /backtest-summary ----------


class TestBacktestSummary:
    def test_backtest_summary_no_file(self, client: TestClient) -> None:
        with patch("api.main.PROJECT_ROOT", Path("/tmp/nonexistent_dir")):
            resp = client.get("/backtest-summary", headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert "No promoted artifact summary found" in data["message"]

    def test_backtest_summary_reads_promoted_bundle(self, client: TestClient, tmp_path: Path) -> None:
        version_dir = tmp_path / "data" / "processed" / "models" / "v1"
        version_dir.mkdir(parents=True)
        (version_dir / "backtest_summary.json").write_text(
            json.dumps(
                {
                    "models": {
                        "dixon_coles": {"brier_score_1x2": 0.19, "log_loss_1x2": 0.64},
                    },
                    "report_summary": {"metrics_comparison": [{"n_matches": 123}]},
                }
            )
        )
        (version_dir / "promotion_summary.json").write_text(
            json.dumps(
                {
                    "gate_results": {
                        "dixon_coles": {"passed": True, "gating_status": "passed"},
                    }
                }
            )
        )
        (version_dir / "evaluation_summary.json").write_text(
            json.dumps(
                {
                    "models": {
                        "dixon_coles": {
                            "classwise_ece": {"home": 0.03, "draw": 0.04, "away": 0.04},
                        }
                    }
                }
            )
        )
        (version_dir / "dataset_manifest.json").write_text(
            json.dumps(
                {
                    "odds_quality": {
                        "source_available": True,
                        "close_coverage_pct": {"1x2": 88.0, "total": 86.0},
                    }
                }
            )
        )

        registry = {
            "aliases": {
                "champion_pure": {
                    "version": "v1",
                    "model_family": "dixon_coles",
                    "gating_status": "passed",
                    "blended": False,
                }
            }
        }
        with patch("api.main.PROJECT_ROOT", tmp_path):
            with patch("api.main.load_champion_registry", return_value=registry):
                resp = client.get("/backtest-summary", headers=AUTH_HEADER)

        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == "v1"
        assert data["n_matches"] == 123
        assert data["gate_results"]["dixon_coles"]["passed"] is True
        assert data["readiness"]["pure_model_passed"] is True
        assert data["odds_quality"]["close_coverage_pct"]["1x2"] == 88.0

    def test_backtest_summary_labels_latest_research_bundle_when_no_champion(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        version_dir = tmp_path / "data" / "processed" / "models" / "v2"
        backtest_dir = version_dir / "backtest"
        backtest_dir.mkdir(parents=True)
        (backtest_dir / "predictions_home_field_baseline.csv").write_text(
            "match_id,prob_home\n1,0.44\n2,0.41\n"
        )
        (version_dir / "backtest_summary.json").write_text(
            json.dumps(
                {
                    "models": {
                        "home_field_baseline": {
                            "brier_score_1x2": 0.64,
                            "log_loss_1x2": 1.06,
                        }
                    },
                    "report_summary": {"metrics_comparison": [{"model": "home_field_baseline"}]},
                }
            )
        )
        (version_dir / "promotion_summary.json").write_text(
            json.dumps({"gate_results": {}})
        )

        with patch("api.main.PROJECT_ROOT", tmp_path):
            with patch("api.main.load_champion_registry", return_value={"aliases": {}}):
                resp = client.get("/backtest-summary", headers=AUTH_HEADER)

        assert resp.status_code == 200
        data = resp.json()
        assert data["n_matches"] == 2
        assert data["readiness"]["has_promoted_pure"] is False
        assert data["readiness"]["fallback_model_family"] == "home_field_baseline"
        assert "latest research artifact bundle" in data["message"]

    def test_backtest_summary_requires_auth(self, client: TestClient) -> None:
        resp = client.get("/backtest-summary")
        assert resp.status_code == 401


# ---------- /retrain ----------


class TestRetrain:
    def test_retrain_success(self, client: TestClient) -> None:
        mock_result = type(
            "CompletedProcess", (), {"returncode": 0, "stdout": "ok", "stderr": ""}
        )()
        with patch("api.main.subprocess.run", return_value=mock_result):
            with patch("api.main.clear_model_cache") as mock_clear:
                resp = client.post(
                    "/retrain",
                    json={"model": "dixon_coles"},
                    headers=AUTH_HEADER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        mock_clear.assert_called_once()

    def test_retrain_failure(self, client: TestClient) -> None:
        mock_result = type(
            "CompletedProcess",
            (),
            {"returncode": 1, "stdout": "", "stderr": "Training error"},
        )()
        with patch("api.main.subprocess.run", return_value=mock_result):
            with patch("api.main.clear_model_cache"):
                resp = client.post(
                    "/retrain",
                    json={"model": "all"},
                    headers=AUTH_HEADER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["returncode"] == 1

    def test_retrain_requires_auth(self, client: TestClient) -> None:
        resp = client.post("/retrain", json={})
        assert resp.status_code == 401


# ---------- Auth edge cases ----------


class TestAuthEdgeCases:
    def test_no_secret_configured(self, client: TestClient) -> None:
        """If PREDICTION_API_SECRET is empty, the server should 500."""
        with patch.dict(os.environ, {"PREDICTION_API_SECRET": ""}):
            payload = {"home_team": "A", "away_team": "B"}
            resp = client.post("/predict", json=payload, headers=AUTH_HEADER)
            assert resp.status_code == 500
