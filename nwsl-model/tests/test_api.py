"""Tests for the FastAPI prediction model server."""

from __future__ import annotations

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


@pytest.fixture(autouse=True)
def _patch_load_model():
    """Patch load_model to return a FakeModel without touching the filesystem."""
    with patch("api.deps.load_model", return_value=FakeModel()) as mock:
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
        assert resp.status_code == 403  # HTTPBearer returns 403 when header absent

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
        assert resp.status_code == 403


# ---------- /backtest-summary ----------


class TestBacktestSummary:
    def test_backtest_summary_no_file(self, client: TestClient) -> None:
        with patch("api.main.PROJECT_ROOT", Path("/tmp/nonexistent_dir")):
            resp = client.get("/backtest-summary", headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert "No backtest summary found" in data["message"]

    def test_backtest_summary_requires_auth(self, client: TestClient) -> None:
        resp = client.get("/backtest-summary")
        assert resp.status_code == 403


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
        assert resp.status_code == 403


# ---------- Auth edge cases ----------


class TestAuthEdgeCases:
    def test_no_secret_configured(self, client: TestClient) -> None:
        """If PREDICTION_API_SECRET is empty, the server should 500."""
        with patch.dict(os.environ, {"PREDICTION_API_SECRET": ""}):
            payload = {"home_team": "A", "away_team": "B"}
            resp = client.post("/predict", json=payload, headers=AUTH_HEADER)
            assert resp.status_code == 500
