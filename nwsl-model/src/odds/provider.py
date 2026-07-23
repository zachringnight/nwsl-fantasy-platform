"""Real odds provider integration and normalization."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

UTC = timezone.utc
from pathlib import Path
from typing import Any, Callable, Iterable, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from src.data.team_names import canonicalize_team_name
from src.utils.dates import parse_mixed_utc_datetime

logger = logging.getLogger("nwsl_model.odds.provider")

THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4"


def _ensure_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    return [str(item) for item in value if str(item)]


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


@dataclass
class OddsProviderConfig:
    provider: str = "the_odds_api"
    api_key_env: str = "THE_ODDS_API_KEY"
    sport_title: str = "NWSL"
    sport_key: str = ""
    regions: list[str] = field(default_factory=lambda: ["us"])
    markets: list[str] = field(default_factory=lambda: ["h2h", "totals"])
    bookmakers: list[str] = field(default_factory=list)
    odds_format: str = "decimal"
    date_format: str = "iso"
    stale_line_minutes: int = 180
    max_match_delta_hours: int = 18
    historical_snapshot_offset_minutes: int = 5
    main_total_strategy: str = "median"


def load_provider_config(config: dict[str, Any]) -> OddsProviderConfig:
    odds_cfg = config.get("odds_provider", {})
    return OddsProviderConfig(
        provider=str(odds_cfg.get("provider", "the_odds_api")),
        api_key_env=str(odds_cfg.get("api_key_env", "THE_ODDS_API_KEY")),
        sport_title=str(odds_cfg.get("sport_title", "NWSL")),
        sport_key=str(odds_cfg.get("sport_key", "")),
        regions=_ensure_list(odds_cfg.get("regions", ["us"])),
        markets=_ensure_list(odds_cfg.get("markets", ["h2h", "totals"])),
        bookmakers=_ensure_list(odds_cfg.get("bookmakers", [])),
        odds_format=str(odds_cfg.get("odds_format", "decimal")),
        date_format=str(odds_cfg.get("date_format", "iso")),
        stale_line_minutes=int(odds_cfg.get("stale_line_minutes", 180)),
        max_match_delta_hours=int(odds_cfg.get("max_match_delta_hours", 18)),
        historical_snapshot_offset_minutes=int(odds_cfg.get("historical_snapshot_offset_minutes", 5)),
        main_total_strategy=str(odds_cfg.get("main_total_strategy", "median")),
    )


class TheOddsAPIClient:
    """Thin client for The Odds API."""

    def __init__(
        self,
        config: OddsProviderConfig,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        self.config = config
        self._opener = opener or urlopen

    @property
    def api_key(self) -> str:
        value = os.environ.get(self.config.api_key_env, "")
        if not value:
            raise RuntimeError(
                f"{self.config.api_key_env} is not configured. Set it before fetching odds."
            )
        return value

    def _request_json(self, endpoint: str, params: dict[str, Any]) -> Any:
        query = urlencode({key: value for key, value in params.items() if value not in (None, "", [])})
        request = Request(
            f"{THE_ODDS_API_BASE}{endpoint}?{query}",
            headers={"User-Agent": "nwsl-model/0.1"},
        )
        with self._opener(request) as response:
            return json.loads(response.read().decode("utf-8"))

    def discover_sport_key(self) -> str:
        if self.config.sport_key:
            return self.config.sport_key

        payload = self._request_json("/sports", {"apiKey": self.api_key})
        target = self.config.sport_title.lower()
        for sport in payload:
            title = str(sport.get("title", "")).lower()
            key = str(sport.get("key", ""))
            description = str(sport.get("description", "")).lower()
            if target in title or target in description or target in key.lower():
                return key

        raise RuntimeError(
            f"Could not resolve a sport key for {self.config.sport_title!r} via The Odds API /sports endpoint."
        )

    def fetch_current_odds(self) -> Any:
        sport_key = self.discover_sport_key()
        return self._request_json(
            f"/sports/{sport_key}/odds",
            {
                "apiKey": self.api_key,
                "regions": ",".join(self.config.regions),
                "markets": ",".join(self.config.markets),
                "bookmakers": ",".join(self.config.bookmakers),
                "oddsFormat": self.config.odds_format,
                "dateFormat": self.config.date_format,
            },
        )

    def fetch_historical_odds(self, snapshot_at: datetime) -> Any:
        sport_key = self.discover_sport_key()
        return self._request_json(
            f"/historical/sports/{sport_key}/odds",
            {
                "apiKey": self.api_key,
                "regions": ",".join(self.config.regions),
                "markets": ",".join(self.config.markets),
                "bookmakers": ",".join(self.config.bookmakers),
                "oddsFormat": self.config.odds_format,
                "dateFormat": self.config.date_format,
                "date": snapshot_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            },
        )


def load_official_match_reference(
    repo_root: Path,
    seasons: Optional[Iterable[int]] = None,
    include_completed: bool = True,
    include_upcoming: bool = True,
) -> pd.DataFrame:
    """Load official fixture reference rows with kickoff timestamps."""
    official_dir = repo_root / "data" / "nwsl-official"
    frames = []
    allowed_seasons = {int(season) for season in seasons} if seasons else None
    for path in sorted(official_dir.glob("nwsl_*_official_matches.csv")):
        frame = pd.read_csv(path)
        if allowed_seasons is not None:
            frame = frame[frame["season"].astype(int).isin(allowed_seasons)]
        if frame.empty:
            continue
        frames.append(frame)

    if not frames:
        return pd.DataFrame(
            columns=["match_id", "season", "match_datetime", "home_team", "away_team", "status"]
        )

    matches = pd.concat(frames, ignore_index=True)
    statuses = matches.get("status", pd.Series([""] * len(matches), index=matches.index)).astype(str).str.upper()
    completed_mask = matches["home_score"].notna() & matches["away_score"].notna()
    upcoming_mask = ~completed_mask | ~statuses.isin({"FINISHED"})
    keep_mask = False
    if include_completed:
        keep_mask = keep_mask | completed_mask
    if include_upcoming:
        keep_mask = keep_mask | upcoming_mask
    matches = matches[keep_mask].copy()

    match_datetime = pd.to_datetime(
        matches["match_date_utc"].fillna(matches.get("match_date_local")),
        errors="coerce",
        utc=True,
    )
    matches["match_datetime"] = match_datetime
    matches = matches[matches["match_datetime"].notna()].copy()
    matches["home_team"] = matches["home_official_name"].map(canonicalize_team_name)
    matches["away_team"] = matches["away_official_name"].map(canonicalize_team_name)
    matches["match_id"] = matches["match_id"].astype(str)

    output = matches[
        ["match_id", "season", "match_datetime", "home_team", "away_team", "status"]
    ].copy()
    output["match_date"] = output["match_datetime"].dt.date
    return output.sort_values(["match_datetime", "match_id"]).reset_index(drop=True)


def _extract_events(payload: Any) -> tuple[list[dict[str, Any]], datetime | None]:
    if isinstance(payload, dict):
        snapshot = _parse_datetime(payload.get("timestamp"))
        data = payload.get("data")
        if isinstance(data, list):
            return data, snapshot
    if isinstance(payload, list):
        return payload, None
    return [], None


def _match_provider_events(
    events: list[dict[str, Any]],
    match_reference: pd.DataFrame,
    max_match_delta_hours: int,
) -> pd.DataFrame:
    if not events or match_reference.empty:
        return pd.DataFrame(
            columns=[
                "provider_event_id",
                "match_id",
                "season",
                "commence_time",
                "home_team",
                "away_team",
                "provider_home_team",
                "provider_away_team",
                "delta_hours",
            ]
        )

    event_rows = []
    for event in events:
        event_rows.append(
            {
                "provider_event_id": str(event.get("id", "")),
                "provider_home_team": canonicalize_team_name(str(event.get("home_team", ""))),
                "provider_away_team": canonicalize_team_name(str(event.get("away_team", ""))),
                "commence_time": _parse_datetime(event.get("commence_time")),
            }
        )
    event_df = pd.DataFrame(event_rows)
    event_df = event_df[event_df["commence_time"].notna()].copy()
    if event_df.empty:
        return event_df

    reference = match_reference.copy()
    reference["match_datetime"] = pd.to_datetime(reference["match_datetime"], utc=True, errors="coerce")
    merged = event_df.merge(
        reference,
        left_on=["provider_home_team", "provider_away_team"],
        right_on=["home_team", "away_team"],
        how="left",
    )
    if merged.empty:
        return merged

    merged["delta_hours"] = (
        (merged["commence_time"] - merged["match_datetime"]).abs().dt.total_seconds() / 3600.0
    )
    merged = merged[merged["delta_hours"].notna()].copy()
    if merged.empty:
        return merged

    merged = merged.sort_values(["provider_event_id", "delta_hours", "match_datetime"])
    matched = merged.drop_duplicates("provider_event_id", keep="first")
    matched = matched[matched["delta_hours"] <= float(max_match_delta_hours)].copy()
    return matched.reset_index(drop=True)


def _select_main_total_line(lines: pd.Series) -> float | None:
    valid = lines.dropna().astype(float)
    if valid.empty:
        return None
    consensus = float(valid.median())
    ranked = valid.iloc[(valid - consensus).abs().argsort(kind="stable")]
    return float(ranked.iloc[0])


def canonicalize_main_total_rows(odds: pd.DataFrame) -> pd.DataFrame:
    """Keep a single main totals line per match/source snapshot."""
    if odds.empty or "market_type" not in odds.columns:
        return odds

    totals = odds[odds["market_type"].astype(str).str.lower() == "total"].copy()
    non_totals = odds[odds["market_type"].astype(str).str.lower() != "total"].copy()
    if totals.empty:
        return odds

    group_cols = ["match_id", "source_type"]
    if "snapshot_timestamp" in totals.columns:
        group_cols.append("snapshot_timestamp")

    selected_groups = []
    for _, group in totals.groupby(group_cols, dropna=False):
        main_line = _select_main_total_line(group["line"])
        if main_line is None:
            continue
        chosen = group.copy()
        chosen["_line_distance"] = (chosen["line"].astype(float) - main_line).abs()
        chosen = (
            chosen.sort_values(["sportsbook", "_line_distance", "line"])
            .groupby("sportsbook", as_index=False, dropna=False)
            .head(1)
            .drop(columns="_line_distance")
        )
        selected_groups.append(chosen)

    totals_selected = (
        pd.concat(selected_groups, ignore_index=True)
        if selected_groups
        else totals.iloc[0:0].copy()
    )
    return (
        pd.concat([non_totals, totals_selected], ignore_index=True)
        .sort_values(["match_id", "market_type", "sportsbook", "timestamp"], na_position="last")
        .reset_index(drop=True)
    )


def normalize_provider_payload(
    payload: Any,
    match_reference: pd.DataFrame,
    source_type: str,
    config: OddsProviderConfig,
    snapshot_time: datetime | None = None,
) -> pd.DataFrame:
    """Flatten The Odds API response into the canonical odds contract."""
    events, payload_snapshot = _extract_events(payload)
    matched_events = _match_provider_events(events, match_reference, config.max_match_delta_hours)
    if matched_events.empty:
        return pd.DataFrame(
            columns=[
                "match_id",
                "timestamp",
                "sportsbook",
                "market_type",
                "line",
                "home_odds",
                "draw_odds",
                "away_odds",
                "over_odds",
                "under_odds",
                "source_type",
            ]
        )

    matched_lookup = matched_events.set_index("provider_event_id").to_dict("index")
    snapshot_value = snapshot_time or payload_snapshot or datetime.now(UTC)
    rows: list[dict[str, Any]] = []

    for event in events:
        event_id = str(event.get("id", ""))
        match_meta = matched_lookup.get(event_id)
        if not match_meta:
            continue

        home_team = str(event.get("home_team", ""))
        away_team = str(event.get("away_team", ""))
        commence_time = _parse_datetime(event.get("commence_time"))
        for bookmaker in event.get("bookmakers", []):
            book_key = str(bookmaker.get("key", ""))
            book_title = str(bookmaker.get("title", book_key))
            book_timestamp = _parse_datetime(bookmaker.get("last_update")) or snapshot_value
            for market in bookmaker.get("markets", []):
                market_key = str(market.get("key", "")).lower()
                outcomes = market.get("outcomes", [])
                if market_key == "h2h":
                    home_price = draw_price = away_price = np.nan
                    for outcome in outcomes:
                        name = str(outcome.get("name", ""))
                        price = outcome.get("price")
                        if price in (None, ""):
                            continue
                        if name == home_team:
                            home_price = float(price)
                        elif name == away_team:
                            away_price = float(price)
                        elif name.lower() == "draw":
                            draw_price = float(price)
                    rows.append(
                        {
                            "match_id": match_meta["match_id"],
                            "timestamp": book_timestamp.isoformat(),
                            "sportsbook": book_title,
                            "market_type": "1x2",
                            "line": np.nan,
                            "home_odds": home_price,
                            "draw_odds": draw_price,
                            "away_odds": away_price,
                            "over_odds": np.nan,
                            "under_odds": np.nan,
                            "source_type": source_type,
                            "provider": config.provider,
                            "provider_event_id": event_id,
                            "bookmaker_key": book_key,
                            "bookmaker_title": book_title,
                            "commence_time": commence_time.isoformat() if commence_time else None,
                            "matched_home_team": match_meta["home_team"],
                            "matched_away_team": match_meta["away_team"],
                            "snapshot_timestamp": snapshot_value.isoformat(),
                        }
                    )
                elif market_key == "totals":
                    outcomes_df = pd.DataFrame(outcomes)
                    if outcomes_df.empty or "point" not in outcomes_df.columns:
                        continue
                    for point, line_group in outcomes_df.groupby("point", dropna=False):
                        over_price = under_price = np.nan
                        for _, outcome in line_group.iterrows():
                            name = str(outcome.get("name", "")).lower()
                            price = outcome.get("price")
                            if price in (None, ""):
                                continue
                            if name == "over":
                                over_price = float(price)
                            elif name == "under":
                                under_price = float(price)
                        rows.append(
                            {
                                "match_id": match_meta["match_id"],
                                "timestamp": book_timestamp.isoformat(),
                                "sportsbook": book_title,
                                "market_type": "total",
                                "line": float(point) if point not in (None, "") else np.nan,
                                "home_odds": np.nan,
                                "draw_odds": np.nan,
                                "away_odds": np.nan,
                                "over_odds": over_price,
                                "under_odds": under_price,
                                "source_type": source_type,
                                "provider": config.provider,
                                "provider_event_id": event_id,
                                "bookmaker_key": book_key,
                                "bookmaker_title": book_title,
                                "commence_time": commence_time.isoformat() if commence_time else None,
                                "matched_home_team": match_meta["home_team"],
                                "matched_away_team": match_meta["away_team"],
                                "snapshot_timestamp": snapshot_value.isoformat(),
                            }
                        )

    odds = pd.DataFrame(rows)
    if odds.empty:
        return odds
    return canonicalize_main_total_rows(odds)


def merge_odds_history(existing: pd.DataFrame, new_rows: pd.DataFrame) -> pd.DataFrame:
    """Append odds history and de-duplicate identical snapshots."""
    if existing.empty:
        combined = new_rows.copy()
    elif new_rows.empty:
        combined = existing.copy()
    else:
        combined = pd.concat([existing, new_rows], ignore_index=True, sort=False)

    if combined.empty:
        return combined

    dedupe_cols = ["match_id", "sportsbook", "market_type", "line", "source_type", "timestamp"]
    dedupe_cols = [column for column in dedupe_cols if column in combined.columns]
    combined = combined.drop_duplicates(subset=dedupe_cols, keep="last")
    return combined.sort_values(["match_id", "source_type", "market_type", "sportsbook", "timestamp"]).reset_index(drop=True)


def build_consensus_match_odds(
    odds: pd.DataFrame,
    source_type: str = "close",
) -> pd.DataFrame:
    """Aggregate book-level odds rows into a single match-level snapshot."""
    if odds is None or odds.empty:
        return pd.DataFrame(
            columns=[
                "match_id",
                "home_odds",
                "draw_odds",
                "away_odds",
                "total_line",
                "over_odds",
                "under_odds",
                "odds_timestamp",
                "total_odds_timestamp",
            ]
        )

    filtered = odds.copy()
    filtered["source_type"] = filtered["source_type"].astype(str).str.lower()
    filtered = filtered[filtered["source_type"] == source_type.lower()].copy()
    if filtered.empty:
        return pd.DataFrame(columns=["match_id"])

    frames: list[pd.DataFrame] = []

    one_x_two = filtered[filtered["market_type"].astype(str).str.lower() == "1x2"].copy()
    if not one_x_two.empty:
        if "timestamp" in one_x_two.columns:
            one_x_two["timestamp"] = parse_mixed_utc_datetime(one_x_two["timestamp"])
        aggregations: dict[str, Any] = {
            "home_odds": ("home_odds", "mean"),
            "draw_odds": ("draw_odds", "mean"),
            "away_odds": ("away_odds", "mean"),
            "odds_books": ("sportsbook", "nunique"),
        }
        if "timestamp" in one_x_two.columns:
            aggregations["odds_timestamp"] = ("timestamp", "max")
        aggregated = one_x_two.groupby("match_id", dropna=False).agg(**aggregations).reset_index()
        frames.append(aggregated)

    totals = filtered[filtered["market_type"].astype(str).str.lower() == "total"].copy()
    if not totals.empty:
        totals = canonicalize_main_total_rows(totals)
        if "timestamp" in totals.columns:
            totals["timestamp"] = parse_mixed_utc_datetime(totals["timestamp"])
        aggregations = {
            "total_line": ("line", _select_main_total_line),
            "over_odds": ("over_odds", "mean"),
            "under_odds": ("under_odds", "mean"),
            "total_books": ("sportsbook", "nunique"),
        }
        if "timestamp" in totals.columns:
            aggregations["total_odds_timestamp"] = ("timestamp", "max")
        aggregated = totals.groupby("match_id", dropna=False).agg(**aggregations).reset_index()
        frames.append(aggregated)

    if not frames:
        return pd.DataFrame(columns=["match_id"])

    consensus = frames[0]
    for frame in frames[1:]:
        consensus = consensus.merge(frame, on="match_id", how="outer")
    return consensus


def fetch_historical_closing_odds(
    client: TheOddsAPIClient,
    match_reference: pd.DataFrame,
    max_matches: int | None = None,
) -> pd.DataFrame:
    """Fetch one historical close snapshot per reference match."""
    if match_reference.empty:
        return pd.DataFrame()

    completed = match_reference.copy()
    completed["match_datetime"] = pd.to_datetime(completed["match_datetime"], utc=True, errors="coerce")
    completed = completed[completed["match_datetime"].notna()].sort_values("match_datetime")
    if max_matches is not None:
        completed = completed.head(max_matches)

    frames: list[pd.DataFrame] = []
    for row in completed.itertuples(index=False):
        snapshot_at = row.match_datetime - timedelta(minutes=client.config.historical_snapshot_offset_minutes)
        payload = client.fetch_historical_odds(snapshot_at)
        normalized = normalize_provider_payload(
            payload,
            match_reference=completed[completed["match_id"] == row.match_id],
            source_type="close",
            config=client.config,
            snapshot_time=snapshot_at,
        )
        if normalized.empty:
            continue
        matched = normalized[normalized["match_id"] == row.match_id].copy()
        if not matched.empty:
            frames.append(matched)

    if not frames:
        return pd.DataFrame()
    return merge_odds_history(pd.DataFrame(), pd.concat(frames, ignore_index=True))
