"""Dependency injection: model loading and authentication."""

from __future__ import annotations

import hmac
import os
import pickle
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.models.baseline import ProjectionBaselineModel
from src.utils.artifacts import ARTIFACT_ROOT, available_model_names, resolve_model_artifact
from src.utils.io import load_json

MODEL_DIR = ARTIFACT_ROOT

security = HTTPBearer(auto_error=False)


@dataclass
class ModelBundle:
    model: Any
    context_provider: Any | None
    model_family: str
    evaluation_model: str
    version: str
    blended: bool
    gating_status: str
    calibration: dict[str, Any] | None
    metadata: dict[str, Any]


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    """Validate Bearer token against PREDICTION_API_SECRET env var.

    Uses hmac.compare_digest for timing-safe comparison.
    """
    expected = os.environ.get("PREDICTION_API_SECRET", "")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PREDICTION_API_SECRET is not configured",
        )
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    if not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    return credentials.credentials


@lru_cache(maxsize=8)
def load_model_bundle(model_name: str) -> ModelBundle:
    """Load a trained model bundle from disk, resolving champion aliases first."""
    try:
        artifact = resolve_model_artifact(model_name, MODEL_DIR)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    context_provider = None
    context_provider_path = artifact["version_dir"] / "context_provider.pkl"
    if context_provider_path.exists():
        with open(context_provider_path, "rb") as f:
            context_provider = pickle.load(f)

    ratings_model = None
    ratings_path = artifact["version_dir"] / "team_ratings.pkl"
    if ratings_path.exists():
        with open(ratings_path, "rb") as f:
            ratings_model = pickle.load(f)

    if artifact.get("kind") in {"baseline_fallback", "baseline_promoted"}:
        # Mirror scripts/predict.py::_load_model_stack: without the trained
        # league rates, this falls back to SpiLiteBaseline's hardcoded
        # defaults (1.25/1.05), which can disagree with the rates the
        # artifact actually passed its promotion gates with.
        league_home_rate = None
        league_away_rate = None
        spi_summary_path = artifact["version_dir"] / "spi_lite_summary.json"
        if spi_summary_path.exists():
            spi_summary = load_json(spi_summary_path)
            league_home_rate = spi_summary.get("league_home_rate")
            league_away_rate = spi_summary.get("league_away_rate")
        model = ProjectionBaselineModel(
            strategy=str(artifact["model_family"]),
            ratings_model=ratings_model,
            league_home_rate=league_home_rate,
            league_away_rate=league_away_rate,
        )
    else:
        model_path = artifact["version_dir"] / f"{artifact['model_family']}_model.pkl"
        if not model_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model file not found: {model_path}. Run train.py first.",
            )

        with open(model_path, "rb") as f:
            model = pickle.load(f)

    calibration = None
    evaluation_model = str(artifact.get("evaluation_model", artifact["model_family"]))
    calibration_path = artifact["version_dir"] / "calibration_artifacts.json"
    if calibration_path.exists():
        calibration_payload = load_json(calibration_path)
        calibration = calibration_payload.get("models", {}).get(evaluation_model)

    return ModelBundle(
        model=model,
        context_provider=context_provider,
        model_family=artifact["model_family"],
        evaluation_model=evaluation_model,
        version=artifact["version"],
        blended=bool(artifact.get("blended", False)),
        gating_status=str(artifact.get("gating_status", "unknown")),
        calibration=calibration,
        metadata=dict(artifact.get("metadata", {})),
    )


def load_model(model_name: str) -> Any:
    """Compatibility helper returning only the score model object."""
    return load_model_bundle(model_name).model


def clear_model_cache() -> None:
    """Clear the lru_cache so models are reloaded on next request."""
    load_model_bundle.cache_clear()


def available_models() -> list[str]:
    """Return available champion aliases and raw model families."""
    return available_model_names(MODEL_DIR)
