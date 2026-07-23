from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from src.backtest.runner import BacktestRunner
from src.models.base import PredictionResult
from src.models.market_residual import MarketResidualModel


class _ConstantBaseModel:
    """Deliberately biased base model: fixed prediction regardless of context.

    Used to prove the fitted residual layer (which sees the varying market
    probabilities) beats a base model that ignores match-to-match variation.
    """

    def __init__(self, home_prob: float = 0.55, draw_prob: float = 0.25, away_prob: float = 0.20, max_goals: int = 8) -> None:
        self.home_prob = home_prob
        self.draw_prob = draw_prob
        self.away_prob = away_prob
        self.max_goals = max_goals

    def predict_score_matrix(
        self,
        home_team: str,
        away_team: str,
        home_advantage: float | None = None,
        contextual_features: dict[str, float] | None = None,
    ) -> PredictionResult:
        n = self.max_goals + 1
        matrix = np.zeros((n, n), dtype=np.float64)
        matrix[1, 0] = self.home_prob  # home win region (tril, -1)
        matrix[0, 0] = self.draw_prob  # draw region (diagonal)
        matrix[0, 1] = self.away_prob  # away win region (triu, 1)
        return PredictionResult(
            match_id="",
            home_team=home_team,
            away_team=away_team,
            lambda_home=1.3,
            lambda_away=1.0,
            score_matrix=matrix,
            home_win_prob=self.home_prob,
            draw_prob=self.draw_prob,
            away_win_prob=self.away_prob,
            metadata={},
        )


class _StubContextProvider:
    def for_match(self, home_team, away_team, match_date=None, match_id=None) -> dict[str, float]:
        return {}


def _synthetic_market_rows(n: int, seed: int) -> pd.DataFrame:
    """Rows whose outcomes are literally drawn from their own market probabilities.

    A handful of repeating market scenarios cycle through the rows so a
    logistic regression has enough repetition per scenario to learn the
    market's shape within a small synthetic sample.
    """
    rng = np.random.default_rng(seed)
    scenarios = [
        (0.70, 0.18, 0.12),
        (0.20, 0.20, 0.60),
        (0.34, 0.33, 0.33),
        (0.50, 0.25, 0.25),
        (0.15, 0.15, 0.70),
        (0.60, 0.20, 0.20),
    ]
    rows = []
    for i in range(n):
        p_home, p_draw, p_away = scenarios[i % len(scenarios)]
        outcome = rng.choice(["home", "draw", "away"], p=[p_home, p_draw, p_away])
        if outcome == "home":
            home_goals, away_goals = 2, 0
        elif outcome == "draw":
            home_goals, away_goals = 1, 1
        else:
            home_goals, away_goals = 0, 2
        rows.append(
            {
                "match_id": f"m{i}",
                "match_date": pd.Timestamp("2025-01-01") + pd.Timedelta(days=i),
                "home_team": "Home",
                "away_team": "Away",
                "home_goals_90": home_goals,
                "away_goals_90": away_goals,
                "mkt_prob_home": p_home,
                "mkt_prob_draw": p_draw,
                "mkt_prob_away": p_away,
            }
        )
    return pd.DataFrame(rows)


def _outcome_class(row: pd.Series) -> int:
    if row["home_goals_90"] > row["away_goals_90"]:
        return 0
    if row["home_goals_90"] == row["away_goals_90"]:
        return 1
    return 2


# --- Test 1: perfect-market synthetic beats a deliberately biased base model ---


