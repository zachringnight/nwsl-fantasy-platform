"""Canonical NWSL team naming helpers shared across model scripts."""

from __future__ import annotations

import re
import unicodedata

TEAM_ALIASES: dict[str, str] = {
    "angel city": "Angel City FC",
    "angel city fc": "Angel City FC",
    "bay": "Bay FC",
    "bay fc": "Bay FC",
    "boston breakers": "Boston Breakers",
    "boston legacy": "Boston Legacy",
    "boston legacy fc": "Boston Legacy",
    "chicago red stars": "Chicago Stars",
    "chicago stars": "Chicago Stars",
    "chicago stars fc": "Chicago Stars",
    "denver summit": "Denver Summit",
    "denver summit fc": "Denver Summit",
    "fc kansas city": "FC Kansas City",
    "gotham": "Gotham FC",
    "gotham fc": "Gotham FC",
    "houston dash": "Houston Dash",
    "kansas city current": "Current",
    "kc current": "Current",
    "north carolina courage": "NC Courage",
    "nc courage": "NC Courage",
    "nj ny gotham fc": "Gotham FC",
    "njny gotham fc": "Gotham FC",
    "ol reign": "Reign",
    "orlando pride": "Orlando Pride",
    "portland thorns": "Portland Thorns",
    "portland thorns fc": "Portland Thorns",
    "racing louisville": "Racing Louisville",
    "racing louisville fc": "Racing Louisville",
    "reign fc": "Reign",
    "san diego wave": "SD Wave",
    "san diego wave fc": "SD Wave",
    "seattle reign": "Reign",
    "seattle reign fc": "Reign",
    "sky blue fc": "Gotham FC",
    "utah royals": "Royals",
    "utah royals fc": "Royals",
    "washington spirit": "Washington Spirit",
    "western new york flash": "Western New York Flash",
}


def normalize_team_key(value: str) -> str:
    """Normalize team text to a stable lookup key."""
    normalized = unicodedata.normalize("NFD", value or "")
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    return normalized


def canonicalize_team_name(value: str) -> str:
    """Map a source team label into the canonical model naming."""
    key = normalize_team_key(value)
    return TEAM_ALIASES.get(key, value.strip())
