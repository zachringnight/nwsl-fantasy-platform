"""Shared contextual feature prep for training, backtesting, and serving."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

import pandas as pd

from src.data.transforms import add_npxg_fallback, add_result_columns, melt_to_team_match
from src.features.lineup_features import (
    compute_availability_features,
    compute_projected_lineup_delta,
)
from src.features.match_features import (
    build_match_features,
    compute_rolling_form,
    compute_season_stats,
)
from src.features.schedule_features import (
    add_short_rest_flags,
    compute_rest_days,
    compute_schedule_density,
)

DEFAULT_CONTEXTUAL_COLUMNS = [
    "home_roll_5_npxg_for",
    "home_roll_5_npxg_against",
    "home_season_avg_npxg_for",
    "home_season_avg_npxg_against",
    "home_season_matches_played",
    "home_team_goals_per_match",
    "home_team_goals_against_per_match",
    "home_team_shots_per_match",
    "home_team_points_per_match",
    "home_team_average_possession",
    "home_team_xg_per_match",
    "home_team_xg_against_per_match",
    "home_team_xpoints_per_match",
    "home_team_gplus_net_per90",
    "home_team_gplus_shooting_net_per90",
    "home_team_gplus_passing_net_per90",
    "home_team_gplus_receiving_net_per90",
    "home_rest_days",
    "home_short_rest",
    "home_matches_prev_14d",
    "home_n_starters",
    "home_n_injured",
    "home_lineup_strength",
    "away_roll_5_npxg_for",
    "away_roll_5_npxg_against",
    "away_season_avg_npxg_for",
    "away_season_avg_npxg_against",
    "away_season_matches_played",
    "away_team_goals_per_match",
    "away_team_goals_against_per_match",
    "away_team_shots_per_match",
    "away_team_points_per_match",
    "away_team_average_possession",
    "away_team_xg_per_match",
    "away_team_xg_against_per_match",
    "away_team_xpoints_per_match",
    "away_team_gplus_net_per90",
    "away_team_gplus_shooting_net_per90",
    "away_team_gplus_passing_net_per90",
    "away_team_gplus_receiving_net_per90",
    "away_rest_days",
    "away_short_rest",
    "away_matches_prev_14d",
    "away_n_starters",
    "away_n_injured",
    "away_lineup_strength",
    "rest_diff",
]

TEAM_PRIOR_COLUMNS = [
    "goals_per_match",
    "goals_against_per_match",
    "shots_per_match",
    "points_per_match",
    "average_possession",
    "xg_per_match",
    "xg_against_per_match",
    "xpoints_per_match",
    "gplus_net_per90",
    "gplus_shooting_net_per90",
    "gplus_passing_net_per90",
    "gplus_receiving_net_per90",
]

ASA_TEAM_CONTEXTUAL_COLUMNS = {
    "home_team_xg_against_per_match",
    "home_team_xpoints_per_match",
    "home_team_gplus_net_per90",
    "home_team_gplus_shooting_net_per90",
    "home_team_gplus_passing_net_per90",
    "home_team_gplus_receiving_net_per90",
    "away_team_xg_against_per_match",
    "away_team_xpoints_per_match",
    "away_team_gplus_net_per90",
    "away_team_gplus_shooting_net_per90",
    "away_team_gplus_passing_net_per90",
    "away_team_gplus_receiving_net_per90",
}

STRUCTURAL_ZERO_CONTEXT_COLUMNS = {
    "home_season_matches_played",
    "away_season_matches_played",
    "home_short_rest",
    "away_short_rest",
    "home_matches_prev_14d",
    "away_matches_prev_14d",
    "home_n_starters",
    "away_n_starters",
    "home_n_injured",
    "away_n_injured",
}


def _apply_contextual_missing_policy(
    prepared: pd.DataFrame,
    contextual_cols: list[str],
) -> tuple[pd.DataFrame, list[str]]:
    frame = prepared.copy()
    final_cols: list[str] = []

    for col in contextual_cols:
        if col not in frame.columns or col == "rest_diff":
            continue

        series = pd.to_numeric(frame[col], errors="coerce")
        if col in STRUCTURAL_ZERO_CONTEXT_COLUMNS:
            frame[col] = series.fillna(0.0)
            final_cols.append(col)
            continue

        missing_indicator = f"{col}_missing"
        missing_mask = series.isna()
        fill_value = float(series.mean()) if series.notna().any() else 0.0
        frame[col] = series.fillna(fill_value)
        frame[missing_indicator] = missing_mask.astype(float)
        final_cols.extend([col, missing_indicator])

    if "rest_diff" in contextual_cols and {"home_rest_days", "away_rest_days"}.issubset(frame.columns):
        frame["rest_diff"] = pd.to_numeric(frame["home_rest_days"], errors="coerce").fillna(0.0) - pd.to_numeric(
            frame["away_rest_days"], errors="coerce"
        ).fillna(0.0)
        final_cols.append("rest_diff")

    return frame, final_cols


def _player_ratings_map(
    lineup_model: Any | None,
    player_season_priors: Optional[pd.DataFrame] = None,
    reference_season: int | None = None,
) -> dict[str, float] | None:
    ratings: dict[str, float] = {}

    if player_season_priors is not None and not player_season_priors.empty:
        priors = player_season_priors.copy()
        priors["season"] = pd.to_numeric(player_season_priors["season"], errors="coerce")
        available_seasons = sorted(priors["season"].dropna().astype(int).unique().tolist())
        if reference_season is None and available_seasons:
            latest_season = max(available_seasons)
            target_season = latest_season - 1 if (latest_season - 1) in available_seasons else latest_season
        elif reference_season is not None and (reference_season - 1) in available_seasons:
            target_season = reference_season - 1
        else:
            target_season = max(available_seasons) if available_seasons else None
        latest_priors = priors[priors["season"] == target_season] if target_season is not None else priors.iloc[0:0]
        latest_priors = latest_priors.sort_values(["player_id", "season"]).drop_duplicates("player_id", keep="last")
        if "season_value_score" in latest_priors.columns:
            ratings.update(
                latest_priors.set_index("player_id")["season_value_score"]
                .fillna(0.0)
                .astype(float)
                .to_dict()
            )

    if lineup_model is None:
        return ratings or None
    try:
        ratings_df = lineup_model.to_dataframe()
    except Exception:
        return ratings or None
    if ratings_df.empty:
        return ratings or None
    learned = (
        ratings_df.set_index("player_id")["combined_rating"]
        .fillna(0.0)
        .astype(float)
        .to_dict()
    )
    ratings.update(learned)
    return ratings or None


def _merge_team_season_priors(
    matches: pd.DataFrame,
    team_season_priors: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    if team_season_priors is None or team_season_priors.empty:
        return matches

    prepared = matches.copy()
    priors = team_season_priors.copy()
    priors["season"] = pd.to_numeric(priors.get("season"), errors="coerce").astype("Int64")
    prepared["season"] = pd.to_numeric(prepared.get("season"), errors="coerce").astype("Int64")

    # Treat season priors as preseason baselines by shifting them forward one available season
    # per team. This avoids leaking end-of-season aggregates into historical backtests.
    priors = priors.sort_values(["team", "season"]).copy()
    prior_value_columns = [column for column in TEAM_PRIOR_COLUMNS if column in priors.columns]
    priors[prior_value_columns] = (
        priors.groupby("team", sort=False)[prior_value_columns].shift(1)
    )

    available_columns = ["season", "team"] + [
        column for column in TEAM_PRIOR_COLUMNS if column in priors.columns
    ]
    priors = priors[available_columns].copy()

    for prefix, team_col in (("home", "home_team"), ("away", "away_team")):
        rename_map = {
            "team": team_col,
            **{
                column: f"{prefix}_team_{column}"
                for column in TEAM_PRIOR_COLUMNS
                if column in priors.columns
            },
        }
        prepared = prepared.merge(
            priors.rename(columns=rename_map),
            on=["season", team_col],
            how="left",
        )

    return prepared


def build_contextual_training_frame(
    matches: pd.DataFrame,
    appearances: Optional[pd.DataFrame] = None,
    projected_lineups: Optional[pd.DataFrame] = None,
    team_season_priors: Optional[pd.DataFrame] = None,
    player_season_priors: Optional[pd.DataFrame] = None,
    lineup_model: Any | None = None,
    rolling_windows: list[int] | tuple[int, ...] = (3, 5, 10),
    short_rest_days: int = 4,
    include_team_priors: bool = True,
    include_lineup_features: bool = True,
    include_schedule_features: bool = True,
    include_asa_features: bool = True,
) -> tuple[pd.DataFrame, list[str]]:
    """Build a causal match-level feature frame and the contextual columns in use."""
    prepared = add_result_columns(matches)
    prepared = add_npxg_fallback(prepared)
    if include_schedule_features:
        prepared = compute_rest_days(prepared)
        prepared = add_short_rest_flags(prepared, short_rest_days)
        prepared = compute_schedule_density(prepared, windows_days=[14])

    team_matches = melt_to_team_match(prepared)
    team_matches = compute_rolling_form(team_matches, list(rolling_windows))
    team_matches = compute_season_stats(team_matches)
    prepared = build_match_features(prepared, team_matches, list(rolling_windows))
    if include_team_priors:
        prepared = _merge_team_season_priors(prepared, team_season_priors)
        if not include_asa_features:
            for column in ASA_TEAM_CONTEXTUAL_COLUMNS:
                if column in prepared.columns:
                    prepared[column] = pd.NA

    if include_lineup_features and appearances is not None and not appearances.empty:
        prepared = compute_availability_features(prepared, appearances)
    if include_lineup_features and projected_lineups is not None and not projected_lineups.empty:
        prepared = compute_projected_lineup_delta(
            prepared,
            projected_lineups,
            player_ratings=_player_ratings_map(
                lineup_model,
                player_season_priors if include_team_priors else None,
                reference_season=int(pd.to_numeric(prepared.get("season"), errors="coerce").dropna().max()) if "season" in prepared.columns and prepared["season"].notna().any() else None,
            ),
        )

    contextual_cols = [col for col in DEFAULT_CONTEXTUAL_COLUMNS if col in prepared.columns]
    if not include_schedule_features:
        contextual_cols = [
            col for col in contextual_cols
            if "rest" not in col and "matches_prev_14d" not in col
        ]
    if not include_lineup_features:
        contextual_cols = [
            col for col in contextual_cols
            if "lineup" not in col and "_n_starters" not in col and "_n_injured" not in col
        ]
    if not include_team_priors:
        contextual_cols = [
            col for col in contextual_cols
            if "_team_" not in col
        ]
    elif not include_asa_features:
        contextual_cols = [col for col in contextual_cols if col not in ASA_TEAM_CONTEXTUAL_COLUMNS]
    if contextual_cols:
        prepared, contextual_cols = _apply_contextual_missing_policy(prepared, contextual_cols)

    return prepared.sort_values(["match_date", "match_id"]).reset_index(drop=True), contextual_cols


@dataclass
class TeamContextState:
    last_match_date: date | None
    features: dict[str, float]


@dataclass
class ContextualFeatureProvider:
    """Lightweight provider for pre-match contextual features."""

    team_state: dict[str, TeamContextState]
    projected_lineup_strength: dict[str, float]
    short_rest_days: int = 4

    @classmethod
    def from_training_frame(
        cls,
        prepared_matches: pd.DataFrame,
        short_rest_days: int = 4,
    ) -> ContextualFeatureProvider:
        records: dict[str, TeamContextState] = {}

        def build_side(prefix: str, team_col: str) -> pd.DataFrame:
            keep_cols = [
                "match_date",
                team_col,
                f"{prefix}_roll_5_npxg_for",
                f"{prefix}_roll_5_npxg_against",
                f"{prefix}_season_avg_npxg_for",
                f"{prefix}_season_avg_npxg_against",
                f"{prefix}_season_matches_played",
                f"{prefix}_team_goals_per_match",
                f"{prefix}_team_goals_against_per_match",
                f"{prefix}_team_shots_per_match",
                f"{prefix}_team_points_per_match",
                f"{prefix}_team_average_possession",
                f"{prefix}_team_xg_per_match",
                f"{prefix}_team_xg_against_per_match",
                f"{prefix}_team_xpoints_per_match",
                f"{prefix}_team_gplus_net_per90",
                f"{prefix}_team_gplus_shooting_net_per90",
                f"{prefix}_team_gplus_passing_net_per90",
                f"{prefix}_team_gplus_receiving_net_per90",
                f"{prefix}_rest_days",
                f"{prefix}_matches_prev_14d",
                f"{prefix}_n_starters",
                f"{prefix}_n_injured",
                f"{prefix}_lineup_strength",
            ]
            keep_cols.extend(
                [
                    column
                    for column in prepared_matches.columns
                    if column.startswith(f"{prefix}_") and column.endswith("_missing")
                ]
            )
            existing = [col for col in keep_cols if col in prepared_matches.columns]
            frame = prepared_matches[existing].copy()
            rename_map = {
                team_col: "team",
                f"{prefix}_roll_5_npxg_for": "roll_5_npxg_for",
                f"{prefix}_roll_5_npxg_against": "roll_5_npxg_against",
                f"{prefix}_season_avg_npxg_for": "season_avg_npxg_for",
                f"{prefix}_season_avg_npxg_against": "season_avg_npxg_against",
                f"{prefix}_season_matches_played": "season_matches_played",
                f"{prefix}_team_goals_per_match": "team_goals_per_match",
                f"{prefix}_team_goals_against_per_match": "team_goals_against_per_match",
                f"{prefix}_team_shots_per_match": "team_shots_per_match",
                f"{prefix}_team_points_per_match": "team_points_per_match",
                f"{prefix}_team_average_possession": "team_average_possession",
                f"{prefix}_team_xg_per_match": "team_xg_per_match",
                f"{prefix}_team_xg_against_per_match": "team_xg_against_per_match",
                f"{prefix}_team_xpoints_per_match": "team_xpoints_per_match",
                f"{prefix}_team_gplus_net_per90": "team_gplus_net_per90",
                f"{prefix}_team_gplus_shooting_net_per90": "team_gplus_shooting_net_per90",
                f"{prefix}_team_gplus_passing_net_per90": "team_gplus_passing_net_per90",
                f"{prefix}_team_gplus_receiving_net_per90": "team_gplus_receiving_net_per90",
                f"{prefix}_rest_days": "rest_days",
                f"{prefix}_matches_prev_14d": "matches_prev_14d",
                f"{prefix}_n_starters": "n_starters",
                f"{prefix}_n_injured": "n_injured",
                f"{prefix}_lineup_strength": "lineup_strength",
            }
            rename_map.update(
                {
                    column: column.replace(f"{prefix}_", "", 1)
                    for column in existing
                    if column.startswith(f"{prefix}_") and column.endswith("_missing")
                }
            )
            return frame.rename(columns=rename_map)

        long_state = pd.concat(
            [
                build_side("home", "home_team"),
                build_side("away", "away_team"),
            ],
            ignore_index=True,
        ).sort_values(["team", "match_date"])

        for team, group in long_state.groupby("team", sort=False):
            latest = group.iloc[-1]
            features = {
                "roll_5_npxg_for": float(latest.get("roll_5_npxg_for", 0.0) or 0.0),
                "roll_5_npxg_against": float(latest.get("roll_5_npxg_against", 0.0) or 0.0),
                "season_avg_npxg_for": float(latest.get("season_avg_npxg_for", 0.0) or 0.0),
                "season_avg_npxg_against": float(latest.get("season_avg_npxg_against", 0.0) or 0.0),
                "season_matches_played": float(latest.get("season_matches_played", 0.0) or 0.0),
                "team_goals_per_match": float(latest.get("team_goals_per_match", 0.0) or 0.0),
                "team_goals_against_per_match": float(latest.get("team_goals_against_per_match", 0.0) or 0.0),
                "team_shots_per_match": float(latest.get("team_shots_per_match", 0.0) or 0.0),
                "team_points_per_match": float(latest.get("team_points_per_match", 0.0) or 0.0),
                "team_average_possession": float(latest.get("team_average_possession", 0.0) or 0.0),
                "team_xg_per_match": float(latest.get("team_xg_per_match", 0.0) or 0.0),
                "team_xg_against_per_match": float(latest.get("team_xg_against_per_match", 0.0) or 0.0),
                "team_xpoints_per_match": float(latest.get("team_xpoints_per_match", 0.0) or 0.0),
                "team_gplus_net_per90": float(latest.get("team_gplus_net_per90", 0.0) or 0.0),
                "team_gplus_shooting_net_per90": float(latest.get("team_gplus_shooting_net_per90", 0.0) or 0.0),
                "team_gplus_passing_net_per90": float(latest.get("team_gplus_passing_net_per90", 0.0) or 0.0),
                "team_gplus_receiving_net_per90": float(latest.get("team_gplus_receiving_net_per90", 0.0) or 0.0),
                "rest_days": float(latest.get("rest_days", 7.0) or 7.0),
                "matches_prev_14d": float(latest.get("matches_prev_14d", 0.0) or 0.0),
                "n_starters": float(latest.get("n_starters", 0.0) or 0.0),
                "n_injured": float(latest.get("n_injured", 0.0) or 0.0),
                "lineup_strength": float(latest.get("lineup_strength", 0.0) or 0.0),
            }
            for column in latest.index:
                if column.endswith("_missing"):
                    features[column] = float(latest.get(column, 0.0) or 0.0)
            records[str(team)] = TeamContextState(
                last_match_date=latest.get("match_date"),
                features=features,
            )

        return cls(team_state=records, projected_lineup_strength={}, short_rest_days=short_rest_days)

    def attach_projected_lineups(
        self,
        projected_lineups: Optional[pd.DataFrame] = None,
        lineup_model: Any | None = None,
        player_season_priors: Optional[pd.DataFrame] = None,
    ) -> ContextualFeatureProvider:
        strength_by_team: dict[str, float] = {}
        if projected_lineups is not None and not projected_lineups.empty:
            player_ratings = _player_ratings_map(lineup_model, player_season_priors) or {}
            starters = projected_lineups[projected_lineups["projected_start"].astype(bool)].copy()
            if starters.empty:
                strength_by_team = {}
            elif player_ratings:
                strength_by_team = (
                    starters.assign(player_rating=starters["player_id"].map(player_ratings).fillna(0.0))
                    .groupby("team")["player_rating"]
                    .sum()
                    .astype(float)
                    .to_dict()
                )
            else:
                strength_by_team = starters.groupby("team").size().astype(float).to_dict()
        self.projected_lineup_strength = strength_by_team
        return self

    def for_match(
        self,
        home_team: str,
        away_team: str,
        match_date: date | None = None,
    ) -> dict[str, float]:
        """Return the contextual feature dictionary for a fixture."""
        home_state = self.team_state.get(home_team, TeamContextState(last_match_date=None, features={}))
        away_state = self.team_state.get(away_team, TeamContextState(last_match_date=None, features={}))

        def derive_rest_days(state: TeamContextState) -> float:
            fallback = float(state.features.get("rest_days", 7.0) or 7.0)
            if match_date is None or state.last_match_date is None:
                return fallback
            return float(max((match_date - state.last_match_date).days, 0))

        home_rest_days = derive_rest_days(home_state)
        away_rest_days = derive_rest_days(away_state)

        contextual = {
            "home_roll_5_npxg_for": float(home_state.features.get("roll_5_npxg_for", 0.0)),
            "home_roll_5_npxg_against": float(home_state.features.get("roll_5_npxg_against", 0.0)),
            "home_season_avg_npxg_for": float(home_state.features.get("season_avg_npxg_for", 0.0)),
            "home_season_avg_npxg_against": float(home_state.features.get("season_avg_npxg_against", 0.0)),
            "home_season_matches_played": float(home_state.features.get("season_matches_played", 0.0)),
            "home_team_goals_per_match": float(home_state.features.get("team_goals_per_match", 0.0)),
            "home_team_goals_against_per_match": float(home_state.features.get("team_goals_against_per_match", 0.0)),
            "home_team_shots_per_match": float(home_state.features.get("team_shots_per_match", 0.0)),
            "home_team_points_per_match": float(home_state.features.get("team_points_per_match", 0.0)),
            "home_team_average_possession": float(home_state.features.get("team_average_possession", 0.0)),
            "home_team_xg_per_match": float(home_state.features.get("team_xg_per_match", 0.0)),
            "home_team_xg_against_per_match": float(home_state.features.get("team_xg_against_per_match", 0.0)),
            "home_team_xpoints_per_match": float(home_state.features.get("team_xpoints_per_match", 0.0)),
            "home_team_gplus_net_per90": float(home_state.features.get("team_gplus_net_per90", 0.0)),
            "home_team_gplus_shooting_net_per90": float(home_state.features.get("team_gplus_shooting_net_per90", 0.0)),
            "home_team_gplus_passing_net_per90": float(home_state.features.get("team_gplus_passing_net_per90", 0.0)),
            "home_team_gplus_receiving_net_per90": float(home_state.features.get("team_gplus_receiving_net_per90", 0.0)),
            "home_rest_days": home_rest_days,
            "home_short_rest": float(home_rest_days <= self.short_rest_days),
            "home_matches_prev_14d": float(home_state.features.get("matches_prev_14d", 0.0)),
            "home_n_starters": float(home_state.features.get("n_starters", 0.0)),
            "home_n_injured": float(home_state.features.get("n_injured", 0.0)),
            "home_lineup_strength": float(
                self.projected_lineup_strength.get(home_team, home_state.features.get("lineup_strength", 0.0))
            ),
            "away_roll_5_npxg_for": float(away_state.features.get("roll_5_npxg_for", 0.0)),
            "away_roll_5_npxg_against": float(away_state.features.get("roll_5_npxg_against", 0.0)),
            "away_season_avg_npxg_for": float(away_state.features.get("season_avg_npxg_for", 0.0)),
            "away_season_avg_npxg_against": float(away_state.features.get("season_avg_npxg_against", 0.0)),
            "away_season_matches_played": float(away_state.features.get("season_matches_played", 0.0)),
            "away_team_goals_per_match": float(away_state.features.get("team_goals_per_match", 0.0)),
            "away_team_goals_against_per_match": float(away_state.features.get("team_goals_against_per_match", 0.0)),
            "away_team_shots_per_match": float(away_state.features.get("team_shots_per_match", 0.0)),
            "away_team_points_per_match": float(away_state.features.get("team_points_per_match", 0.0)),
            "away_team_average_possession": float(away_state.features.get("team_average_possession", 0.0)),
            "away_team_xg_per_match": float(away_state.features.get("team_xg_per_match", 0.0)),
            "away_team_xg_against_per_match": float(away_state.features.get("team_xg_against_per_match", 0.0)),
            "away_team_xpoints_per_match": float(away_state.features.get("team_xpoints_per_match", 0.0)),
            "away_team_gplus_net_per90": float(away_state.features.get("team_gplus_net_per90", 0.0)),
            "away_team_gplus_shooting_net_per90": float(away_state.features.get("team_gplus_shooting_net_per90", 0.0)),
            "away_team_gplus_passing_net_per90": float(away_state.features.get("team_gplus_passing_net_per90", 0.0)),
            "away_team_gplus_receiving_net_per90": float(away_state.features.get("team_gplus_receiving_net_per90", 0.0)),
            "away_rest_days": away_rest_days,
            "away_short_rest": float(away_rest_days <= self.short_rest_days),
            "away_matches_prev_14d": float(away_state.features.get("matches_prev_14d", 0.0)),
            "away_n_starters": float(away_state.features.get("n_starters", 0.0)),
            "away_n_injured": float(away_state.features.get("n_injured", 0.0)),
            "away_lineup_strength": float(
                self.projected_lineup_strength.get(away_team, away_state.features.get("lineup_strength", 0.0))
            ),
        }
        for suffix in {key for key in home_state.features if key.endswith("_missing")}:
            contextual[f"home_{suffix}"] = float(home_state.features.get(suffix, 0.0))
        for suffix in {key for key in away_state.features if key.endswith("_missing")}:
            contextual[f"away_{suffix}"] = float(away_state.features.get(suffix, 0.0))
        contextual["rest_diff"] = contextual["home_rest_days"] - contextual["away_rest_days"]
        return contextual
