"""Dynamic team ratings with exponential decay weighting.

Implements time-varying attack and defense strengths using recency-weighted
estimation. Designed for later upgrade to state-space / Bayesian random-walk.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray

logger = logging.getLogger("nwsl_model.models.team_ratings")


@dataclass
class TeamRatingsConfig:
    """Configuration for team ratings."""
    half_life_days: float = 90.0
    prior_weight: float = 5.0
    season_carryover: float = 0.6
    multi_season_decay: bool = True


@dataclass
class TeamRating:
    """Rating for a single team."""
    team: str
    attack: float = 0.0
    defense: float = 0.0
    n_matches: int = 0
    last_match_date: Optional[Any] = None


class TeamRatingsModel:
    """Compute recency-weighted team attack and defense ratings.

    Uses npxG as the primary signal. Ratings are relative to league average (0).

    Architecture note: This v1 uses exponential decay MLE. The interface is
    designed so that a future v2 can swap in a state-space / Kalman filter
    model with the same inputs/outputs.
    """

    def __init__(self, config: TeamRatingsConfig):
        self.config = config
        self.ratings: dict[str, TeamRating] = {}
        self._league_avg_attack: float = 0.0
        self._league_avg_defense: float = 0.0

    def compute_weights(
        self,
        match_dates: pd.Series,
        reference_date: Any,
    ) -> NDArray[np.float64]:
        """Compute exponential decay weights relative to a reference date.

        weight_i = exp(-days_since_i * ln(2) / half_life)
        """
        days_since = np.array([
            (reference_date - d).days if hasattr(reference_date - d, "days")
            else int(reference_date - d)
            for d in match_dates
        ], dtype=np.float64)
        days_since = np.maximum(days_since, 0)
        return np.exp(-days_since * math.log(2) / self.config.half_life_days)

    def compute_season_weights(
        self,
        match_seasons: pd.Series,
        current_season: int,
    ) -> NDArray[np.float64]:
        """Apply additional season-based decay for multi-season data."""
        if not self.config.multi_season_decay:
            return np.ones(len(match_seasons), dtype=np.float64)

        seasons_ago = current_season - match_seasons.values
        return np.power(self.config.season_carryover, np.maximum(seasons_ago, 0))

    def fit(
        self,
        team_matches: pd.DataFrame,
        reference_date: Any = None,
        current_season: Optional[int] = None,
    ) -> dict[str, TeamRating]:
        """Compute team ratings from historical team-match data.

        Args:
            team_matches: Long-format team-match data with columns:
                team, match_date, season, npxg_for, npxg_against, is_home
            reference_date: Date to compute recency weights from.
                If None, uses the max match_date.
            current_season: Current season for multi-season decay.

        Returns:
            Dictionary of team -> TeamRating.
        """
        if reference_date is None:
            reference_date = team_matches["match_date"].max()
        if current_season is None:
            current_season = team_matches["season"].max()

        # Compute recency weights
        time_weights = self.compute_weights(team_matches["match_date"], reference_date)
        season_weights = self.compute_season_weights(
            team_matches["season"], current_season
        )
        weights = time_weights * season_weights

        # League averages (weighted)
        total_w = weights.sum()
        if total_w > 0:
            self._league_avg_attack = np.average(
                team_matches["npxg_for"].values, weights=weights
            )
            self._league_avg_defense = np.average(
                team_matches["npxg_against"].values, weights=weights
            )

        # Per-team weighted ratings
        teams = team_matches["team"].unique()
        self.ratings = {}

        for team in teams:
            mask = team_matches["team"] == team
            team_data = team_matches[mask]
            team_w = weights[mask.values]

            w_sum = team_w.sum()
            if w_sum < 1e-10:
                # Very sparse: use league average
                self.ratings[team] = TeamRating(
                    team=team,
                    attack=0.0,
                    defense=0.0,
                    n_matches=len(team_data),
                )
                continue

            # Shrinkage: blend with league average based on effective sample size
            eff_n = w_sum
            prior_w = self.config.prior_weight
            shrink = prior_w / (eff_n + prior_w)

            # Weighted mean npxG for and against
            w_att = np.average(team_data["npxg_for"].values, weights=team_w)
            w_def = np.average(team_data["npxg_against"].values, weights=team_w)

            # Ratings relative to league average, with shrinkage toward 0
            attack = (1 - shrink) * (w_att - self._league_avg_attack)
            defense = (1 - shrink) * (w_def - self._league_avg_defense)

            self.ratings[team] = TeamRating(
                team=team,
                attack=attack,
                defense=defense,
                n_matches=len(team_data),
                last_match_date=team_data["match_date"].max(),
            )

        logger.info(
            f"Computed ratings for {len(self.ratings)} teams "
            f"(league avg attack={self._league_avg_attack:.3f}, "
            f"defense={self._league_avg_defense:.3f})"
        )

        return self.ratings

    def get_rating(self, team: str) -> TeamRating:
        """Get a team's rating, defaulting to league average for unknown teams."""
        if team in self.ratings:
            return self.ratings[team]
        logger.warning(f"Unknown team '{team}'. Using league-average rating.")
        return TeamRating(team=team, attack=0.0, defense=0.0, n_matches=0)

    def get_attack(self, team: str) -> float:
        return self.get_rating(team).attack

    def get_defense(self, team: str) -> float:
        return self.get_rating(team).defense

    def to_dataframe(self) -> pd.DataFrame:
        """Export ratings as a DataFrame."""
        records = []
        for team, r in self.ratings.items():
            records.append({
                "team": team,
                "attack_rating": r.attack,
                "defense_rating": r.defense,
                "n_matches": r.n_matches,
                "last_match_date": r.last_match_date,
            })
        return pd.DataFrame(records).sort_values("attack_rating", ascending=False)
