"""Data loading module. Supports CSV and Parquet with graceful degradation."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from src.data.schemas import (
    APPEARANCE_REQUIRED_COLS,
    MATCH_REQUIRED_COLS,
    ODDS_REQUIRED_COLS,
    PROJECTED_LINEUP_REQUIRED_COLS,
    VENUE_REQUIRED_COLS,
    validate_dataframe,
)
from src.utils.io import load_csv, load_parquet

logger = logging.getLogger("nwsl_model.data.loaders")


def _load_file(path: str | Path, fmt: str = "csv", **kwargs: Any) -> pd.DataFrame:
    """Load a file based on format."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {path}")
    if fmt == "parquet" or path.suffix == ".parquet":
        return load_parquet(path, **kwargs)
    return load_csv(path, **kwargs)


def load_matches(path: str | Path, fmt: str = "csv") -> pd.DataFrame:
    """Load and validate the matches table."""
    df = _load_file(path, fmt)
    validate_dataframe(df, MATCH_REQUIRED_COLS, "matches")

    # Parse dates
    df["match_date"] = pd.to_datetime(df["match_date"]).dt.date

    # Set defaults for optional columns
    if "regular_season_flag" not in df.columns:
        df["regular_season_flag"] = True
    if "match_status" not in df.columns:
        df["match_status"] = "completed"
    if "resumed_flag" not in df.columns:
        df["resumed_flag"] = False
    if "incomplete_flag" not in df.columns:
        df["incomplete_flag"] = False
    if "competition" not in df.columns:
        df["competition"] = "NWSL"

    # Ensure integer goals
    df["home_goals_90"] = df["home_goals_90"].astype(int)
    df["away_goals_90"] = df["away_goals_90"].astype(int)

    logger.info(f"Loaded {len(df)} matches from {path}")
    return df


def load_odds(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load odds table. Returns None if file missing (graceful degradation)."""
    try:
        df = _load_file(path, fmt)
        validate_dataframe(df, ODDS_REQUIRED_COLS, "odds")
        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        if "source_type" not in df.columns:
            df["source_type"] = "close"
        logger.info(f"Loaded {len(df)} odds records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Odds file not found at {path}. Running without market data.")
        return None


def load_venues(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load venue/team metadata. Returns None if missing."""
    try:
        df = _load_file(path, fmt)
        validate_dataframe(df, VENUE_REQUIRED_COLS, "venues")
        logger.info(f"Loaded {len(df)} venue records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Venues file not found at {path}. Running without venue data.")
        return None


def load_appearances(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load player appearance data. Returns None if missing."""
    try:
        df = _load_file(path, fmt)
        validate_dataframe(df, APPEARANCE_REQUIRED_COLS, "appearances")
        logger.info(f"Loaded {len(df)} appearance records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Appearances file not found at {path}. Running without lineup data.")
        return None


def load_projected_lineups(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load projected lineup data. Returns None if missing."""
    try:
        df = _load_file(path, fmt)
        validate_dataframe(df, PROJECTED_LINEUP_REQUIRED_COLS, "projected_lineups")
        logger.info(f"Loaded {len(df)} projected lineup records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Projected lineups not found at {path}.")
        return None


class NWSLDataset:
    """Container for all data tables with graceful degradation."""

    def __init__(
        self,
        matches: pd.DataFrame,
        odds: Optional[pd.DataFrame] = None,
        venues: Optional[pd.DataFrame] = None,
        appearances: Optional[pd.DataFrame] = None,
        projected_lineups: Optional[pd.DataFrame] = None,
    ):
        self.matches = matches
        self.odds = odds
        self.venues = venues
        self.appearances = appearances
        self.projected_lineups = projected_lineups

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> NWSLDataset:
        """Load all data from config paths."""
        data_cfg = config["data"]
        fmt = data_cfg.get("format", "csv")

        matches = load_matches(data_cfg["matches_path"], fmt)
        odds = load_odds(data_cfg.get("odds_path", ""), fmt)
        venues = load_venues(data_cfg.get("venues_path", ""), fmt)
        appearances = load_appearances(data_cfg.get("appearances_path", ""), fmt)
        projected = load_projected_lineups(
            data_cfg.get("projected_lineups_path", ""), fmt
        )

        return cls(
            matches=matches,
            odds=odds,
            venues=venues,
            appearances=appearances,
            projected_lineups=projected,
        )

    @property
    def has_odds(self) -> bool:
        return self.odds is not None and len(self.odds) > 0

    @property
    def has_venues(self) -> bool:
        return self.venues is not None and len(self.venues) > 0

    @property
    def has_appearances(self) -> bool:
        return self.appearances is not None and len(self.appearances) > 0

    @property
    def has_projected_lineups(self) -> bool:
        return self.projected_lineups is not None and len(self.projected_lineups) > 0
