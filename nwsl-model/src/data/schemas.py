"""Data schemas for the NWSL betting model.

Defines strict Pydantic models for all input tables. These schemas are used
for validation at load time to ensure data quality before any modeling.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

import pandas as pd
from pydantic import BaseModel, Field, field_validator


class MatchStatus(str, Enum):
    COMPLETED = "completed"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    POSTPONED = "postponed"
    IN_PROGRESS = "in_progress"
    SCHEDULED = "scheduled"


class SourceType(str, Enum):
    OPEN = "open"
    CURRENT = "current"
    CLOSE = "close"


class MarketType(str, Enum):
    MATCH_RESULT = "1x2"
    ASIAN_HANDICAP = "asian_handicap"
    TOTAL = "total"
    DOUBLE_CHANCE = "double_chance"
    BTTS = "btts"


class PlayerStatus(str, Enum):
    AVAILABLE = "available"
    INJURED = "injured"
    SUSPENDED = "suspended"
    NATIONAL_TEAM = "national_team"
    UNKNOWN = "unknown"


# --- Match Schema ---

class MatchRecord(BaseModel):
    """Schema for a single match record. 90-minute regulation only."""

    match_id: str
    match_date: date
    season: int
    competition: str = "NWSL"
    regular_season_flag: bool = True
    home_team: str
    away_team: str
    home_goals_90: int = Field(ge=0)
    away_goals_90: int = Field(ge=0)
    home_npxg: Optional[float] = None
    away_npxg: Optional[float] = None
    home_xg: Optional[float] = None
    away_xg: Optional[float] = None
    home_penalties: Optional[int] = Field(default=None, ge=0)
    away_penalties: Optional[int] = Field(default=None, ge=0)
    venue: Optional[str] = None
    stadium: Optional[str] = None
    surface: Optional[str] = None
    altitude_m: Optional[float] = None
    weather_temp_c: Optional[float] = None
    weather_wind_kph: Optional[float] = None
    weather_precip_mm: Optional[float] = None
    weather_humidity_pct: Optional[float] = None
    match_status: MatchStatus = MatchStatus.COMPLETED
    resumed_flag: bool = False
    incomplete_flag: bool = False

    @field_validator("match_date", mode="before")
    @classmethod
    def parse_date(cls, v: str | date) -> date:
        if isinstance(v, str):
            return date.fromisoformat(v)
        return v


class OddsRecord(BaseModel):
    """Schema for a single odds snapshot."""

    match_id: str
    timestamp: Optional[datetime] = None
    sportsbook: str
    market_type: MarketType
    line: Optional[float] = None
    home_odds: Optional[float] = Field(default=None, gt=1.0)
    draw_odds: Optional[float] = Field(default=None, gt=1.0)
    away_odds: Optional[float] = Field(default=None, gt=1.0)
    over_odds: Optional[float] = Field(default=None, gt=1.0)
    under_odds: Optional[float] = Field(default=None, gt=1.0)
    source_type: SourceType = SourceType.CLOSE

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v: str | datetime | None) -> Optional[datetime]:
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class VenueRecord(BaseModel):
    """Schema for team/venue metadata."""

    team: str
    home_stadium: str
    stadium_lat: float
    stadium_lon: float
    altitude_m: Optional[float] = None
    surface: Optional[str] = "grass"
    timezone: Optional[str] = None


class AppearanceRecord(BaseModel):
    """Schema for a player appearance/stint in a match."""

    match_id: str
    player_id: str
    team: str
    start_minute: int = Field(ge=0)
    end_minute: int = Field(ge=0, le=120)
    started_flag: bool = False
    position: Optional[str] = None
    projected_flag: bool = False
    available_flag: bool = True
    injury_flag: bool = False
    suspension_flag: bool = False
    national_team_absence_flag: bool = False


class ProjectedLineupRecord(BaseModel):
    """Schema for projected lineup / availability."""

    match_id: str
    team: str
    player_id: str
    projected_start: bool = False
    projected_minutes: Optional[float] = None
    status: PlayerStatus = PlayerStatus.AVAILABLE
    source: Optional[str] = None
    report_timestamp: Optional[datetime] = None


# --- Column definitions for DataFrame validation ---

MATCH_REQUIRED_COLS = [
    "match_id", "match_date", "season", "home_team", "away_team",
    "home_goals_90", "away_goals_90",
]

MATCH_OPTIONAL_COLS = [
    "competition", "regular_season_flag",
    "home_npxg", "away_npxg", "home_xg", "away_xg",
    "home_penalties", "away_penalties",
    "venue", "stadium", "surface", "altitude_m",
    "weather_temp_c", "weather_wind_kph", "weather_precip_mm", "weather_humidity_pct",
    "match_status", "resumed_flag", "incomplete_flag",
]

ODDS_REQUIRED_COLS = [
    "match_id", "sportsbook", "market_type",
]

ODDS_OPTIONAL_COLS = [
    "timestamp", "line",
    "home_odds", "draw_odds", "away_odds",
    "over_odds", "under_odds",
    "source_type",
]

VENUE_REQUIRED_COLS = ["team", "home_stadium", "stadium_lat", "stadium_lon"]

APPEARANCE_REQUIRED_COLS = [
    "match_id", "player_id", "team", "start_minute", "end_minute",
]

PROJECTED_LINEUP_REQUIRED_COLS = [
    "match_id", "team", "player_id",
]


def validate_dataframe(
    df: pd.DataFrame,
    required_cols: list[str],
    name: str = "table",
) -> list[str]:
    """Validate a DataFrame has required columns. Returns list of warnings."""
    warnings = []
    missing = set(required_cols) - set(df.columns)
    if missing:
        raise ValueError(f"{name} is missing required columns: {sorted(missing)}")
    if df.empty:
        warnings.append(f"{name} is empty")
    return warnings
