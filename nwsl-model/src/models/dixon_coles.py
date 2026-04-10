"""Dynamic Dixon-Coles model for joint score prediction.

Implements the Dixon & Coles (1997) model with:
- Independent Poisson base with low-score correction factor rho
- Recency-weighted maximum likelihood estimation
- Home advantage parameter
- Contextual covariate support
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from scipy.optimize import minimize
from scipy.stats import poisson

from src.models.base import BaseScoreModel, FitResult, ModelConfig, PredictionResult
from src.utils.math_utils import dixon_coles_correction, safe_log

logger = logging.getLogger("nwsl_model.models.dixon_coles")


@dataclass
class DixonColesConfig(ModelConfig):
    """Dixon-Coles specific configuration."""
    rho_init: float = -0.05
    rho_bounds: tuple[float, float] = (-0.5, 0.5)
    half_life_days: float = 90.0
    regularization: float = 0.001
    contextual_regularization: float = 0.01
    rho_regularization: float = 0.002


class DixonColesModel(BaseScoreModel):
    """Dynamic Dixon-Coles joint score model.

    Parameters:
        - attack[i]: Attack strength for team i (relative to average)
        - defense[i]: Defense strength for team i (relative to average)
        - home_adv: Home advantage parameter
        - intercept: Baseline log-scoring rate
        - rho: Low-score correction parameter
    """

    def __init__(self, config: Optional[DixonColesConfig] = None):
        if config is None:
            config = DixonColesConfig()
        super().__init__(config)
        self.dc_config = config
        self._attack: NDArray[np.float64] = np.array([])
        self._defense: NDArray[np.float64] = np.array([])
        self._home_adv: float = config.home_advantage_init
        self._intercept: float = 0.0
        self._rho: float = config.rho_init
        self._contextual_home_betas: NDArray[np.float64] = np.array([])
        self._contextual_away_betas: NDArray[np.float64] = np.array([])
        self._contextual_cols: list[str] = []
        self._contextual_means: NDArray[np.float64] = np.array([])
        self._contextual_scales: NDArray[np.float64] = np.array([])

    @staticmethod
    def _expand_zero_sum(values: NDArray[np.float64]) -> NDArray[np.float64]:
        if values.size == 0:
            return np.zeros(1, dtype=np.float64)
        return np.concatenate([values, np.array([-float(values.sum())], dtype=np.float64)])

    def _prepare_contextual_matrix(
        self,
        matches: pd.DataFrame,
        contextual_cols: list[str],
    ) -> NDArray[np.float64] | None:
        if not contextual_cols:
            self._contextual_means = np.array([])
            self._contextual_scales = np.array([])
            return None

        contextual_frame = matches[contextual_cols].apply(pd.to_numeric, errors="coerce")
        means = contextual_frame.mean(axis=0, skipna=True).fillna(0.0).to_numpy(dtype=np.float64)
        scales = contextual_frame.std(axis=0, skipna=True, ddof=0).replace(0, 1.0).fillna(1.0).to_numpy(dtype=np.float64)
        matrix = contextual_frame.to_numpy(dtype=np.float64)
        matrix = np.where(np.isnan(matrix), means, matrix)
        matrix = (matrix - means) / scales
        self._contextual_means = means
        self._contextual_scales = scales
        return matrix

    def _prepare_contextual_vector(
        self,
        contextual_features: dict[str, float] | None,
    ) -> NDArray[np.float64] | None:
        if not self._contextual_cols:
            return None

        raw_values = []
        for idx, column in enumerate(self._contextual_cols):
            fallback = float(self._contextual_means[idx]) if idx < len(self._contextual_means) else 0.0
            value = fallback if contextual_features is None else contextual_features.get(column, fallback)
            try:
                raw_values.append(float(value))
            except (TypeError, ValueError):
                raw_values.append(fallback)

        vector = np.asarray(raw_values, dtype=np.float64)
        if len(self._contextual_means) == len(vector) and len(self._contextual_scales) == len(vector):
            vector = np.where(np.isnan(vector), self._contextual_means, vector)
            vector = (vector - self._contextual_means) / self._contextual_scales
        return vector

    def _initial_team_strengths(
        self,
        home_idx: NDArray[np.int_],
        away_idx: NDArray[np.int_],
        home_goals: NDArray[np.int_],
        away_goals: NDArray[np.int_],
    ) -> tuple[NDArray[np.float64], NDArray[np.float64], float, float]:
        scored = np.zeros(self._n_teams, dtype=np.float64)
        conceded = np.zeros(self._n_teams, dtype=np.float64)
        games = np.zeros(self._n_teams, dtype=np.float64)

        for h, a, hg, ag in zip(home_idx, away_idx, home_goals, away_goals, strict=False):
            scored[h] += float(hg)
            conceded[h] += float(ag)
            games[h] += 1.0
            scored[a] += float(ag)
            conceded[a] += float(hg)
            games[a] += 1.0

        league_attack_rate = max(float((home_goals.sum() + away_goals.sum()) / max(2 * len(home_goals), 1)), 0.1)
        team_attack_rate = (scored + 0.5) / (games + 0.5)
        team_defense_rate = (conceded + 0.5) / (games + 0.5)

        attack = np.log(np.clip(team_attack_rate / league_attack_rate, 0.15, 6.0))
        defense = np.log(np.clip(league_attack_rate / np.maximum(team_defense_rate, 0.15), 0.15, 6.0))
        attack -= attack.mean()
        defense -= defense.mean()

        home_rate = max(float(home_goals.mean()), 0.1)
        away_rate = max(float(away_goals.mean()), 0.1)
        home_advantage = float(np.clip(0.5 * math.log(home_rate / away_rate), -0.75, 0.75))
        intercept = float(math.log(league_attack_rate))
        return attack, defense, home_advantage, intercept

    def fit(
        self,
        matches: pd.DataFrame,
        weights: Optional[NDArray[np.float64]] = None,
        contextual_cols: Optional[list[str]] = None,
    ) -> FitResult:
        """Fit Dixon-Coles model by maximum likelihood.

        Args:
            matches: Must have home_team, away_team, home_goals_90, away_goals_90.
            weights: Per-match weights (recency decay).
            contextual_cols: Column names for contextual features to include.
        """
        # Build team mapping
        all_teams = sorted(
            set(matches["home_team"].unique()) | set(matches["away_team"].unique())
        )
        self._team_map = {t: i for i, t in enumerate(all_teams)}
        self._n_teams = len(all_teams)

        home_idx = matches["home_team"].map(self._team_map).values.astype(int)
        away_idx = matches["away_team"].map(self._team_map).values.astype(int)
        home_goals = matches["home_goals_90"].values.astype(int)
        away_goals = matches["away_goals_90"].values.astype(int)

        if weights is None:
            weights = np.ones(len(matches), dtype=np.float64)

        # Contextual features
        ctx_matrix = None
        n_ctx = 0
        if contextual_cols:
            self._contextual_cols = contextual_cols
            ctx_matrix = self._prepare_contextual_matrix(matches, contextual_cols)
            n_ctx = ctx_matrix.shape[1]

        n_teams = self._n_teams
        attack_init, defense_init, home_adv_init, intercept_init = self._initial_team_strengths(
            home_idx,
            away_idx,
            home_goals,
            away_goals,
        )

        # Parameter vector:
        # [attack(n-1), defense(n-1), home_adv, intercept, rho, home_betas(n_ctx), away_betas(n_ctx)]
        n_free_teams = max(n_teams - 1, 1)
        n_params = 2 * n_free_teams + 3 + (2 * n_ctx)

        # Initial values
        x0 = np.zeros(n_params, dtype=np.float64)
        x0[:n_free_teams] = attack_init[:n_free_teams]
        x0[n_free_teams:2 * n_free_teams] = defense_init[:n_free_teams]
        x0[2 * n_free_teams] = home_adv_init
        x0[2 * n_free_teams + 1] = intercept_init
        x0[2 * n_free_teams + 2] = self.dc_config.rho_init  # rho

        # Bounds
        bounds = (
            [(-2.0, 2.0)] * n_free_teams  # attack
            + [(-2.0, 2.0)] * n_free_teams  # defense
            + [(-1.0, 1.5)]  # home_adv
            + [(-1.0, 1.5)]  # intercept
            + [self.dc_config.rho_bounds]  # rho
            + [(-1.0, 1.0)] * (2 * n_ctx)  # contextual betas
        )

        def neg_log_likelihood(params: NDArray) -> float:
            free_att = params[:n_free_teams]
            free_def = params[n_free_teams:2 * n_free_teams]
            att = self._expand_zero_sum(free_att)
            defe = self._expand_zero_sum(free_def)
            home_adv = params[2 * n_free_teams]
            intercept = params[2 * n_free_teams + 1]
            rho = params[2 * n_free_teams + 2]
            home_betas = params[2 * n_free_teams + 3:2 * n_free_teams + 3 + n_ctx] if n_ctx > 0 else np.array([])
            away_betas = params[2 * n_free_teams + 3 + n_ctx:] if n_ctx > 0 else np.array([])

            att_penalty = self.dc_config.regularization * np.sum(att ** 2)
            def_penalty = self.dc_config.regularization * np.sum(defe ** 2)
            rho_penalty = self.dc_config.rho_regularization * (rho ** 2)
            ctx_penalty = self.dc_config.contextual_regularization * (
                np.sum(home_betas ** 2) + np.sum(away_betas ** 2)
            )

            total_ll = 0.0
            for i in range(len(home_idx)):
                h, a = home_idx[i], away_idx[i]
                hg, ag = home_goals[i], away_goals[i]
                w = weights[i]

                log_lam_h = intercept + home_adv + att[h] - defe[a]
                log_lam_a = intercept + att[a] - defe[h]

                if ctx_matrix is not None and n_ctx > 0:
                    log_lam_h += np.dot(home_betas, ctx_matrix[i])
                    log_lam_a += np.dot(away_betas, ctx_matrix[i])

                lam_h = np.exp(np.clip(log_lam_h, -5, 3))
                lam_a = np.exp(np.clip(log_lam_a, -5, 3))

                # Poisson log-likelihood
                ll_h = poisson.logpmf(hg, lam_h)
                ll_a = poisson.logpmf(ag, lam_a)

                # Dixon-Coles correction
                tau = dixon_coles_correction(hg, ag, lam_h, lam_a, rho)
                tau = max(tau, 1e-10)

                total_ll += w * (ll_h + ll_a + safe_log(tau))

            return -(total_ll - att_penalty - def_penalty - rho_penalty - ctx_penalty)

        # Optimize
        result = minimize(
            neg_log_likelihood,
            x0,
            method="L-BFGS-B",
            bounds=bounds,
            options={
                "maxiter": self.dc_config.max_iter,
                "ftol": max(self.dc_config.tol, 1e-6),
                "gtol": 1e-5,
            },
        )

        # Extract parameters
        params = result.x
        self._attack = self._expand_zero_sum(params[:n_free_teams])
        self._defense = self._expand_zero_sum(params[n_free_teams:2 * n_free_teams])
        self._home_adv = float(params[2 * n_free_teams])
        self._intercept = float(params[2 * n_free_teams + 1])
        self._rho = float(params[2 * n_free_teams + 2])
        if n_ctx > 0:
            self._contextual_home_betas = params[2 * n_free_teams + 3:2 * n_free_teams + 3 + n_ctx]
            self._contextual_away_betas = params[2 * n_free_teams + 3 + n_ctx:]

        self._fitted = True
        grad_norm = float(np.linalg.norm(result.jac)) if getattr(result, "jac", None) is not None else float("nan")
        diagnostics = {
            "optimizer": "L-BFGS-B",
            "n_params": int(n_params),
            "n_free_teams": int(n_free_teams),
            "n_contextual_features": int(n_ctx),
            "nfev": int(getattr(result, "nfev", 0) or 0),
            "nit": int(getattr(result, "nit", 0) or 0),
            "grad_norm": grad_norm,
            "message": str(getattr(result, "message", "")),
            "success": bool(result.success),
            "team_regularization": float(self.dc_config.regularization),
            "contextual_regularization": float(self.dc_config.contextual_regularization),
            "rho_regularization": float(self.dc_config.rho_regularization),
        }
        warnings = []
        if not result.success:
            warnings.append(str(getattr(result, "message", "optimizer did not converge")))
        if np.isfinite(grad_norm) and grad_norm > 1e-2:
            warnings.append(f"gradient_norm={grad_norm:.4g}")

        logger.info(
            f"Dixon-Coles fit: converged={result.success}, "
            f"home_adv={self._home_adv:.4f}, rho={self._rho:.4f}, "
            f"intercept={self._intercept:.4f}, n_teams={n_teams}, grad_norm={grad_norm:.4g}"
        )

        return FitResult(
            converged=result.success,
            n_matches=len(matches),
            n_teams=n_teams,
            log_likelihood=-result.fun,
            parameters={
                "home_advantage": self._home_adv,
                "intercept": self._intercept,
                "rho": self._rho,
                "contextual_columns": self._contextual_cols,
            },
            warnings=warnings,
            diagnostics=diagnostics,
        )

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: Optional[float] = None,
        contextual_features: Optional[dict[str, float]] = None,
    ) -> PredictionResult:
        """Predict joint score distribution."""
        self._ensure_fitted()

        h_idx = self._get_team_index(home_team)
        a_idx = self._get_team_index(away_team)

        att_h = self._attack[h_idx] if h_idx >= 0 else 0.0
        def_h = self._defense[h_idx] if h_idx >= 0 else 0.0
        att_a = self._attack[a_idx] if a_idx >= 0 else 0.0
        def_a = self._defense[a_idx] if a_idx >= 0 else 0.0

        ha = home_advantage if home_advantage is not None else self._home_adv

        log_lam_h = self._intercept + ha + att_h - def_a
        log_lam_a = self._intercept + att_a - def_h

        # Add contextual features
        if contextual_features and self._contextual_cols:
            ctx_vec = self._prepare_contextual_vector(contextual_features)
            if ctx_vec is None:
                ctx_vec = np.array([])
            if len(self._contextual_home_betas) == len(ctx_vec):
                log_lam_h += np.dot(self._contextual_home_betas, ctx_vec)
            if len(self._contextual_away_betas) == len(ctx_vec):
                log_lam_a += np.dot(self._contextual_away_betas, ctx_vec)

        lam_h = np.exp(np.clip(log_lam_h, -5, 3))
        lam_a = np.exp(np.clip(log_lam_a, -5, 3))

        # Build score matrix with DC correction
        n = self.config.max_goals + 1
        matrix = np.zeros((n, n), dtype=np.float64)

        pmf_h = poisson.pmf(np.arange(n), lam_h)
        pmf_a = poisson.pmf(np.arange(n), lam_a)

        for i in range(n):
            for j in range(n):
                tau = dixon_coles_correction(i, j, lam_h, lam_a, self._rho)
                matrix[i, j] = pmf_h[i] * pmf_a[j] * tau

        # Renormalize
        total = matrix.sum()
        if total > 0:
            matrix /= total

        # Derive 1X2
        home_win = np.sum(np.tril(matrix, -1))
        draw = np.sum(np.diag(matrix))
        away_win = np.sum(np.triu(matrix, 1))

        return PredictionResult(
            match_id="",
            home_team=home_team,
            away_team=away_team,
            lambda_home=float(lam_h),
            lambda_away=float(lam_a),
            score_matrix=matrix,
            home_win_prob=float(home_win),
            draw_prob=float(draw),
            away_win_prob=float(away_win),
            metadata={
                "model": "dixon_coles",
                "rho": self._rho,
                "home_advantage": ha,
            },
        )

    def get_parameters(self) -> dict[str, Any]:
        if not self._fitted:
            return {}
        team_names = {v: k for k, v in self._team_map.items()}
        return {
            "home_advantage": self._home_adv,
            "intercept": self._intercept,
            "rho": self._rho,
            "attack": {team_names[i]: float(self._attack[i]) for i in range(self._n_teams)},
            "defense": {team_names[i]: float(self._defense[i]) for i in range(self._n_teams)},
        }