def test_fitted_residual_beats_biased_base_model_on_held_out_log_loss() -> None:
    all_rows = _synthetic_market_rows(360, seed=7)
    train = all_rows.iloc[:270].reset_index(drop=True)
    test = all_rows.iloc[270:].reset_index(drop=True)

    base_model = _ConstantBaseModel()
    model = MarketResidualModel(base_model=base_model, regularization_c=1.0, min_train_matches=60)
    model.fit(train, _StubContextProvider())
    assert model.fitted_ is True

    y_true: list[int] = []
    residual_probs: list[list[float]] = []
    base_probs: list[list[float]] = []
    for _, row in test.iterrows():
        market_probs = (row["mkt_prob_home"], row["mkt_prob_draw"], row["mkt_prob_away"])
        pred = model.predict_score_matrix(
            row["home_team"], row["away_team"], market_probs=market_probs, contextual_features={}
        )
        residual_probs.append([pred.home_win_prob, pred.draw_prob, pred.away_win_prob])
        base_probs.append([base_model.home_prob, base_model.draw_prob, base_model.away_prob])
        y_true.append(_outcome_class(row))

    residual_log_loss = log_loss(y_true, residual_probs, labels=[0, 1, 2])
    base_log_loss = log_loss(y_true, base_probs, labels=[0, 1, 2])

    assert residual_log_loss < base_log_loss


# --- Test 2: fallback behavior ---


def test_missing_market_probs_returns_base_prediction_with_fallback_flag() -> None:
    base_model = _ConstantBaseModel()
    model = MarketResidualModel(base_model=base_model, min_train_matches=5)
    train = _synthetic_market_rows(30, seed=1)
    model.fit(train, _StubContextProvider())
    assert model.fitted_ is True

    pred = model.predict_score_matrix("Home", "Away", market_probs=None, contextual_features={})

    assert pred.metadata["fallback"] is True
    assert pred.home_win_prob == base_model.home_prob
    assert pred.draw_prob == base_model.draw_prob
    assert pred.away_win_prob == base_model.away_prob


def test_unfitted_model_falls_back_even_with_market_probs_present() -> None:
    base_model = _ConstantBaseModel()
    model = MarketResidualModel(base_model=base_model, min_train_matches=1000)
    train = _synthetic_market_rows(30, seed=2)
    model.fit(train, _StubContextProvider())
    assert model.fitted_ is False

    pred = model.predict_score_matrix("Home", "Away", market_probs=(0.5, 0.3, 0.2), contextual_features={})

    assert pred.metadata["fallback"] is True
    assert pred.home_win_prob == base_model.home_prob
    assert pred.draw_prob == base_model.draw_prob
    assert pred.away_win_prob == base_model.away_prob


# --- Test 3: no lookahead ---


def test_fit_ignores_rows_outside_the_provided_training_frame() -> None:
    all_rows = _synthetic_market_rows(200, seed=3)
    train = all_rows.iloc[:150].reset_index(drop=True)
    holdout = all_rows.iloc[150:].reset_index(drop=True)

    # Mutate holdout BEFORE fit.
    holdout.loc[:, "mkt_prob_home"] = 0.01
    holdout.loc[:, "mkt_prob_draw"] = 0.01
    holdout.loc[:, "mkt_prob_away"] = 0.98

    model = MarketResidualModel(base_model=_ConstantBaseModel(), min_train_matches=60)
    model.fit(train, _StubContextProvider())
    coef_before = model.classifier_.coef_.copy()
    intercept_before = model.classifier_.intercept_.copy()

    # Mutate holdout AFTER fit with wildly different values; refitting on the
    # same `train` frame must reproduce identical coefficients.
    holdout.loc[:, "mkt_prob_home"] = 0.9999
    holdout.loc[:, "mkt_prob_draw"] = 0.00005
    holdout.loc[:, "mkt_prob_away"] = 0.00005
    holdout.loc[:, "home_goals_90"] = 9
    holdout.loc[:, "away_goals_90"] = 0

    model_again = MarketResidualModel(base_model=_ConstantBaseModel(), min_train_matches=60)
    model_again.fit(train, _StubContextProvider())

    np.testing.assert_allclose(model_again.classifier_.coef_, coef_before)
    np.testing.assert_allclose(model_again.classifier_.intercept_, intercept_before)


# --- Test 4: matrix consistency ---


