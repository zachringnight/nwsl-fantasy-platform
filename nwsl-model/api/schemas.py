"""Pydantic request/response models for the prediction API."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    """Request body for /predict endpoint."""

    home_team: str = Field(..., description="Home team name")
    away_team: str = Field(..., description="Away team name")
    match_date: date | None = Field(default=None, description="Optional fixture date for rest-context features")
    contextual_features: dict[str, float] | None = Field(
        default=None,
        description="Optional explicit contextual overrides for the score model",
    )
    model: str = Field(
        default="champion_pure",
        description="Champion alias or raw model family to use",
    )


class OutcomePrice(BaseModel):
    probability: float
    fair_odds: float


class MatchFairOdds(BaseModel):
    home: OutcomePrice
    draw: OutcomePrice
    away: OutcomePrice


class TotalsMarket(BaseModel):
    line: float
    over_probability: float
    under_probability: float
    over_fair_odds: float
    under_fair_odds: float


class ProjectionQuality(BaseModel):
    confidence_score: float
    confidence_band: str
    data_quality_score: float
    data_quality_band: str
    uncertainty: float
    calibration_applied: bool
    notes: list[str]


class PredictResponse(BaseModel):
    """Response body for /predict endpoint."""

    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    lambda_home: float
    lambda_away: float
    projected_home_goals: int
    projected_away_goals: int
    fair_odds: MatchFairOdds
    totals: list[TotalsMarket]
    btts_yes_prob: float
    btts_yes_fair_odds: float
    model_version: str
    model_family: str
    blended: bool
    gating_status: str
    projection_quality: ProjectionQuality
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

    version: str | None = None
    n_matches: int = 0
    brier_score: float | None = None
    log_loss: float | None = None
    calibration: dict | None = None
    models: dict | None = None
    champions: dict | None = None
    gate_results: dict | None = None
    readiness: dict | None = None
    odds_quality: dict | None = None
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
