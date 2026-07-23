"""Dynamic bivariate Poisson model for joint score prediction.

Implements a bivariate Poisson likelihood with:
- lambda1 (home marginal), lambda2 (away marginal), lambda3 (shared/covariance)
- Recency-weighted MLE
- Home advantage and contextual covariates
- Numerically stable computation
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
from src.utils.math_utils import bivariate_poisson_pmf, safe_log

logger = logging.getLogger("nwsl_model.models.bivariate_poisson")


@dataclass
class BivariatePoissonConfig(ModelConfig):
    """Bivariate Poisson specific configuration."""
    lambda3_init: float = 0.1
    lambda3_bounds: tuple[float, float] = (0.001, 2.0)
    half_life_days: float = 90.0
    regularization: float = 0.001
    contextual_regularization: float = 0.01
    lambda3_regularization: float = 0.002


class BivariatePoissonModel(BaseScoreModel):
    """Bivariate Poisson joint score model.

    The model specifies:
        X_home = X1 + X3,  X_away = X2 + X3
    where X1 ~ Pois(lambda1), X2 ~ Pois(lambda2), X3 ~ Pois(lambda3)

    lambda1 = exp(intercept + home_adv + att_h - def_a + ctx) - lambda3
    lambda2 = exp(intercept + att_a - def_h + ctx) - lambda3
    lambda3 captures positive scoring dependence.
    """

    def __init__(self, config: Optional[BivariatePoissonConfig] = None):
        if config is None:
            config = BivariatePoissonConfig()
        super().__init__(config)
        self.bp_config = config
        self._attack: NDArray[np.float64] = np.array([])
        self._defense: NDArray[np.float64] = np.array([])
        self._home_adv: float = config.home_advantage_init
        self._intercept: float = 0.0
        self._lambda3: float = config.lambda3_init
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

    def _bvp_log_pmf(
        self, i: int, j: int, lam1: float, lam2: float, lam3: float
    ) -> float:
        """Compute log P(X=i, Y=j) for the bivariate Poisson.

        Numerically stable version using log-sum-exp.
        """
        max_k = min(i, j)
        if max_k < 0:
            return -np.inf

        log_terms = []
        for k in range(max_k + 1):
            log_term = (
                poisson.logpmf(i - k, max(lam1, 1e-10))
                + poisson.logpmf(j - k, max(lam2, 1e-10))
                + poisson.logpmf(k, max(lam3, 1e-10))
            )
            log_terms.append(log_term)

        # Log-sum-exp for numerical stability
        max_log = max(log_terms)
        if max_log == -np.inf:
            return -np.inf
        return max_log + math.log(sum(math.exp(lt - max_log) for lt in log_terms))

    def fit(
        self,
        matches: pd.DataFrame,
        weights: Optional[NDArray[np.float64]] = None,
        contextual_cols: Optional[list[str]] = None,
    ) -> FitResult:
        """Fit bivariate Poisson model by maximum likelihood."""
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

        # Parameters: attack(n-1), defense(n-1), home_adv, intercept, log_lambda3, home_betas(n_ctx), away_betas(n_ctx)
        n_free_teams = max(n_teams - 1, 1)
        n_params = 2 * n_free_teams + 3 + (2 * n_ctx)

        x0 = np.zeros(n_params, dtype=np.float64)
        x0[:n_free_teams] = attack_init[:n_free_teams]
        x0[n_free_teams:2 * n_free_teams] = defense_init[:n_free_teams]
        x0[2 * n_free_teams] = home_adv_init
        x0[2 * n_free_teams + 1] = intercept_init
        x0[2 * n_free_teams + 2] = math.log(max(self.bp_config.lambda3_init, 1e-5))  # log(lambda3)

        bounds = (
            [(-2.0, 2.0)] * n_free_teams  # attack
            + [(-2.0, 2.0)] * n_free_teams  # defense
            + [(-1.0, 1.5)]  # home_adv
            + [(-1.0, 1.5)]  # intercept
            + [(math.log(self.bp_config.lambda3_bounds[0]),
                math.log(self.bp_config.lambda3_bounds[1]))]  # log_lambda3
            + [(-1.0, 1.0)] * (2 * n_ctx)
        )

        def neg_log_likelihood(params: NDArray) -> float:
            free_att = params[:n_free_teams]
            free_def = params[n_free_teams:2 * n_free_teams]
            att = self._expand_zero_sum(free_att)
            defe = self._expand_zero_sum(free_def)
            home_adv = params[2 * n_free_teams]
            intercept = params[2 * n_free_teams + 1]
            log_lam3 = params[2 * n_free_teams + 2]
            home_betas = params[2 * n_free_teams + 3:2 * n_free_teams + 3 + n_ctx] if n_ctx > 0 else np.array([])
            away_betas = params[2 * n_free_teams + 3 + n_ctx:] if n_ctx > 0 else np.array([])

            lam3 = np.exp(log_lam3)

            reg = self.bp_config.regularization * (np.sum(att ** 2) + np.sum(defe ** 2))
            reg += self.bp_config.lambda3_regularization * ((log_lam3 - math.log(max(self.bp_config.lambda3_init, 1e-5))) ** 2)
            reg += self.bp_config.contextual_regularization * (
                np.sum(home_betas ** 2) + np.sum(away_betas ** 2)
            )

            total_ll = 0.0
            for i in range(len(home_idx)):
                h, a = home_idx[i], away_idx[i]
                hg, ag = home_goals[i], away_goals[i]
                w = weights[i]

                log_mu_h = intercept + home_adv + att[h] - defe[a]
                log_mu_a = intercept + att[a] - defe[h]

                if ctx_matrix is not None and n_ctx > 0:
                    log_mu_h += np.dot(home_betas, ctx_matrix[i])
                    log_mu_a += np.dot(away_betas, ctx_matrix[i])

                mu_h = np.exp(np.clip(log_mu_h, -5, 3))
                mu_a = np.exp(np.clip(log_mu_a, -5, 3))

                # lambda1 = mu_h - lambda3, lambda2 = mu_a - lambda3
                lam1 = max(mu_h - lam3, 0.01)
                lam2 = max(mu_a - lam3, 0.01)

                ll = self._bvp_log_pmf(hg, ag, lam1, lam2, lam3)
                total_ll += w * ll

            return -(total_ll - reg)

        result = minimize(
            neg_log_likelihood,
            x0,
            method="L-BFGS-B",
            bounds=bounds,
            options={
                "maxiter": self.bp_config.max_iter,
                "ftol": max(self.bp_config.tol, 1e-6),
                "gtol": 1e-5,
            },
        )

        params = result.x
        self._attack = self._expand_zero_sum(params[:n_free_teams])
        self._defense = self._expand_zero_sum(params[n_free_teams:2 * n_free_teams])
        self._home_adv = float(params[2 * n_free_teams])
        self._intercept = float(params[2 * n_free_teams + 1])
        self._lambda3 = float(np.exp(params[2 * n_free_teams + 2]))
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
            "team_regularization": float(self.bp_config.regularization),
            "contextual_regularization": float(self.bp_config.contextual_regularization),
            "lambda3_regularization": float(self.bp_config.lambda3_regularization),
            "home_advantage_scale": float(self.bp_config.home_advantage_scale),
            "home_advantage_cap": (
                None
                if self.bp_config.home_advantage_cap is None
                else float(self.bp_config.home_advantage_cap)
            ),
        }
        warnings = []
        if not result.success:
            warnings.append(str(getattr(result, "message", "optimizer did not converge")))
        if np.isfinite(grad_norm) and grad_norm > 1e-2:
            warnings.append(f"gradient_norm={grad_norm:.4g}")

        logger.info(
            f"Bivariate Poisson fit: converged={result.success}, "
            f"home_adv={self._home_adv:.4f}, lambda3={self._lambda3:.4f}, "
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
                "lambda3": self._lambda3,
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
        """Predict joint score distribution using bivariate Poisson."""
        self._ensure_fitted()

        h_idx = self._get_team_index(home_team)
        a_idx = self._get_team_index(away_team)

        att_h = self._attack[h_idx] if h_idx >= 0 else 0.0
        def_h = self._defense[h_idx] if h_idx >= 0 else 0.0
        att_a = self._attack[a_idx] if a_idx >= 0 else 0.0
        def_a = self._defense[a_idx] if a_idx >= 0 else 0.0

        ha = self._effective_home_advantage(self._home_adv, home_advantage)

        log_mu_h = self._intercept + ha + att_h - def_a
        log_mu_a = self._intercept + att_a - def_h

        if contextual_features and self._contextual_cols:
            ctx_vec = self._prepare_contextual_vector(contextual_features)
            if ctx_vec is None:
                ctx_vec = np.array([])
            if len(self._contextual_home_betas) == len(ctx_vec):
                log_mu_h += np.dot(self._contextual_home_betas, ctx_vec)
            if len(self._contextual_away_betas) == len(ctx_vec):
                log_mu_a += np.dot(self._contextual_away_betas, ctx_vec)

        mu_h = np.exp(np.clip(log_mu_h, -5, 3))
        mu_a = np.exp(np.clip(log_mu_a, -5, 3))

        lam3 = self._lambda3
        lam1 = max(mu_h - lam3, 0.01)
        lam2 = max(mu_a - lam3, 0.01)

        # Build score matrix
        n = self.config.max_goals + 1
        matrix = np.zeros((n, n), dtype=np.float64)
        for i in range(n):
            for j in range(n):
                matrix[i, j] = max(bivariate_poisson_pmf(i, j, lam1, lam2, lam3), 1e-20)

        # Renormalize
        total = matrix.sum()
        if total > 0:
            matrix /= total

        home_win = float(np.sum(np.tril(matrix, -1)))
        draw = float(np.sum(np.diag(matrix)))
        away_win = float(np.sum(np.triu(matrix, 1)))

        return PredictionResult(
            match_id="",
            home_team=home_team,
            away_team=away_team,
            lambda_home=float(mu_h),
            lambda_away=float(mu_a),
            score_matrix=matrix,
            home_win_prob=home_win,
            draw_prob=draw,
            away_win_prob=away_win,
            metadata={
                "model": "bivariate_poisson",
                "lambda3": lam3,
                "lambda1": lam1,
                "lambda2": lam2,
                "home_advantage": ha,
                "learned_home_advantage": self._home_adv,
                "home_advantage_scale": self.bp_config.home_advantage_scale,
                "home_advantage_cap": self.bp_config.home_advantage_cap,
            },
        )

    def get_parameters(self) -> dict[str, Any]:
        if not self._fitted:
            return {}
        team_names = {v: k for k, v in self._team_map.items()}
        return {
            "home_advantage": self._home_adv,
            "effective_home_advantage": self._effective_home_advantage(self._home_adv),
            "home_advantage_scale": self.bp_config.home_advantage_scale,
            "home_advantage_cap": self.bp_config.home_advantage_cap,
            "intercept": self._intercept,
            "lambda3": self._lambda3,
            "attack": {team_names[i]: float(self._attack[i]) for i in range(self._n_teams)},
            "defense": {team_names[i]: float(self._defense[i]) for i in range(self._n_teams)},
        }
