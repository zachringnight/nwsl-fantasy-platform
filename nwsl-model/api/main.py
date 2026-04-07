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
    load_model_bundle,
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
    MatchFairOdds,
    OutcomePrice,
    ProjectionQuality,
    TotalsMarket,
)
from src.betting.market_derivation import derive_all_markets
from src.models.calibration import apply_market_calibration, summarize_projection_quality
from src.utils.artifacts import latest_version_dir, load_champion_registry
from src.utils.io import load_json

app = FastAPI(
    title="NWSL Prediction Model API",
    version="0.1.0",
    description="Prediction server wrapping Dixon-Coles and Bivariate Poisson models.",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _build_prediction_response(
    prediction_result: object,
    bundle: object,
    contextual_features: dict[str, float] | None = None,
) -> PredictResponse:
    """Convert an internal PredictionResult to the API response schema."""
    pred = prediction_result
    matrix = np.asarray(pred.score_matrix)
    bundle_data = bundle

    # Lambda = expected goals = dot(goals_range, marginal)
    goals_range = np.arange(matrix.shape[0], dtype=np.float64)
    marginal_home = matrix.sum(axis=1)
    marginal_away = matrix.sum(axis=0)
    lambda_home = float(np.dot(goals_range, marginal_home))
    lambda_away = float(np.dot(goals_range, marginal_away))

    # Projected scoreline = argmax of score matrix
    flat_idx = int(np.argmax(matrix))
    projected_home_goals, projected_away_goals = divmod(flat_idx, matrix.shape[1])
    markets = derive_all_markets(matrix, match_id=getattr(pred, "match_id", ""))
    calibration_artifact = getattr(bundle_data, "calibration", None)
    if calibration_artifact:
        markets = apply_market_calibration(markets, calibration_artifact)
    totals = []
    for line in [1.5, 2.5, 3.5, 4.5]:
        if line in markets.over_probs:
            totals.append(
                TotalsMarket(
                    line=line,
                    over_probability=float(markets.over_probs[line]),
                    under_probability=float(markets.under_probs[line]),
                    over_fair_odds=float(markets.over_fair_odds[line]),
                    under_fair_odds=float(markets.under_fair_odds[line]),
                )
            )

    response_metadata = dict(pred.metadata) if getattr(pred, "metadata", None) else {}
    if getattr(bundle_data, "metadata", None):
        response_metadata["artifact"] = bundle_data.metadata
    response_metadata["calibration_applied"] = bool(calibration_artifact)
    projection_quality = summarize_projection_quality(
        markets.home_prob,
        markets.draw_prob,
        markets.away_prob,
        contextual_features=contextual_features,
        calibration_applied=bool(calibration_artifact),
    )

    return PredictResponse(
        home_win_prob=float(markets.home_prob),
        draw_prob=float(markets.draw_prob),
        away_win_prob=float(markets.away_prob),
        lambda_home=lambda_home,
        lambda_away=lambda_away,
        projected_home_goals=int(projected_home_goals),
        projected_away_goals=int(projected_away_goals),
        fair_odds=MatchFairOdds(
            home=OutcomePrice(probability=float(markets.home_prob), fair_odds=float(markets.home_fair_odds)),
            draw=OutcomePrice(probability=float(markets.draw_prob), fair_odds=float(markets.draw_fair_odds)),
            away=OutcomePrice(probability=float(markets.away_prob), fair_odds=float(markets.away_fair_odds)),
        ),
        totals=totals,
        btts_yes_prob=float(markets.btts_yes_prob),
        btts_yes_fair_odds=float(markets.btts_yes_fair_odds),
        model_version=str(bundle_data.version),
        model_family=str(bundle_data.model_family),
        blended=bool(bundle_data.blended),
        gating_status=str(bundle_data.gating_status),
        projection_quality=ProjectionQuality(**projection_quality),
        score_matrix=matrix.tolist(),
        metadata=response_metadata if response_metadata else None,
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
    bundle = load_model_bundle(req.model)
    contextual_features = req.contextual_features
    if contextual_features is None and getattr(bundle, "context_provider", None) is not None:
        contextual_features = bundle.context_provider.for_match(
            home_team=req.home_team,
            away_team=req.away_team,
            match_date=req.match_date,
        )
    result = bundle.model.predict_score_matrix(
        home_team=req.home_team,
        away_team=req.away_team,
        contextual_features=contextual_features,
    )
    return _build_prediction_response(result, bundle, contextual_features=contextual_features)


@app.post(
    "/batch-predict",
    response_model=BatchPredictResponse,
    dependencies=[Depends(verify_token)],
)
def batch_predict(req: BatchPredictRequest) -> BatchPredictResponse:
    """Predict match outcome probabilities for multiple matches."""
    predictions = []
    for match in req.matches:
        bundle = load_model_bundle(match.model)
        contextual_features = match.contextual_features
        if contextual_features is None and getattr(bundle, "context_provider", None) is not None:
            contextual_features = bundle.context_provider.for_match(
                home_team=match.home_team,
                away_team=match.away_team,
                match_date=match.match_date,
            )
        result = bundle.model.predict_score_matrix(
            home_team=match.home_team,
            away_team=match.away_team,
            contextual_features=contextual_features,
        )
        predictions.append(_build_prediction_response(result, bundle, contextual_features=contextual_features))
    return BatchPredictResponse(predictions=predictions)


@app.get(
    "/backtest-summary",
    response_model=BacktestSummary,
    dependencies=[Depends(verify_token)],
)
def backtest_summary() -> BacktestSummary:
    """Return the latest backtest summary if available."""
    registry = load_champion_registry()
    pure_alias = registry.get("aliases", {}).get("champion_pure")
    version_dir = None
    if pure_alias:
        version_dir = PROJECT_ROOT / "data" / "processed" / "models" / pure_alias["version"]
    else:
        version_dir = latest_version_dir(PROJECT_ROOT / "data" / "processed" / "models")

    if version_dir is None:
        return BacktestSummary(message="No promoted artifact summary found. Run training, backtest, evaluate, and promote.")

    backtest_path = version_dir / "backtest_summary.json"
    promotion_path = version_dir / "promotion_summary.json"
    evaluation_path = version_dir / "evaluation_summary.json"
    odds_quality_path = version_dir / "odds_quality_report.json"
    dataset_manifest_path = version_dir / "dataset_manifest.json"
    promotion_summary = load_json(promotion_path) if promotion_path.exists() else {}
    evaluation_summary = load_json(evaluation_path) if evaluation_path.exists() else {}
    dataset_manifest = load_json(dataset_manifest_path) if dataset_manifest_path.exists() else {}
    odds_quality = (
        load_json(odds_quality_path)
        if odds_quality_path.exists()
        else dataset_manifest.get("odds_quality")
    )
    if not backtest_path.exists():
        return BacktestSummary(
            version=version_dir.name,
            champions=registry.get("aliases", {}),
            gate_results=promotion_summary.get("gate_results"),
            readiness={
                "has_promoted_pure": pure_alias is not None,
                "has_backtest_summary": False,
                "has_evaluation_summary": evaluation_path.exists(),
                "has_odds_quality_report": bool(odds_quality),
            },
            odds_quality=odds_quality,
            message="No promoted artifact summary found. Run backtest and promotion for this version.",
        )

    data = load_json(backtest_path)
    models = data.get("models", {})
    champion_family = pure_alias.get("model_family") if pure_alias else None
    champion_metrics = models.get(champion_family, {}) if champion_family else {}
    champion_gates = promotion_summary.get("gate_results", {}).get(champion_family, {}) if champion_family else {}
    readiness = {
        "has_promoted_pure": pure_alias is not None,
        "has_backtest_summary": True,
        "has_evaluation_summary": evaluation_path.exists(),
        "has_odds_quality_report": bool(odds_quality),
        "promoted_version": version_dir.name,
        "pure_model_family": champion_family,
        "pure_model_passed": bool(champion_gates.get("passed", False)),
    }

    return BacktestSummary(
        version=version_dir.name,
        n_matches=int(data.get("report_summary", {}).get("metrics_comparison", [{}])[0].get("n_matches", 0))
        if data.get("report_summary", {}).get("metrics_comparison")
        else 0,
        brier_score=champion_metrics.get("brier_score_1x2"),
        log_loss=champion_metrics.get("log_loss_1x2"),
        calibration=evaluation_summary.get("models", {}).get(champion_family) or data.get("report_summary"),
        models=models,
        champions=registry.get("aliases", {}),
        gate_results=promotion_summary.get("gate_results"),
        readiness=readiness,
        odds_quality=odds_quality,
        message="Backtest summary loaded from promoted artifact bundle.",
    )


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
        "--build-dataset",
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
