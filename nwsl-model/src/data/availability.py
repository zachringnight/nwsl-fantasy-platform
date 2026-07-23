"""Official NWSL availability-report parsing and projected-lineup updates."""

from __future__ import annotations

import codecs
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from typing import Any, Iterable

import pandas as pd

from src.data.team_names import canonicalize_team_name, normalize_team_key

AVAILABILITY_URL = "https://www.nwslsoccer.com/news/availability-report"
BLOCKING_STATUSES = {"out", "suspended", "international_duty"}


def normalize_person_key(value: Any) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    return normalized


def extract_markdown_texts_from_html(html: str) -> list[str]:
    """Extract embedded markdownText payloads from the NWSL Next.js page."""
    raw_texts = re.findall(r'\\"markdownText\\":\\"(.*?)\\"', html)
    return [codecs.decode(text, "unicode_escape").replace("\\n", "\n") for text in raw_texts]


def fetch_availability_markdown_texts(url: str = AVAILABILITY_URL) -> list[str]:
    with urllib.request.urlopen(url, timeout=20) as response:
        html = response.read().decode("utf-8", errors="replace")
    return extract_markdown_texts_from_html(html)


def _report_date(texts: Iterable[str]) -> str | None:
    for text in texts:
        match = re.search(r"Updated\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", text)
        if not match:
            continue
        parsed = pd.to_datetime(match.group(1), errors="coerce")
        if pd.notna(parsed):
            return str(parsed.date())
    return None


def _section_status(section: str, reason: str) -> str:
    label = section.lower().replace(" ", "_")
    if label == "international_duty":
        return "international_duty"
    if label == "questionable":
        return "questionable"
    if "suspend" in str(reason or "").lower():
        return "suspended"
    return "out"


def _parse_player_list(raw_value: str) -> list[tuple[str, str]]:
    value = raw_value.replace("\n", " ").strip()
    value = re.sub(r"\s+", " ", value)
    if not value or value.lower() == "none":
        return []
    rows: list[tuple[str, str]] = []
    for match in re.finditer(r"(?P<name>[^()]+?)\s*\((?P<reason>[^)]*)\)", value):
        name = match.group("name").strip(" ,")
        reason = match.group("reason").strip()
        if name and name.lower() != "none":
            rows.append((name, reason))
    if rows:
        return rows
    return [(item.strip(" ,"), "") for item in value.split(",") if item.strip(" ,").lower() != "none"]


def parse_availability_texts(
    texts: Iterable[str],
    *,
    source_url: str = AVAILABILITY_URL,
    fetched_at: str | None = None,
) -> pd.DataFrame:
    """Parse NWSL availability markdown blocks into one row per unavailable player."""
    text_list = [text.replace("\\n", "\n") for text in texts]
    report_date = _report_date(text_list)
    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []

    for text in text_list:
        if "**OUT" not in text and "**QUESTIONABLE" not in text and "**INTERNATIONAL DUTY" not in text:
            continue
        team_match = re.match(r"\*\*(?P<team>[^*]+)\*\*", text.strip())
        if not team_match:
            continue
        team = canonicalize_team_name(team_match.group("team").strip())
        for section_match in re.finditer(
            r"\*\*(OUT|QUESTIONABLE|INTERNATIONAL DUTY):?\*\*:?\s*(.*?)(?=\n\*\*|$)",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        ):
            section = section_match.group(1).upper()
            raw_players = section_match.group(2).strip()
            for player_name, reason in _parse_player_list(raw_players):
                rows.append(
                    {
                        "team": team,
                        "player_name": player_name,
                        "player_name_key": normalize_person_key(player_name),
                        "status": _section_status(section, reason),
                        "reason": reason,
                        "report_date": report_date,
                        "fetched_at": fetched_at,
                        "source_url": source_url,
                    }
                )

    return pd.DataFrame(
        rows,
        columns=[
            "team",
            "player_name",
            "player_name_key",
            "status",
            "reason",
            "report_date",
            "fetched_at",
            "source_url",
        ],
    )


_SNAPSHOT_DEDUPE_KEYS = ["report_date", "team", "player_name_key", "status"]


def append_availability_snapshot(
    existing: pd.DataFrame,
    report: pd.DataFrame,
) -> pd.DataFrame:
    """Accumulate weekly availability reports into a dated history.

    The official report only ever shows the current week, so overwriting it
    loses past availability. Appending each fetch keyed by report week builds
    the historical injury/suspension/international-duty record the model needs.
    Re-running the same week is idempotent; distinct weeks accumulate.
    """
    frames = [frame for frame in (existing, report) if frame is not None and not frame.empty]
    if not frames:
        return report.copy() if report is not None else pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True, sort=False)
    if "player_name_key" not in combined.columns and "player_name" in combined.columns:
        combined["player_name_key"] = combined["player_name"].map(normalize_person_key)
    dedupe_keys = [key for key in _SNAPSHOT_DEDUPE_KEYS if key in combined.columns]
    if dedupe_keys:
        combined = combined.drop_duplicates(dedupe_keys, keep="last")
    return combined.reset_index(drop=True)


