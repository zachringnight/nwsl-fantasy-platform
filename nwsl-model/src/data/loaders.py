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
from src.data.match_ids import apply_official_match_id_crosswalk, model_team_key
from src.utils.io import load_csv, load_parquet
from src.data.xg_enrichment import enrich_matches_with_asa_xg
from src.utils.dates import parse_mixed_utc_datetime

logger = logging.getLogger("nwsl_model.data.loaders")


def _load_file(path: str | Path, fmt: str = "csv", **kwargs: Any) -> pd.DataFrame:
    """Load a file based on format."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {path}")
    if fmt == "parquet" or path.suffix == ".parquet":
        return load_parquet(path, **kwargs)
    return load_csv(path, **kwargs)


def _filter_by_season_window(
    frame: Optional[pd.DataFrame],
    history_start_season: int | None,
    history_end_season: int | None = None,
    season_col: str = "season",
) -> Optional[pd.DataFrame]:
    if (
        frame is None
        or (history_start_season is None and history_end_season is None)
        or frame.empty
        or season_col not in frame.columns
    ):
        return frame
    seasons = pd.to_numeric(frame[season_col], errors="coerce")
    mask = pd.Series(True, index=frame.index)
    if history_start_season is not None:
        mask &= seasons.ge(history_start_season).fillna(False)
    if history_end_season is not None:
        mask &= seasons.le(history_end_season).fillna(False)
    return frame.loc[mask].copy()


def _filter_by_history_start(
    frame: Optional[pd.DataFrame],
    history_start_season: int | None,
    season_col: str = "season",
) -> Optional[pd.DataFrame]:
    return _filter_by_season_window(frame, history_start_season, None, season_col)


def _align_frame_team_labels_to_match_reference(
    frame: Optional[pd.DataFrame],
    match_reference: pd.DataFrame,
) -> Optional[pd.DataFrame]:
    """Keep only rows whose team is one of the mapped match participants."""
    if (
        frame is None
        or frame.empty
        or "match_id" not in frame.columns
        or "team" not in frame.columns
        or match_reference.empty
        or not {"match_id", "home_team", "away_team"}.issubset(match_reference.columns)
    ):
        return frame

    reference = match_reference[["match_id", "home_team", "away_team"]].copy()
    reference["match_id"] = reference["match_id"].astype(str)
    reference["home_key"] = reference["home_team"].map(model_team_key)
    reference["away_key"] = reference["away_team"].map(model_team_key)
    merged = frame.copy()
    merged["match_id"] = merged["match_id"].astype(str)
    merged = merged.merge(reference, on="match_id", how="left")

    team_key = merged["team"].map(model_team_key)
    home_match = team_key.eq(merged["home_key"])
    away_match = team_key.eq(merged["away_key"])
    aligned = merged.loc[home_match | away_match].copy()
    aligned.loc[home_match.loc[aligned.index], "team"] = aligned.loc[home_match.loc[aligned.index], "home_team"]
    aligned.loc[away_match.loc[aligned.index], "team"] = aligned.loc[away_match.loc[aligned.index], "away_team"]

    return aligned.drop(columns=["home_team", "away_team", "home_key", "away_key"])


def _align_team_column_to_match_reference(
    frame: Optional[pd.DataFrame],
    match_reference: pd.DataFrame,
    *,
    team_col: str = "team",
) -> Optional[pd.DataFrame]:
    """Map team labels onto the exact labels used by model match references."""
    if (
        frame is None
        or frame.empty
        or team_col not in frame.columns
        or match_reference.empty
        or not {"home_team", "away_team"}.issubset(match_reference.columns)
    ):
        return frame

    lookup: dict[str, str] = {}
    for column in ["home_team", "away_team"]:
        for team in match_reference[column].dropna().astype(str):
            lookup.setdefault(model_team_key(team), team)

    output = frame.copy()
    output[team_col] = output[team_col].map(
        lambda value: lookup.get(model_team_key(value), value)
    )
    return output


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


def load_upcoming_matches(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load upcoming match references. Returns None if missing."""
    if not str(path).strip():
        return None
    try:
        return load_matches(path, fmt)
    except FileNotFoundError:
        logger.warning(f"Upcoming matches not found at {path}.")
        return None


