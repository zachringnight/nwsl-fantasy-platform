from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from src.features.context import ContextualFeatureProvider
from src.models.baseline import ProjectionBaselineModel
from src.models.spi_lite import SpiLiteBaseline


class _FakeRatings:
    def __init__(self, ratings: dict[str, tuple[float, float]] | None = None) -> None:
        self.ratings = ratings or {}

    def get_rating(self, team: str) -> SimpleNamespace:
        attack, defense = self.ratings.get(team, (0.0, 0.0))
        return SimpleNamespace(attack=attack, defense=defense, n_matches=8)


def _context(**overrides: float) -> dict[str, float]:
    base = {
        "home_season_avg_npxg_for": 1.55,
        "home_roll_5_npxg_for": 1.70,
        "home_season_avg_npxg_against": 0.95,
        "home_roll_5_npxg_against": 1.05,
        "home_team_xg_per_match": 1.40,
        "home_team_xg_against_per_match": 1.05,
        "home_team_goals_per_match": 1.35,
        "home_team_goals_against_per_match": 1.10,
        "home_season_matches_played": 8.0,
        "home_roster_historical_prior_weight": 0.35,
        "home_lineup_strength_delta": 0.0,
        "away_season_avg_npxg_for": 1.05,
        "away_roll_5_npxg_for": 0.95,
        "away_season_avg_npxg_against": 1.45,
        "away_roll_5_npxg_against": 1.55,
        "away_team_xg_per_match": 1.20,
        "away_team_xg_against_per_match": 1.30,
        "away_team_goals_per_match": 1.15,
        "away_team_goals_against_per_match": 1.35,
        "away_season_matches_played": 8.0,
        "away_roster_historical_prior_weight": 0.35,
        "away_lineup_strength_delta": 0.0,
        "rest_diff": 0.0,
    }
    base.update(overrides)
    return base


def test_spi_lite_baseline_returns_valid_score_matrix() -> None:
    model = SpiLiteBaseline(
        ratings_model=_FakeRatings({"Home": (0.15, -0.10), "Away": (-0.05, 0.20)}),
        league_home_rate=1.25,
        league_away_rate=1.05,
        max_goals=8,
    )

    pred = model.predict_score_matrix("Home", "Away", contextual_features=_context())

    assert pred.metadata["model"] == "spi_lite_baseline"
    assert pred.score_matrix.shape == (9, 9)
    assert abs(float(np.sum(pred.score_matrix)) - 1.0) < 1e-12
    assert abs(pred.home_win_prob + pred.draw_prob + pred.away_win_prob - 1.0) < 1e-12
    assert pred.lambda_home > pred.lambda_away


def test_spi_lite_lineup_delta_moves_projection_toward_stronger_xi() -> None:
    model = SpiLiteBaseline(league_home_rate=1.25, league_away_rate=1.05, max_goals=8)

    neutral = model.predict_score_matrix("Home", "Away", contextual_features=_context())
    stronger_home_xi = model.predict_score_matrix(
        "Home",
        "Away",
        contextual_features=_context(home_lineup_strength_delta=2.0, away_lineup_strength_delta=-1.0),
    )

    assert stronger_home_xi.lambda_home > neutral.lambda_home
    assert stronger_home_xi.lambda_away < neutral.lambda_away
    assert stronger_home_xi.home_win_prob > neutral.home_win_prob


def test_projection_team_ratings_treat_positive_defense_as_weaker_defense() -> None:
    neutral = ProjectionBaselineModel(
        strategy="team_ratings_poisson",
        ratings_model=_FakeRatings({"Home": (0.0, 0.0), "Away": (0.0, 0.0)}),
    )
    weak_away_defense = ProjectionBaselineModel(
        strategy="team_ratings_poisson",
        ratings_model=_FakeRatings({"Home": (0.0, 0.0), "Away": (0.0, 0.45)}),
    )

    neutral_home_lambda, _ = neutral._resolve_lambdas("Home", "Away")
    weak_defense_home_lambda, _ = weak_away_defense._resolve_lambdas("Home", "Away")

    assert weak_defense_home_lambda > neutral_home_lambda


def test_context_provider_exposes_roster_prior_and_lineup_delta() -> None:
    prepared = pd.DataFrame(
        [
            {
                "match_date": date(2026, 5, 1),
                "home_team": "Home",
                "away_team": "Away",
                "home_lineup_strength": 4.0,
                "away_lineup_strength": 4.2,
                "home_roster_historical_prior_weight": 0.35,
                "away_roster_historical_prior_weight": 0.20,
            }
        ]
    )
    projected = pd.DataFrame(
        [
            {
                "match_id": "m2",
                "team": "Home",
                "player_id": "p1",
                "projected_start": True,
                "projected_minutes": 90,
                "status": "available",
            }
        ]
    )
    priors = pd.DataFrame(
        [{"season": 2026, "player_id": "p1", "team": "Home", "season_value_score": 0.7}]
    )

    provider = ContextualFeatureProvider.from_training_frame(prepared).attach_projected_lineups(
        projected_lineups=projected,
        player_season_priors=priors,
    )
    context = provider.for_match("Home", "Away", match_id="m2")

    assert context["home_roster_historical_prior_weight"] == pytest.approx(0.35)
    assert context["away_roster_historical_prior_weight"] == pytest.approx(0.20)
    assert context["home_lineup_normal_strength"] == pytest.approx(4.0)
    assert context["home_lineup_strength"] == pytest.approx(0.7)
    assert context["home_lineup_strength_delta"] == pytest.approx(-3.3)
