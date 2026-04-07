"""FastAPI application for the NWSL prediction model server."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from fastapi import Depends, FastAPI

from api.deps import (
    available_models,
    clear_model_cache,
    load_model,
    verify_token,
)
from api.schemas import (
    BacktestSummary,
    BatchPredictRequest,
    BatchPredictResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
    RetrainRequest,
    RetrainResponse,
)

app = FastAPI(
    title="NWSL Prediction Model API",
    version="0.1.0",
    description="Prediction server wrapping Dixon-Coles and Bivariate Poisson models.",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _build_prediction_response(prediction_result: object) -> PredictResponse:
    """Convert an internal PredictionResult to the API response schema."""
    pred = prediction_result
    matrix = np.asarray(pred.score_matrix)

    # Lambda = expected goals = dot(goals_range, marginal)
    goals_range = np.arange(matrix.shape[0], dtype=np.float64)
    marginal_home = matrix.sum(axis=1)
    marginal_away = matrix.sum(axis=0)
    lambda_home = float(np.dot(goals_range, marginal_home))
    lambda_away = float(np.dot(goals_range, marginal_away))

    # Projected scoreline = argmax of score matrix
    flat_idx = int(np.argmax(matrix))
    projected_home_goals, projected_away_goals = divmod(flat_idx, matrix.shape[1])

    return PredictResponse(
        home_win_prob=float(pred.home_win_prob),
        draw_prob=float(pred.draw_prob),
        away_win_prob=float(pred.away_win_prob),
        lambda_home=lambda_home,
        lambda_away=lambda_away,
        projected_home_goals=int(projected_home_goals),
        projected_away_goals=int(projected_away_goals),
        score_matrix=matrix.tolist(),
        metadata=pred.metadata if pred.metadata else None,
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Health check endpoint (no auth required)."""
    return HealthResponse(
        status="ok",
        models_available=available_models(),
    )


@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(verify_token)])
def predict(req: PredictRequest) -> PredictResponse:
    """Predict match outcome probabilities for a single match."""
    model = load_model(req.model)
    result = model.predict_score_matrix(
        home_team=req.home_team,
        away_team=req.away_team,
    )
    return _build_prediction_response(result)


@app.post(
    "/batch-predict",
    response_model=BatchPredictResponse,
    dependencies=[Depends(verify_token)],
)
def batch_predict(req: BatchPredictRequest) -> BatchPredictResponse:
    """Predict match outcome probabilities for multiple matches."""
    predictions = []
    for match in req.matches:
        model = load_model(match.model)
        result = model.predict_score_matrix(
            home_team=match.home_team,
            away_team=match.away_team,
        )
        predictions.append(_build_prediction_response(result))
    return BatchPredictResponse(predictions=predictions)


@app.get(
    "/backtest-summary",
    response_model=BacktestSummary,
    dependencies=[Depends(verify_token)],
)
def backtest_summary() -> BacktestSummary:
    """Return the latest backtest summary if available."""
    import json

    # Check backtest_results.json first, then fall back to training_summary.json
    backtest_path = PROJECT_ROOT / "data" / "processed" / "backtest_results.json"
    training_path = PROJECT_ROOT / "data" / "processed" / "models" / "training_summary.json"

    if backtest_path.exists():
        with open(backtest_path) as f:
            data = json.load(f)
        return BacktestSummary(
            n_matches=data.get("n_matches", 0),
            brier_score=data.get("brier_score"),
            log_loss=data.get("log_loss"),
            calibration=data.get("calibration"),
            message="Backtest summary loaded from backtest_results.json",
        )

    if training_path.exists():
        with open(training_path) as f:
            data = json.load(f)
        return BacktestSummary(
            n_matches=data.get("n_matches", 0),
            brier_score=data.get("brier_score"),
            log_loss=data.get("log_loss"),
            calibration=data.get("calibration"),
            message="Backtest summary loaded from training_summary.json",
        )

    return BacktestSummary(message="No backtest summary found. Run training first.")


@app.post("/retrain", response_model=RetrainResponse, dependencies=[Depends(verify_token)])
def retrain(req: RetrainRequest) -> RetrainResponse:
    """Retrain models by invoking scripts/train.py as a subprocess."""
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "train.py"),
        "--config",
        req.config,
        "--model",
        req.model,
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
        timeout=600,
    )

    # Clear model cache so next prediction loads the retrained model
    clear_model_cache()

    if result.returncode == 0:
        return RetrainResponse(
            success=True,
            message="Retrain completed successfully.",
            returncode=result.returncode,
        )
    return RetrainResponse(
        success=False,
        message=f"Retrain failed: {result.stderr[:500]}",
        returncode=result.returncode,
    )