def test_predicted_matrix_regions_match_residual_1x2_probabilities() -> None:
    train = _synthetic_market_rows(150, seed=4)

    model = MarketResidualModel(base_model=_ConstantBaseModel(), min_train_matches=60)
    model.fit(train, _StubContextProvider())
    assert model.fitted_ is True

    pred = model.predict_score_matrix("Home", "Away", market_probs=(0.30, 0.30, 0.40), contextual_features={})
    matrix = pred.score_matrix

    assert abs(float(matrix.sum()) - 1.0) < 1e-9

    home_mass = float(np.tril(matrix, -1).sum())
    draw_mass = float(np.trace(matrix))
    away_mass = float(np.triu(matrix, 1).sum())

    assert abs(home_mass - pred.home_win_prob) < 1e-6
    assert abs(draw_mass - pred.draw_prob) < 1e-6
    assert abs(away_mass - pred.away_win_prob) < 1e-6


# --- Test 5: runner integration ---


def _synthetic_matches(weeks: int = 5) -> pd.DataFrame:
    records: list[dict] = []
    base_date = date(2025, 3, 1)
    match_id = 0
    for week in range(weeks):
        records.append(
            {
                "match_id": f"m{match_id:03d}",
                "match_date": base_date + timedelta(days=week * 7),
                "season": 2025,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Alpha FC",
                "away_team": "Beta FC",
                "home_goals_90": 3,
                "away_goals_90": 0,
                "home_npxg": 2.6,
                "away_npxg": 0.4,
                "home_xg": 2.6,
                "away_xg": 0.4,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            }
        )
        match_id += 1
        records.append(
            {
                "match_id": f"m{match_id:03d}",
                "match_date": base_date + timedelta(days=week * 7 + 1),
                "season": 2025,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": "Beta FC",
                "away_team": "Gamma FC",
                "home_goals_90": 1,
                "away_goals_90": 1,
                "home_npxg": 1.0,
                "away_npxg": 1.0,
                "home_xg": 1.0,
                "away_xg": 1.0,
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            }
        )
        match_id += 1
    return pd.DataFrame(records)


def _combined_odds_for(matches: pd.DataFrame, total_line: float = 2.5) -> pd.DataFrame:
    rows = []
    for _, row in matches.iterrows():
        ts = pd.Timestamp(row["match_date"]).isoformat()
        rows.append(
            {
                "match_id": row["match_id"],
                "timestamp": ts,
                "sportsbook": "test_book",
                "market_type": "1x2",
                "home_odds": 3.0,
                "draw_odds": 4.0,
                "away_odds": 15.0,
                "line": None,
                "over_odds": None,
                "under_odds": None,
                "source_type": "close",
            }
        )
        rows.append(
            {
                "match_id": row["match_id"],
                "timestamp": ts,
                "sportsbook": "test_book",
                "market_type": "total",
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "line": total_line,
                "over_odds": 1.9,
                "under_odds": 1.9,
                "source_type": "close",
            }
        )
    return pd.DataFrame(rows)


def _backtest_config() -> dict:
    return {
        "betting": {
            "min_edge": 0.01,
            "min_confidence": 0.01,
            "max_stake_pct": 0.01,
            "max_slate_exposure_pct": 0.05,
            "starting_bankroll": 10000.0,
            "markets": ["1x2", "total"],
        },
        "odds_provider": {"stale_line_minutes": 100000},
        "backtest": {"min_train_matches": 8, "step_size": 4, "run_ablations": False, "benchmarks": []},
        "model": {"max_goals": 8},
        "market_residual": {"regularization_c": 1.0, "min_train_matches": 2},
    }


def test_market_residual_runs_end_to_end_through_backtest_runner() -> None:
    matches = _synthetic_matches(weeks=5)
    odds = _combined_odds_for(matches)

    runner = BacktestRunner(_backtest_config())
    results = runner.run(matches, odds=odds, models_to_run=["market_residual"])

    assert "market_residual" in results
    predictions = results["market_residual"]["predictions"]
    decision_log = results["market_residual"]["decision_log"]

    assert not predictions.empty
    assert not decision_log.empty

    assert "main_total_line" in predictions.columns
    assert predictions["main_total_line"].notna().all()
    assert predictions["main_total_line"].eq(2.5).all()
