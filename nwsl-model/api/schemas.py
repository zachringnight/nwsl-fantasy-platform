"""Pydantic request/response models for the prediction API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    """Request body for /predict endpoint."""

    home_team: str = Field(..., description="Home team name")
    away_team: str = Field(..., description="Away team name")
    model: str = Field(
        default="dixon_coles",
        description="Model to use: 'dixon_coles' or 'bivariate_poisson'",
    )


class PredictResponse(BaseModel):
    """Response body for /predict endpoint."""

    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    lambda_home: float
    lambda_away: float
    projected_home_goals: int
    projected_away_goals: int
    score_matrix: list[list[float]]
    metadata: dict | None = None


class BatchPredictRequest(BaseModel):
    """Request body for /batch-predict endpoint."""

    matches: list[PredictRequest]


class BatchPredictResponse(BaseModel):
    """Response body for /batch-predict endpoint."""

    predictions: list[PredictResponse]


class BacktestSummary(BaseModel):
    """Response body for /backtest-summary endpoint."""

    n_matches: int = 0
    brier_score: float | None = None
    log_loss: float | None = None
    calibration: dict | None = None
    message: str = ""


class RetrainRequest(BaseModel):
    """Request body for /retrain endpoint."""

    model: str = Field(
        default="all",
        description="Model to retrain: 'dixon_coles', 'bivariate_poisson', or 'all'",
    )
    config: str = Field(
        default="configs/default.yaml",
        description="Path to config file",
    )


class RetrainResponse(BaseModel):
    """Response body for /retrain endpoint."""

    success: bool
    message: str
    returncode: int = 0


class HealthResponse(BaseModel):
    """Response body for /health endpoint."""

    status: str
    models_available: list[str]