def fetch_availability_report(url: str = AVAILABILITY_URL) -> pd.DataFrame:
    fetched_at = datetime.now(timezone.utc).isoformat()
    return parse_availability_texts(
        fetch_availability_markdown_texts(url),
        source_url=url,
        fetched_at=fetched_at,
    )


def _profile_names(profiles: pd.DataFrame) -> pd.DataFrame:
    frame = profiles.copy()
    frame["player_id"] = frame["player_id"].astype(str)
    if {"media_first_name", "media_last_name"}.issubset(frame.columns):
        full_name = (
            frame["media_first_name"].fillna("").astype(str).str.strip()
            + " "
            + frame["media_last_name"].fillna("").astype(str).str.strip()
        ).str.replace(r"\s+", " ", regex=True).str.strip()
    elif "player_name" in frame.columns:
        full_name = frame["player_name"].fillna("").astype(str).str.strip()
    else:
        full_name = pd.Series("", index=frame.index)

    short_name = (
        frame["short_name"].fillna("").astype(str).str.strip()
        if "short_name" in frame.columns
        else pd.Series("", index=frame.index)
    )
    player_name = full_name.where(full_name.ne(""), short_name)
    output = frame[["player_id"]].copy()
    output["player_name_key"] = player_name.map(normalize_person_key)
    return output.drop_duplicates("player_id")


def apply_availability_to_projected_lineups(
    projected_lineups: pd.DataFrame,
    availability: pd.DataFrame,
    profiles: pd.DataFrame,
) -> pd.DataFrame:
    """Apply official availability statuses to projected lineup rows."""
    if projected_lineups.empty or availability.empty or profiles.empty:
        return projected_lineups

    output = projected_lineups.copy()
    output["player_id"] = output["player_id"].astype(str)
    if "status" not in output.columns:
        output["status"] = "available"
    if "source" not in output.columns:
        output["source"] = "unknown"
    if "availability_reason" not in output.columns:
        output["availability_reason"] = pd.NA

    profile_names = _profile_names(profiles)
    availability_lookup = availability.copy()
    availability_lookup["team_key"] = availability_lookup["team"].map(normalize_team_key)
    if "player_name_key" not in availability_lookup.columns:
        availability_lookup["player_name_key"] = pd.NA
    availability_lookup["player_name_key"] = availability_lookup["player_name_key"].fillna(
        availability_lookup["player_name"].map(normalize_person_key)
    )
    keep_cols = [
        "team_key",
        "player_name_key",
        "status",
        "reason",
        "report_date",
        "source_url",
    ]
    for column in keep_cols:
        if column not in availability_lookup.columns:
            availability_lookup[column] = pd.NA
    availability_lookup = availability_lookup[keep_cols].drop_duplicates(
        ["team_key", "player_name_key"],
        keep="last",
    )

    enriched = output.merge(profile_names, on="player_id", how="left")
    enriched["team_key"] = enriched["team"].map(normalize_team_key)
    enriched = enriched.merge(
        availability_lookup,
        on=["team_key", "player_name_key"],
        how="left",
        suffixes=("", "_availability"),
    )
    matched = enriched["status_availability"].notna()
    enriched.loc[matched, "status"] = enriched.loc[matched, "status_availability"]
    enriched.loc[matched, "availability_reason"] = enriched.loc[matched, "reason"]
    if "availability_report_date" not in enriched.columns:
        enriched["availability_report_date"] = pd.NA
    if "availability_source_url" not in enriched.columns:
        enriched["availability_source_url"] = pd.NA
    enriched.loc[matched, "availability_report_date"] = enriched.loc[matched, "report_date"]
    enriched.loc[matched, "availability_source_url"] = enriched.loc[matched, "source_url"]
    source_text = enriched.loc[matched, "source"].astype(str)
    enriched.loc[matched, "source"] = source_text.where(
        source_text.str.contains("official_availability", regex=False),
        source_text + "+official_availability",
    )

    blocking = enriched["status"].astype(str).str.lower().isin(BLOCKING_STATUSES)
    if "projected_start" in enriched.columns:
        enriched.loc[blocking, "projected_start"] = False
    if "projected_minutes" in enriched.columns:
        enriched.loc[blocking, "projected_minutes"] = 0.0

    helper_cols = [
        "player_name_key",
        "team_key",
        "status_availability",
        "reason",
        "report_date",
        "source_url",
    ]
    return enriched.drop(columns=[column for column in helper_cols if column in enriched.columns])
