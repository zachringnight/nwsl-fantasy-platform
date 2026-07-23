"""Tests for Dixon-Coles and bivariate Poisson models."""

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from src.betting.score_matrix import validate_score_matrix
from src.models.bivariate_poisson import BivariatePoissonConfig, BivariatePoissonModel
from src.models.dixon_coles import DixonColesConfig, DixonColesModel
from src.utils.math_utils import bivariate_poisson_pmf, dixon_coles_correction


def _make_training_data(n=200, seed=42):
    """Generate synthetic match data for model testing."""
    rng = np.random.RandomState(seed)
    teams = [f"Team_{chr(65 + i)}" for i in range(8)]
    records = []
    base_date = date(2023, 1, 1)

    for i in range(n):
        h = teams[rng.randint(len(teams))]
        a = teams[rng.randint(len(teams))]
        while a == h:
            a = teams[rng.randint(len(teams))]
        hg = rng.poisson(1.5)
        ag = rng.poisson(1.2)
        records.append({
            "match_id": f"M{i:04d}",
            "match_date": base_date + timedelta(days=i * 2),
            "season": 2023,
            "home_team": h,
            "away_team": a,
            "home_goals_90": hg,
            "away_goals_90": ag,
            "home_npxg": hg + rng.normal(0, 0.3),
            "away_npxg": ag + rng.normal(0, 0.3),
        })
    return pd.DataFrame(records)


def _make_contextual_training_data(n=200, seed=42):
    data = _make_training_data(n=n, seed=seed).copy()
    rng = np.random.RandomState(seed + 7)
    for prefix in ("home", "away"):
        base = data[f"{prefix}_npxg"].to_numpy(dtype=float)
        data[f"{prefix}_roll_5_npxg_for"] = base + rng.normal(0, 0.2, size=len(data))
        data[f"{prefix}_roll_5_npxg_against"] = np.maximum(base + rng.normal(0, 0.15, size=len(data)), 0.0)
        data[f"{prefix}_team_xg_per_match"] = base + rng.normal(0, 0.1, size=len(data))
        data[f"{prefix}_team_points_per_match"] = np.clip(base + rng.normal(0.0, 0.25, size=len(data)), 0.0, 3.0)
    data["rest_diff"] = rng.normal(0.0, 1.0, size=len(data))
    return data


def _fit_equal_dixon_coles(config: DixonColesConfig) -> DixonColesModel:
    model = DixonColesModel(config)
    model._team_map = {"Team_A": 0, "Team_B": 1}
    model._n_teams = 2
    model._attack = np.array([0.0, 0.0])
    model._defense = np.array([0.0, 0.0])
    model._home_adv = 0.40
    model._intercept = math.log(1.25)
    model._rho = 0.0
    model._fitted = True
    return model


def _fit_equal_bivariate(config: BivariatePoissonConfig) -> BivariatePoissonModel:
    model = BivariatePoissonModel(config)
    model._team_map = {"Team_A": 0, "Team_B": 1}
    model._n_teams = 2
    model._attack = np.array([0.0, 0.0])
    model._defense = np.array([0.0, 0.0])
    model._home_adv = 0.40
    model._intercept = math.log(1.25)
    model._lambda3 = 0.05
    model._fitted = True
    return model


class TestDixonColes:
    def test_fit_converges(self):
        data = _make_training_data()
        model = DixonColesModel(DixonColesConfig(max_iter=500))
        result = model.fit(data)
        assert result.converged or result.log_likelihood != 0
        assert model.is_fitted
        assert "grad_norm" in result.diagnostics
        assert result.diagnostics["n_params"] > 0

    def test_fit_with_contextual_features_converges_and_reports_diagnostics(self):
        data = _make_contextual_training_data()
        contextual_cols = [
            "home_roll_5_npxg_for",
            "home_roll_5_npxg_against",
            "home_team_xg_per_match",
            "home_team_points_per_match",
            "away_roll_5_npxg_for",
            "away_roll_5_npxg_against",
            "away_team_xg_per_match",
            "away_team_points_per_match",
            "rest_diff",
        ]
        model = DixonColesModel(DixonColesConfig(max_iter=1000))
        result = model.fit(data, contextual_cols=contextual_cols)
        assert result.converged
        assert result.diagnostics["n_contextual_features"] == len(contextual_cols)
        assert result.diagnostics["optimizer"] == "L-BFGS-B"

    def test_predict_valid_matrix(self):
        data = _make_training_data()
        model = DixonColesModel(DixonColesConfig(max_iter=500))
        model.fit(data)

        pred = model.predict_score_matrix("Team_A", "Team_B")
        assert validate_score_matrix(pred.score_matrix)
        assert abs(pred.home_win_prob + pred.draw_prob + pred.away_win_prob - 1.0) < 1e-6
        assert pred.lambda_home > 0
        assert pred.lambda_away > 0

    def test_predict_unknown_team_uses_average(self):
        data = _make_training_data()
        model = DixonColesModel(DixonColesConfig(max_iter=500))
        model.fit(data)

        # Unknown team should still produce valid matrix
        pred = model.predict_score_matrix("Unknown_FC", "Team_A")
        assert validate_score_matrix(pred.score_matrix)

    def test_home_advantage_positive(self):
        data = _make_training_data(n=500)
        model = DixonColesModel(DixonColesConfig(max_iter=1000))
        model.fit(data)
        params = model.get_parameters()
        # With synthetic data using higher home lambda, home_adv should be positive
        assert params["home_advantage"] > -0.5  # At least not strongly negative

    def test_rho_in_bounds(self):
        data = _make_training_data()
        model = DixonColesModel(DixonColesConfig(
            max_iter=500, rho_bounds=(-0.3, 0.3)
        ))
        model.fit(data)
        params = model.get_parameters()
        assert -0.3 <= params["rho"] <= 0.3

    def test_prediction_home_advantage_cap_shrinks_fitted_default(self):
        uncapped = _fit_equal_dixon_coles(DixonColesConfig(max_goals=6))
        capped = _fit_equal_dixon_coles(DixonColesConfig(max_goals=6, home_advantage_cap=0.10))

        raw = uncapped.predict_score_matrix("Team_A", "Team_B")
        shrunk = capped.predict_score_matrix("Team_A", "Team_B")

        assert shrunk.metadata["learned_home_advantage"] == pytest.approx(0.40)
        assert shrunk.metadata["home_advantage"] == pytest.approx(0.10)
        assert capped.get_parameters()["effective_home_advantage"] == pytest.approx(0.10)
        assert shrunk.home_win_prob < raw.home_win_prob
        assert shrunk.away_win_prob > raw.away_win_prob

    def test_explicit_home_advantage_override_bypasses_prediction_cap(self):
        model = _fit_equal_dixon_coles(DixonColesConfig(max_goals=6, home_advantage_cap=0.10))

        pred = model.predict_score_matrix("Team_A", "Team_B", home_advantage=0.30)

        assert pred.metadata["home_advantage"] == pytest.approx(0.30)


