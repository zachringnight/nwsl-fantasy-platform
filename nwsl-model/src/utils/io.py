"""I/O utility functions."""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


def load_config(path: str | Path) -> dict[str, Any]:
    """Load a YAML config file."""
    path = Path(path)
    with open(path) as f:
        return yaml.safe_load(f)


def load_csv(path: str | Path, **kwargs: Any) -> pd.DataFrame:
    """Load a CSV file into a DataFrame."""
    return pd.read_csv(path, **kwargs)


def load_parquet(path: str | Path, **kwargs: Any) -> pd.DataFrame:
    """Load a Parquet file into a DataFrame."""
    return pd.read_parquet(path, **kwargs)


def save_csv(df: pd.DataFrame, path: str | Path, **kwargs: Any) -> None:
    """Save a DataFrame to CSV."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, **kwargs)


def save_parquet(df: pd.DataFrame, path: str | Path, **kwargs: Any) -> None:
    """Save a DataFrame to Parquet."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False, **kwargs)


def save_pickle(obj: Any, path: str | Path) -> None:
    """Pickle an object to disk."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(obj, f)


def load_pickle(path: str | Path) -> Any:
    """Load a pickled object."""
    with open(path, "rb") as f:
        return pickle.load(f)


def save_json(obj: Any, path: str | Path) -> None:
    """Save object as JSON."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, default=str)


def load_json(path: str | Path) -> Any:
    """Load a JSON file."""
    with open(path) as f:
        return json.load(f)
