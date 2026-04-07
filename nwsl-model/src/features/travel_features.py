"""Travel distance and timezone features."""

from __future__ import annotations

import logging
import math
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("nwsl_model.features.travel_features")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance between two points in km."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def compute_travel_distance(
    matches: pd.DataFrame,
    venues: Optional[pd.DataFrame],
) -> pd.DataFrame:
    """Compute travel distance for each team to the match venue.

    Home team travel is 0 (playing at home).
    Away team travel is the distance from their home stadium to the match venue.
    """
    df = matches.copy()
    df["home_travel_km"] = 0.0
    df["away_travel_km"] = np.nan

    if venues is None or venues.empty:
        logger.warning("No venue data available. Skipping travel features.")
        df["away_travel_km"] = 0.0
        return df

    venue_map = venues.set_index("team")[["stadium_lat", "stadium_lon"]].to_dict("index")

    distances = []
    for _, row in df.iterrows():
        home_info = venue_map.get(row["home_team"])
        away_info = venue_map.get(row["away_team"])
        if home_info and away_info:
            dist = haversine_km(
                away_info["stadium_lat"], away_info["stadium_lon"],
                home_info["stadium_lat"], home_info["stadium_lon"],
            )
            distances.append(dist)
        else:
            distances.append(np.nan)

    df["away_travel_km"] = distances
    df["travel_diff_km"] = df["away_travel_km"] - df["home_travel_km"]

    return df