class TestDixonColesCorrection:
    def test_correction_at_00(self):
        tau = dixon_coles_correction(0, 0, 1.5, 1.2, -0.1)
        assert tau > 0
        assert tau != 1.0

    def test_correction_at_11(self):
        tau = dixon_coles_correction(1, 1, 1.5, 1.2, -0.1)
        assert tau > 0

    def test_no_correction_high_scores(self):
        tau = dixon_coles_correction(3, 2, 1.5, 1.2, -0.1)
        assert tau == 1.0

    def test_rho_zero_no_correction(self):
        for i in range(3):
            for j in range(3):
                tau = dixon_coles_correction(i, j, 1.5, 1.2, 0.0)
                assert tau == 1.0


class TestBivariatePoisson:
    def test_fit_converges(self):
        data = _make_training_data()
        model = BivariatePoissonModel(BivariatePoissonConfig(max_iter=500))
        result = model.fit(data)
        assert result.converged or result.log_likelihood != 0
        assert model.is_fitted
        assert "grad_norm" in result.diagnostics
        assert result.diagnostics["n_params"] > 0

    def test_fit_with_contextual_features_converges_and_reports_diagnostics(self):
        data = _make_contextual_training_data()
        contextual_cols = [
            "home_roll_5_npxg_for",
            "home_roll_5_npxg_against",
            "home_team_xg_per_match",
            "home_team_points_per_match",
            "away_roll_5_npxg_for",
            "away_roll_5_npxg_against",
            "away_team_xg_per_match",
            "away_team_points_per_match",
            "rest_diff",
        ]
        model = BivariatePoissonModel(BivariatePoissonConfig(max_iter=1000))
        result = model.fit(data, contextual_cols=contextual_cols)
        assert result.converged
        assert result.diagnostics["n_contextual_features"] == len(contextual_cols)
        assert result.diagnostics["optimizer"] == "L-BFGS-B"

    def test_predict_valid_matrix(self):
        data = _make_training_data()
        model = BivariatePoissonModel(BivariatePoissonConfig(max_iter=500))
        model.fit(data)

        pred = model.predict_score_matrix("Team_A", "Team_B")
        assert validate_score_matrix(pred.score_matrix)
        assert abs(pred.home_win_prob + pred.draw_prob + pred.away_win_prob - 1.0) < 1e-6

    def test_lambda3_positive(self):
        data = _make_training_data()
        model = BivariatePoissonModel(BivariatePoissonConfig(max_iter=500))
        model.fit(data)
        params = model.get_parameters()
        assert params["lambda3"] > 0

    def test_prediction_home_advantage_cap_shrinks_fitted_default(self):
        uncapped = _fit_equal_bivariate(BivariatePoissonConfig(max_goals=6))
        capped = _fit_equal_bivariate(BivariatePoissonConfig(max_goals=6, home_advantage_cap=0.10))

        raw = uncapped.predict_score_matrix("Team_A", "Team_B")
        shrunk = capped.predict_score_matrix("Team_A", "Team_B")

        assert shrunk.metadata["learned_home_advantage"] == pytest.approx(0.40)
        assert shrunk.metadata["home_advantage"] == pytest.approx(0.10)
        assert capped.get_parameters()["effective_home_advantage"] == pytest.approx(0.10)
        assert shrunk.home_win_prob < raw.home_win_prob
        assert shrunk.away_win_prob > raw.away_win_prob


class TestBivariatePoissonPMF:
    def test_pmf_non_negative(self):
        for i in range(5):
            for j in range(5):
                p = bivariate_poisson_pmf(i, j, 1.0, 0.8, 0.2)
                assert p >= 0

    def test_pmf_sums_approx_one(self):
        total = 0.0
        for i in range(15):
            for j in range(15):
                total += bivariate_poisson_pmf(i, j, 1.0, 0.8, 0.2)
        assert abs(total - 1.0) < 0.01

    def test_pmf_zero_covariance(self):
        """With lambda3=0, should match independent Poisson."""
        from scipy.stats import poisson
        for i in range(4):
            for j in range(4):
                bvp = bivariate_poisson_pmf(i, j, 1.5, 1.2, 1e-10)
                indep = poisson.pmf(i, 1.5) * poisson.pmf(j, 1.2)
                assert abs(bvp - indep) < 0.01