def load_asa_match_xgoals(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load ASA match-level xG table. Returns None if missing."""
    if not str(path).strip():
        return None
    try:
        df = _load_file(path, fmt)
        logger.info(f"Loaded {len(df)} ASA match xG records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"ASA match xG file not found at {path}.")
        return None


def load_odds(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load odds table. Returns None if file missing (graceful degradation)."""
    if not str(path).strip():
        logger.warning("Odds path not configured. Running without market data.")
        return None
    try:
        df = _load_file(path, fmt)
        validate_dataframe(df, ODDS_REQUIRED_COLS, "odds")
        if "timestamp" in df.columns:
            df["timestamp"] = parse_mixed_utc_datetime(df["timestamp"])
        if "source_type" not in df.columns:
            df["source_type"] = "close"
        logger.info(f"Loaded {len(df)} odds records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Odds file not found at {path}. Running without market data.")
        return None


def load_venues(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load venue/team metadata. Returns None if missing."""
    if not str(path).strip():
        logger.warning("Venues path not configured. Running without venue data.")
        return None
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
    if not str(path).strip():
        logger.warning("Appearances path not configured. Running without lineup data.")
        return None
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
    if not str(path).strip():
        logger.warning("Projected lineup path not configured.")
        return None
    try:
        df = _load_file(path, fmt)
        validate_dataframe(df, PROJECTED_LINEUP_REQUIRED_COLS, "projected_lineups")
        logger.info(f"Loaded {len(df)} projected lineup records from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Projected lineups not found at {path}.")
        return None


def load_team_season_priors(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load team season priors. Returns None if missing."""
    if not str(path).strip():
        logger.warning("Team season priors path not configured.")
        return None
    try:
        df = _load_file(path, fmt)
        if "season" in df.columns:
            df["season"] = pd.to_numeric(df["season"], errors="coerce").astype("Int64")
        logger.info(f"Loaded {len(df)} team season prior rows from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Team season priors not found at {path}.")
        return None


def load_player_season_priors(path: str | Path, fmt: str = "csv") -> Optional[pd.DataFrame]:
    """Load player season priors. Returns None if missing."""
    if not str(path).strip():
        logger.warning("Player season priors path not configured.")
        return None
    try:
        df = _load_file(path, fmt)
        if "season" in df.columns:
            df["season"] = pd.to_numeric(df["season"], errors="coerce").astype("Int64")
        if "player_id" in df.columns:
            df["player_id"] = df["player_id"].astype(str)
        logger.info(f"Loaded {len(df)} player season prior rows from {path}")
        return df
    except FileNotFoundError:
        logger.warning(f"Player season priors not found at {path}.")
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
        team_season_priors: Optional[pd.DataFrame] = None,
        player_season_priors: Optional[pd.DataFrame] = None,
    ):
        self.matches = matches
        self.odds = odds
        self.venues = venues
        self.appearances = appearances
        self.projected_lineups = projected_lineups
        self.team_season_priors = team_season_priors
        self.player_season_priors = player_season_priors

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> NWSLDataset:
        """Load all data from config paths."""
        data_cfg = config["data"]
        fmt = data_cfg.get("format", "csv")
        history_start_season = data_cfg.get("history_start_season")
        history_end_season = data_cfg.get("history_end_season")
        prior_history_start_season = data_cfg.get(
            "prior_history_start_season",
            history_start_season,
        )
        prior_history_end_season = data_cfg.get(
            "prior_history_end_season",
            history_end_season,
        )

        matches = load_matches(data_cfg["matches_path"], fmt)
        asa_match_xgoals = load_asa_match_xgoals(data_cfg.get("asa_match_xgoals_path", ""), fmt)
        matches = enrich_matches_with_asa_xg(matches, asa_match_xgoals)
        matches = _filter_by_season_window(matches, history_start_season, history_end_season)
        upcoming = load_upcoming_matches(data_cfg.get("upcoming_path", ""), fmt)
        upcoming = _filter_by_season_window(upcoming, history_start_season, history_end_season)
        odds = load_odds(data_cfg.get("odds_path", ""), fmt)
        venues = load_venues(data_cfg.get("venues_path", ""), fmt)
        appearances = load_appearances(data_cfg.get("appearances_path", ""), fmt)
        projected = load_projected_lineups(
            data_cfg.get("projected_lineups_path", ""), fmt
        )
        team_season_priors = load_team_season_priors(
            data_cfg.get("team_season_priors_path", ""), fmt
        )
        player_season_priors = load_player_season_priors(
            data_cfg.get("player_season_priors_path", ""), fmt
        )

        team_season_priors = _filter_by_season_window(
            team_season_priors,
            prior_history_start_season,
            prior_history_end_season,
        )
        player_season_priors = _filter_by_season_window(
            player_season_priors,
            prior_history_start_season,
            prior_history_end_season,
        )
        appearances = _filter_by_season_window(
            appearances,
            history_start_season,
            history_end_season,
        )
        projected = _filter_by_season_window(
            projected,
            history_start_season,
            history_end_season,
        )

        match_reference = matches
        if upcoming is not None and not upcoming.empty:
            match_reference = pd.concat([matches, upcoming], ignore_index=True, sort=False)

        official_matches_dir = data_cfg.get("official_matches_dir", "")
        if official_matches_dir:
            appearances = apply_official_match_id_crosswalk(
                appearances,
                match_reference,
                official_matches_dir,
            )
            projected = apply_official_match_id_crosswalk(
                projected,
                match_reference,
                official_matches_dir,
            )

        team_season_priors = _align_team_column_to_match_reference(
            team_season_priors,
            match_reference,
        )
        player_season_priors = _align_team_column_to_match_reference(
            player_season_priors,
            match_reference,
        )

        if appearances is not None and matches is not None and not appearances.empty:
            allowed_match_ids = set(matches["match_id"].astype(str))
            appearances = appearances[
                appearances["match_id"].astype(str).isin(allowed_match_ids)
            ].copy()
            appearances = _align_frame_team_labels_to_match_reference(appearances, matches)
        if projected is not None and match_reference is not None and not projected.empty:
            allowed_match_ids = set(match_reference["match_id"].astype(str))
            projected = projected[
                projected["match_id"].astype(str).isin(allowed_match_ids)
            ].copy()
            projected = _align_frame_team_labels_to_match_reference(projected, match_reference)
        if odds is not None and matches is not None and not odds.empty:
            allowed_match_ids = set(matches["match_id"].astype(str))
            odds = odds[odds["match_id"].astype(str).isin(allowed_match_ids)].copy()

        return cls(
            matches=matches,
            odds=odds,
            venues=venues,
            appearances=appearances,
            projected_lineups=projected,
            team_season_priors=team_season_priors,
            player_season_priors=player_season_priors,
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

    @property
    def has_team_season_priors(self) -> bool:
        return self.team_season_priors is not None and len(self.team_season_priors) > 0

    @property
    def has_player_season_priors(self) -> bool:
        return self.player_season_priors is not None and len(self.player_season_priors) > 0
