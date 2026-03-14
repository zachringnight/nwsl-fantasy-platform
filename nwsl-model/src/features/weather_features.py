"""Weather and environment features."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.features.weather_features")


def compute_weather_features(matches: pd.DataFrame) -> pd.DataFrame:
    """Extract and normalize weather features.

    If weather columns are missing or all-null, fills with neutral defaults.
    """
    df = matches.copy()

    weather_cols = {
        "weather_temp_c": 20.0,        # neutral temp
        "weather_wind_kph": 10.0,       # moderate wind
        "weather_precip_mm": 0.0,       # no rain
        "weather_humidity_pct": 50.0,   # moderate humidity
    }

    for col, default in weather_cols.items():
        if col not in df.columns:
            df[col] = default
            logger.info(f"Weather column {col} not found. Using default {default}")
        else:
            df[col] = df[col].fillna(default)

    # Derived features
    df["extreme_heat"] = (df["weather_temp_c"] > 32).astype(int)
    df["extreme_cold"] = (df["weather_temp_c"] < 5).astype(int)
    df["high_wind"] = (df["weather_wind_kph"] > 30).astype(int)
    df["rain"] = (df["weather_precip_mm"] > 1.0).astype(int)

    return df


def compute_surface_features(matches: pd.DataFrame) -> pd.DataFrame:
    """Encode playing surface."""
    df = matches.copy()
    if "surface" not in df.columns:
        df["surface"] = "grass"

    df["surface"] = df["surface"].fillna("grass").str.lower()
    df["is_turf"] = df["surface"].str.contains("turf|artificial", case=False).astype(int)

    return df


def compute_altitude_features(matches: pd.DataFrame) -> pd.DataFrame:
    """Compute altitude feature."""
    df = matches.copy()
    if "altitude_m" not in df.columns:
        df["altitude_m"] = 0.0
    df["altitude_m"] = df["altitude_m"].fillna(0.0)
    df["high_altitude"] = (df["altitude_m"] > 1500).astype(int)
    return df
