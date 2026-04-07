"""Player-level lineup adjustment using regularized adjusted plus-minus.

Estimates player attack and defense contributions from stint-level or
starter-level data, then translates projected lineup differences into
match-level scoring adjustments.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

logger = logging.getLogger("nwsl_model.models.lineup_adjustment")


class LineupAdjustmentModel:
    """Adjusted plus-minus model for player-level impact on npxG.

    Preferred approach: Ridge regression on stint-level npxG differential.
    Fallback: Starter-based approximation when only starting XI data exists.
    """

    def __init__(
        self,
        ridge_alpha: float = 100.0,
        min_minutes: int = 200,
        split_attack_defense: bool = True,
    ):
        self.ridge_alpha = ridge_alpha
        self.min_minutes = min_minutes
        self.split_attack_defense = split_attack_defense
        self._player_ids: list[str] = []
        self._attack_ratings: dict[str, float] = {}
        self._defense_ratings: dict[str, float] = {}
        self._combined_ratings: dict[str, float] = {}
        self._fitted = False

    def fit(
        self,
        appearances: pd.DataFrame,
        matches: pd.DataFrame,
    ) -> dict[str, float]:
        """Fit player ratings from appearance and match data.

        Args:
            appearances: Player appearance records with match_id, player_id,
                        team, start_minute, end_minute, started_flag.
            matches: Match data with match_id, home_team, away_team,
                    home_npxg, away_npxg (or goals as fallback).

        Returns:
            Dictionary of player_id -> combined rating.
        """
        if appearances is None or appearances.empty:
            logger.warning("No appearance data. Lineup adjustment disabled.")
            return {}

        # Filter to players with enough minutes
        player_minutes = appearances.groupby("player_id").apply(
            lambda g: (g["end_minute"] - g["start_minute"]).sum()
        ).reset_index(name="total_minutes")
        eligible = player_minutes[player_minutes["total_minutes"] >= self.min_minutes]
        self._player_ids = sorted(eligible["player_id"].tolist())

        if len(self._player_ids) < 5:
            logger.warning(f"Only {len(self._player_ids)} eligible players. Skipping APM fit.")
            return {}

        logger.info(f"Fitting APM with {len(self._player_ids)} players")

        # Build design matrix from stints
        # Each stint creates a row: players on field for team vs opponent
        # Target: npxG differential per 90 for that stint
        stints = self._build_stint_data(appearances, matches)
        if stints.empty:
            logger.warning("No valid stints built. Skipping APM fit.")
            return {}

        player_idx = {pid: i for i, pid in enumerate(self._player_ids)}
        n_players = len(self._player_ids)

        X_rows = []
        y_rows = []
        w_rows = []

        for _, stint in stints.iterrows():
            row = np.zeros(n_players, dtype=np.float64)
            for pid in stint.get("team_players", []):
                if pid in player_idx:
                    row[player_idx[pid]] = 1.0
            for pid in stint.get("opponent_players", []):
                if pid in player_idx:
                    row[player_idx[pid]] = -1.0
            X_rows.append(row)
            y_rows.append(stint["npxg_diff_per90"])
            w_rows.append(stint["minutes"])

        X = np.array(X_rows)
        y = np.array(y_rows)
        w = np.array(w_rows)
        w = w / w.sum() * len(w)  # normalize weights

        # Fit ridge regression
        model = Ridge(alpha=self.ridge_alpha, fit_intercept=True)
        model.fit(X, y, sample_weight=w)

        for i, pid in enumerate(self._player_ids):
            self._combined_ratings[pid] = float(model.coef_[i])

        if self.split_attack_defense:
            self._fit_attack_defense(appearances, matches, player_idx)

        self._fitted = True
        logger.info(f"Fitted APM ratings for {len(self._combined_ratings)} players")
        return self._combined_ratings

    def _build_stint_data(
        self, appearances: pd.DataFrame, matches: pd.DataFrame,
    ) -> pd.DataFrame:
        """Build stint-level observations for APM.

        A stint is a period where the same set of players is on the field.
        For simplicity in v1, we use starter-based stints (start to first sub).
        """
        records = []

        for match_id in appearances["match_id"].unique():
            match_apps = appearances[appearances["match_id"] == match_id]
            match_info = matches[matches["match_id"] == match_id]
            if match_info.empty:
                continue
            match_info = match_info.iloc[0]

            for team_col, npxg_for_col, npxg_against_col in [
                ("home_team", "home_npxg", "away_npxg"),
                ("away_team", "away_npxg", "home_npxg"),
            ]:
                team = match_info[team_col]
                opponent = (
                    match_info["away_team"] if team_col == "home_team"
                    else match_info["home_team"]
                )

                team_starters = match_apps[
                    (match_apps["team"] == team) & (match_apps["started_flag"])
                ]["player_id"].tolist()

                opp_starters = match_apps[
                    (match_apps["team"] == opponent) & (match_apps["started_flag"])
                ]["player_id"].tolist()

                npxg_for = match_info.get(npxg_for_col, np.nan)
                npxg_against = match_info.get(npxg_against_col, np.nan)

                if pd.isna(npxg_for) or pd.isna(npxg_against):
                    continue

                records.append({
                    "match_id": match_id,
                    "team": team,
                    "team_players": team_starters,
                    "opponent_players": opp_starters,
                    "npxg_diff_per90": npxg_for - npxg_against,
                    "minutes": 90,
                })

        return pd.DataFrame(records)

    def _fit_attack_defense(
        self,
        appearances: pd.DataFrame,
        matches: pd.DataFrame,
        player_idx: dict[str, int],
    ) -> None:
        """Fit separate attack and defense ratings."""
        stints = self._build_stint_data(appearances, matches)
        if stints.empty:
            return

        n_players = len(self._player_ids)

        for target_col, rating_dict in [
            ("npxg_for", self._attack_ratings),
            ("npxg_against", self._defense_ratings),
        ]:
            X_rows = []
            y_rows = []
            w_rows = []

            for _, stint in stints.iterrows():
                row = np.zeros(n_players, dtype=np.float64)

                if target_col == "npxg_for":
                    # Attack: team players contribute positively
                    for pid in stint.get("team_players", []):
                        if pid in player_idx:
                            row[player_idx[pid]] = 1.0
                else:
                    # Defense: team players contribute negatively (lower = better)
                    for pid in stint.get("team_players", []):
                        if pid in player_idx:
                            row[player_idx[pid]] = 1.0

                X_rows.append(row)
                # Reconstruct per-side npxG from diff
                diff = stint["npxg_diff_per90"]
                if target_col == "npxg_for":
                    y_rows.append(diff / 2.0)  # approximation
                else:
                    y_rows.append(-diff / 2.0)
                w_rows.append(stint["minutes"])

            if not X_rows:
                continue

            X = np.array(X_rows)
            y = np.array(y_rows)
            w = np.array(w_rows)
            w = w / w.sum() * len(w)

            model = Ridge(alpha=self.ridge_alpha, fit_intercept=True)
            model.fit(X, y, sample_weight=w)

            for i, pid in enumerate(self._player_ids):
                rating_dict[pid] = float(model.coef_[i])

    def get_lineup_effect(
        self,
        player_ids: list[str],
        component: str = "combined",
    ) -> float:
        """Get the total lineup effect for a set of players.

        Args:
            player_ids: List of player IDs in the lineup.
            component: "combined", "attack", or "defense".

        Returns:
            Sum of player ratings for the given component.
        """
        if not self._fitted:
            return 0.0

        ratings = {
            "combined": self._combined_ratings,
            "attack": self._attack_ratings,
            "defense": self._defense_ratings,
        }.get(component, self._combined_ratings)

        return sum(ratings.get(pid, 0.0) for pid in player_ids)

    def get_match_lineup_adjustments(
        self,
        home_players: list[str],
        away_players: list[str],
    ) -> dict[str, float]:
        """Compute match-level lineup adjustments.

        Returns:
            Dict with lineup_att_home, lineup_def_home, lineup_att_away, lineup_def_away.
        """
        if not self._fitted or not self._attack_ratings:
            return {
                "lineup_att_home": 0.0,
                "lineup_def_home": 0.0,
                "lineup_att_away": 0.0,
                "lineup_def_away": 0.0,
            }

        return {
            "lineup_att_home": self.get_lineup_effect(home_players, "attack"),
            "lineup_def_home": self.get_lineup_effect(home_players, "defense"),
            "lineup_att_away": self.get_lineup_effect(away_players, "attack"),
            "lineup_def_away": self.get_lineup_effect(away_players, "defense"),
        }

    def to_dataframe(self) -> pd.DataFrame:
        """Export player ratings as DataFrame."""
        records = []
        for pid in self._player_ids:
            records.append({
                "player_id": pid,
                "combined_rating": self._combined_ratings.get(pid, 0.0),
                "attack_rating": self._attack_ratings.get(pid, 0.0),
                "defense_rating": self._defense_ratings.get(pid, 0.0),
            })
        return pd.DataFrame(records).sort_values("combined_rating", ascending=False)
