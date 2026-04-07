"""Odds provider integration and normalization helpers."""

from src.odds.provider import (
    OddsProviderConfig,
    TheOddsAPIClient,
    build_consensus_match_odds,
    canonicalize_main_total_rows,
    fetch_historical_closing_odds,
    load_official_match_reference,
    load_provider_config,
    merge_odds_history,
    normalize_provider_payload,
)
from src.odds.quality import build_odds_quality_report

__all__ = [
    "OddsProviderConfig",
    "TheOddsAPIClient",
    "build_consensus_match_odds",
    "build_odds_quality_report",
    "canonicalize_main_total_rows",
    "fetch_historical_closing_odds",
    "load_official_match_reference",
    "load_provider_config",
    "merge_odds_history",
    "normalize_provider_payload",
]
