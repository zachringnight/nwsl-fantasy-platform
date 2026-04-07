"""Dependency injection: model loading and authentication."""

from __future__ import annotations

import hmac
import os
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

MODEL_DIR = Path(__file__).resolve().parent.parent / "data" / "processed" / "models"

security = HTTPBearer()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
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
    if not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    return credentials.credentials


@lru_cache(maxsize=4)
def load_model(model_name: str) -> Any:
    """Load a trained model from disk, cached via lru_cache.

    Args:
        model_name: One of 'dixon_coles' or 'bivariate_poisson'.

    Returns:
        The deserialized model object.

    Raises:
        HTTPException: If the model file is not found.
    """
    model_path = MODEL_DIR / f"{model_name}_model.pkl"
    if not model_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model file not found: {model_path}. Run train.py first.",
        )
    with open(model_path, "rb") as f:
        return pickle.load(f)


def clear_model_cache() -> None:
    """Clear the lru_cache so models are reloaded on next request."""
    load_model.cache_clear()


def available_models() -> list[str]:
    """Return list of model names that have pickle files on disk."""
    if not MODEL_DIR.exists():
        return []
    return [
        p.stem.replace("_model", "")
        for p in MODEL_DIR.glob("*_model.pkl")
    ]
