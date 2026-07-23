"""Roster continuity helpers for weighting previous-season priors.

The model uses the current season as the primary signal. Previous-season team
priors are still useful early in a season, but only when a meaningful share of
the roster carried over. These helpers estimate that carryover from season-level
player prior tables without using current-season production totals as signal.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class RosterContinuityInputs:
    returning_minutes_share: float
    returning_value_share: float
    defensive_spine_continuity: float
    attacking_core_continuity: float
    goalkeeper_continuity: float
    manager_continuity: float = 50.0


def _clamp_pct(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


def roster_continuity_score(inputs: RosterContinuityInputs) -> float:
    """Combine roster-retention components into a 0-100 score."""
    score = (
        0.30 * _clamp_pct(inputs.returning_minutes_share)
        + 0.25 * _clamp_pct(inputs.returning_value_share)
        + 0.15 * _clamp_pct(inputs.defensive_spine_continuity)
        + 0.10 * _clamp_pct(inputs.attacking_core_continuity)
        + 0.10 * _clamp_pct(inputs.goalkeeper_continuity)
        + 0.10 * _clamp_pct(inputs.manager_continuity)
    )
    return _clamp_pct(score)


def prior_weight_from_continuity(score: float, matches_played: int) -> float:
    """Return the historical-prior blend weight for a continuity score.

    The weight intentionally decays as current-season evidence accumulates.
    """
    score = _clamp_pct(score)
    if matches_played <= 2:
        if score >= 80:
            return 0.60
        if score >= 60:
            return 0.45
        if score >= 40:
            return 0.30
        if score >= 20:
            return 0.18
        return 0.08
    if matches_played <= 6:
        if score >= 80:
            return 0.50
        if score >= 60:
            return 0.35
        if score >= 40:
            return 0.22
        return 0.12
    if matches_played <= 12:
        if score >= 80:
            return 0.30
        if score >= 60:
            return 0.22
        if score >= 40:
            return 0.12
        return 0.07
    if score >= 80:
        return 0.15
    return 0.05


def _position_mask(frame: pd.DataFrame, terms: tuple[str, ...]) -> pd.Series:
    if "position" not in frame.columns:
        return pd.Series(False, index=frame.index)
    position = frame["position"].fillna("").astype(str).str.lower()
    return position.apply(lambda value: any(term in value for term in terms))


def _weighted_share(
    prior_team: pd.DataFrame,
    returning_player_ids: set[str],
    *,
    numerator_column: str,
    mask: pd.Series | None = None,
) -> float:
    subset = prior_team if mask is None else prior_team.loc[mask]
    if subset.empty or numerator_column not in subset.columns:
        return 0.0

    values = pd.to_numeric(subset[numerator_column], errors="coerce").fillna(0.0).clip(lower=0.0)
    denominator = float(values.sum())
    if denominator <= 0.0:
        return 0.0

    returning = subset["player_id"].astype(str).isin(returning_player_ids)
    numerator = float(values.loc[returning].sum())
    return 100.0 * numerator / denominator


def compute_roster_continuity(
    player_season_priors: pd.DataFrame | None,
    *,
    target_seasons: list[int] | None = None,
    default_manager_continuity: float = 50.0,
) -> pd.DataFrame:
    """Estimate team roster continuity for each season with prior-player data.

    Returning status is based on a player appearing for the same team in the
    target season's player-prior table. The score itself uses previous-season
    minutes/value, not target-season production, so it behaves as a prior.
    """
    columns = [
        "season",
        "team",
        "returning_minutes_share",
        "returning_value_share",
        "defensive_spine_continuity",
        "attacking_core_continuity",
        "goalkeeper_continuity",
        "manager_continuity",
        "roster_continuity_score",
        "preseason_historical_prior_weight",
    ]
    if player_season_priors is None or player_season_priors.empty:
        return pd.DataFrame(columns=columns)
    required = {"season", "team", "player_id"}
    if not required.issubset(player_season_priors.columns):
        return pd.DataFrame(columns=columns)

    priors = player_season_priors.copy()
    priors["season"] = pd.to_numeric(priors["season"], errors="coerce").astype("Int64")
    priors["team"] = priors["team"].astype(str)
    priors["player_id"] = priors["player_id"].astype(str)
    if "minutes_played" not in priors.columns:
        priors["minutes_played"] = 0.0
    priors["minutes_played"] = pd.to_numeric(priors["minutes_played"], errors="coerce").fillna(0.0)
    if "season_value_score" in priors.columns:
        priors["value_mass"] = (
            pd.to_numeric(priors["season_value_score"], errors="coerce").fillna(0.0).clip(lower=0.0)
            * priors["minutes_played"].clip(lower=0.0)
        )
    else:
        priors["value_mass"] = priors["minutes_played"].clip(lower=0.0)

    seasons = sorted(priors["season"].dropna().astype(int).unique().tolist())
    if target_seasons is None:
        target_seasons = [season for season in seasons if (season - 1) in seasons]
    else:
        target_seasons = sorted({int(season) for season in target_seasons})

    records: list[dict[str, float | int | str]] = []
    for season in target_seasons:
        prior = priors[priors["season"] == season - 1]
        current = priors[priors["season"] == season]
        if current.empty or prior.empty:
            continue

        teams = sorted(set(current["team"].dropna().astype(str)) | set(prior["team"].dropna().astype(str)))
        for team in teams:
            prior_team = prior[prior["team"] == team].copy()
            current_team = current[current["team"] == team].copy()
            if prior_team.empty:
                inputs = RosterContinuityInputs(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                score = roster_continuity_score(inputs)
                records.append({
                    "season": season,
                    "team": team,
                    "returning_minutes_share": 0.0,
                    "returning_value_share": 0.0,
                    "defensive_spine_continuity": 0.0,
                    "attacking_core_continuity": 0.0,
                    "goalkeeper_continuity": 0.0,
                    "manager_continuity": 0.0,
                    "roster_continuity_score": score,
                    "preseason_historical_prior_weight": 0.0,
                })
                continue

            returning_player_ids = set(
                prior_team.loc[
                    prior_team["player_id"].isin(set(current_team["player_id"].astype(str))),
                    "player_id",
                ].astype(str)
            )
            defensive_mask = _position_mask(prior_team, ("defender", "goalkeeper"))
            attacking_mask = _position_mask(prior_team, ("forward", "midfielder", "attacker"))
            goalkeeper_mask = _position_mask(prior_team, ("goalkeeper",))

            inputs = RosterContinuityInputs(
                returning_minutes_share=_weighted_share(
                    prior_team,
                    returning_player_ids,
                    numerator_column="minutes_played",
                ),
                returning_value_share=_weighted_share(
                    prior_team,
                    returning_player_ids,
                    numerator_column="value_mass",
                ),
                defensive_spine_continuity=_weighted_share(
                    prior_team,
                    returning_player_ids,
                    numerator_column="minutes_played",
                    mask=defensive_mask,
                ),
                attacking_core_continuity=_weighted_share(
                    prior_team,
                    returning_player_ids,
                    numerator_column="minutes_played",
                    mask=attacking_mask,
                ),
                goalkeeper_continuity=_weighted_share(
                    prior_team,
                    returning_player_ids,
                    numerator_column="minutes_played",
                    mask=goalkeeper_mask,
                ),
                manager_continuity=default_manager_continuity,
            )
            score = roster_continuity_score(inputs)
            records.append({
                "season": season,
                "team": team,
                "returning_minutes_share": inputs.returning_minutes_share,
                "returning_value_share": inputs.returning_value_share,
                "defensive_spine_continuity": inputs.defensive_spine_continuity,
                "attacking_core_continuity": inputs.attacking_core_continuity,
                "goalkeeper_continuity": inputs.goalkeeper_continuity,
                "manager_continuity": inputs.manager_continuity,
                "roster_continuity_score": score,
                "preseason_historical_prior_weight": prior_weight_from_continuity(score, matches_played=0),
            })

    return pd.DataFrame(records, columns=columns)
