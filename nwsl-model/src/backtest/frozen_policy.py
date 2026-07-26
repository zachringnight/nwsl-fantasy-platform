"""Train-season-frozen betting-policy validation.

This is intentionally stricter than nested threshold tuning. Thresholds are
selected once on a completed training season and then held fixed for every
row in the following test season. The test season never influences threshold
selection. Match-cluster bootstrap intervals and a full threshold-grid
robustness check prevent a single lucky cutoff from being presented as a
deployable policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np
import pandas as pd

from scripts.analyze_betting_thresholds import (
    _prepare_candidates,
    threshold_tunable_decision_mask,
)
from src.backtest.threshold_tuning import _score_cell, _select_thresholds


@dataclass
class FrozenPolicyValidation:
    selected_bets: pd.DataFrame
    threshold_grid: pd.DataFrame
    summary: dict[str, Any]


def _select(frame: pd.DataFrame, thresholds: dict[str, float]) -> pd.DataFrame:
    return frame[
        frame["edge"].ge(float(thresholds["min_edge"]))
        & frame["confidence"].ge(float(thresholds["min_confidence"]))
        & frame["market_price"].gt(1.0)
    ].copy()


def _metrics(frame: pd.DataFrame) -> dict[str, Any]:
    n_bets = int(len(frame))
    clv = pd.to_numeric(frame.get("clv"), errors="coerce")
    pnl = pd.to_numeric(frame.get("pnl_unit"), errors="coerce")
    dates = pd.to_datetime(frame.get("match_date"), errors="coerce")
    return {
        "n_bets": n_bets,
        "unique_matches": int(frame["match_id"].astype(str).nunique())
        if n_bets and "match_id" in frame.columns
        else 0,
        "pnl_units": float(pnl.sum()) if n_bets else 0.0,
        "roi_units": float(pnl.mean()) if n_bets else 0.0,
        "hit_rate": float(pnl.gt(0).mean()) if n_bets else 0.0,
        "mean_clv": float(clv.mean()) if n_bets and clv.notna().any() else None,
        "positive_clv_rate": float(clv.gt(0).mean())
        if n_bets and clv.notna().any()
        else None,
        "average_market_price": float(
            pd.to_numeric(frame.get("market_price"), errors="coerce").mean()
        )
        if n_bets
        else None,
        "first_match_date": str(dates.min().date())
        if n_bets and dates.notna().any()
        else None,
        "last_match_date": str(dates.max().date())
        if n_bets and dates.notna().any()
        else None,
    }


def _cluster_bootstrap(
    frame: pd.DataFrame,
    *,
    iterations: int,
    seed: int,
) -> dict[str, Any]:
    if frame.empty:
        return {
            "iterations": int(iterations),
            "seed": int(seed),
            "roi_95_ci": [None, None],
            "clv_95_ci": [None, None],
            "probability_roi_positive": None,
            "probability_clv_positive": None,
        }

    grouped = (
        frame.assign(
            _pnl=pd.to_numeric(frame["pnl_unit"], errors="coerce").fillna(0.0),
            _clv=pd.to_numeric(frame.get("clv"), errors="coerce"),
        )
        .groupby("match_id", sort=False)
        .agg(
            pnl=("_pnl", "sum"),
            n=("_pnl", "size"),
            clv_sum=("_clv", "sum"),
            clv_n=("_clv", "count"),
        )
        .reset_index()
    )
    rng = np.random.default_rng(seed)
    sample_indices = rng.integers(
        0,
        len(grouped),
        size=(int(iterations), len(grouped)),
    )
    pnl = grouped["pnl"].to_numpy()[sample_indices].sum(axis=1)
    n_bets = grouped["n"].to_numpy()[sample_indices].sum(axis=1)
    roi = np.divide(pnl, n_bets, out=np.zeros_like(pnl), where=n_bets > 0)

    clv_sum = grouped["clv_sum"].to_numpy()[sample_indices].sum(axis=1)
    clv_n = grouped["clv_n"].to_numpy()[sample_indices].sum(axis=1)
    clv = np.divide(
        clv_sum,
        clv_n,
        out=np.full_like(clv_sum, np.nan, dtype=float),
        where=clv_n > 0,
    )
    valid_clv = clv[np.isfinite(clv)]
    return {
        "iterations": int(iterations),
        "seed": int(seed),
        "clusters": int(len(grouped)),
        "roi_95_ci": [float(value) for value in np.quantile(roi, [0.025, 0.975])],
        "clv_95_ci": (
            [float(value) for value in np.quantile(valid_clv, [0.025, 0.975])]
            if len(valid_clv)
            else [None, None]
        ),
        "probability_roi_positive": float(np.mean(roi > 0)),
        "probability_clv_positive": (
            float(np.mean(valid_clv > 0)) if len(valid_clv) else None
        ),
    }


def validate_frozen_policy(
    decisions: pd.DataFrame,
    predictions: pd.DataFrame,
    *,
    policy_id: str,
    model_family: str,
    train_season: int,
    test_season: int,
    market_group: str,
    side: str,
    edge_grid: Iterable[float],
    confidence_grid: Iterable[float],
    min_bets_per_cell: int = 8,
    min_history_bets: int = 30,
    rank_metric: str = "roi_units",
    base_thresholds: dict[str, float] | None = None,
    bootstrap_iterations: int = 20_000,
    bootstrap_seed: int = 20260726,
    minimum_test_bets: int = 25,
    minimum_robust_cell_share: float = 0.8,
) -> FrozenPolicyValidation:
    """Select on ``train_season`` and evaluate unchanged on ``test_season``."""
    edge_grid = [float(value) for value in edge_grid]
    confidence_grid = [float(value) for value in confidence_grid]
    base = dict(base_thresholds or {"min_edge": 0.10, "min_confidence": 0.0})
    candidates = _prepare_candidates(decisions, predictions)
    if candidates.empty:
        raise ValueError("No structurally eligible candidates were prepared.")

    candidates["match_date"] = pd.to_datetime(
        candidates["match_date"],
        errors="coerce",
    )
    candidates["season"] = candidates["match_date"].dt.year
    source_types = sorted(
        {
            str(value).strip().lower()
            for value in candidates.get("source_type", pd.Series(dtype=str)).dropna()
            if str(value).strip()
        }
    )
    scoped = candidates[
        candidates["market_group"].eq(market_group)
        & candidates["side"].astype(str).str.lower().eq(str(side).lower())
    ].copy()
    train = scoped[scoped["season"].eq(int(train_season))].copy()
    test = scoped[scoped["season"].eq(int(test_season))].copy()
    if train.empty or test.empty:
        raise ValueError(
            f"Policy scope has insufficient seasons: train={len(train)} test={len(test)}"
        )

    thresholds, threshold_source, training_cell = _select_thresholds(
        train,
        edge_grid=edge_grid,
        confidence_grid=confidence_grid,
        min_bets_per_cell=min_bets_per_cell,
        min_history_bets=min_history_bets,
        rank_metric=rank_metric,
        base=base,
    )
    selected_train = _select(train, thresholds)
    selected_test = _select(test, thresholds)
    selected_test = selected_test.sort_values(
        ["match_date", "match_id", "sportsbook", "market", "side"]
    ).reset_index(drop=True)

    grid_rows: list[dict[str, Any]] = []
    for min_edge in edge_grid:
        for min_confidence in confidence_grid:
            train_cell = _score_cell(train, min_edge, min_confidence)
            test_cell = _score_cell(test, min_edge, min_confidence)
            test_selected = _select(
                test,
                {
                    "min_edge": min_edge,
                    "min_confidence": min_confidence,
                },
            )
            test_clv = pd.to_numeric(test_selected.get("clv"), errors="coerce")
            grid_rows.append(
                {
                    "min_edge": min_edge,
                    "min_confidence": min_confidence,
                    "train_n_bets": train_cell["n_bets"],
                    "train_roi_units": train_cell["roi_units"],
                    "test_n_bets": test_cell["n_bets"],
                    "test_roi_units": test_cell["roi_units"],
                    "test_mean_clv": float(test_clv.mean())
                    if not test_selected.empty and test_clv.notna().any()
                    else None,
                }
            )
    threshold_grid = pd.DataFrame(grid_rows)
    robust_cells = threshold_grid[
        threshold_grid["train_n_bets"].ge(min_bets_per_cell)
        & threshold_grid["test_n_bets"].ge(min_bets_per_cell)
    ].copy()
    roi_positive_share = (
        float(robust_cells["test_roi_units"].gt(0).mean())
        if not robust_cells.empty
        else 0.0
    )
    clv_positive_share = (
        float(robust_cells["test_mean_clv"].gt(0).mean())
        if not robust_cells.empty
        else 0.0
    )

    bootstrap = _cluster_bootstrap(
        selected_test,
        iterations=bootstrap_iterations,
        seed=bootstrap_seed,
    )
    train_metrics = _metrics(selected_train)
    test_metrics = _metrics(selected_test)
    naive_train_metrics = _metrics(train)
    naive_test_metrics = _metrics(test)

    checks = {
        "thresholds_selected_on_training_only": threshold_source == "tuned",
        "opening_quotes_only": source_types == ["open"],
        "test_sample_minimum_met": test_metrics["unique_matches"] >= minimum_test_bets,
        "one_bet_per_test_match": (
            test_metrics["n_bets"] == test_metrics["unique_matches"]
        ),
        "roi_interval_above_zero": (
            bootstrap["roi_95_ci"][0] is not None
            and bootstrap["roi_95_ci"][0] > 0
        ),
        "clv_interval_above_zero": (
            bootstrap["clv_95_ci"][0] is not None
            and bootstrap["clv_95_ci"][0] > 0
        ),
        "threshold_grid_roi_robust": roi_positive_share
        >= minimum_robust_cell_share,
        "threshold_grid_clv_robust": clv_positive_share
        >= minimum_robust_cell_share,
    }
    ready = all(checks.values())

    input_mask = threshold_tunable_decision_mask(decisions)
    summary = {
        "policy_id": policy_id,
        "status": "ready_for_capped_forward_use" if ready else "research_only",
        "model_family": model_family,
        "market_group": market_group,
        "side": str(side).lower(),
        "odds_source_types": source_types,
        "train_season": int(train_season),
        "test_season": int(test_season),
        "thresholds": {
            "min_edge": float(thresholds["min_edge"]),
            "min_confidence": float(thresholds["min_confidence"]),
            "selection_source": threshold_source,
            "rank_metric": rank_metric,
            "training_cell": training_cell,
        },
        "train": train_metrics,
        "test": test_metrics,
        "naive_always_side_comparator": {
            "train": naive_train_metrics,
            "test": naive_test_metrics,
            "test_roi_lift": (
                test_metrics["roi_units"] - naive_test_metrics["roi_units"]
            ),
        },
        "bootstrap": bootstrap,
        "threshold_grid_robustness": {
            "eligible_cells": int(len(robust_cells)),
            "positive_test_roi_cells": int(
                robust_cells["test_roi_units"].gt(0).sum()
            ),
            "positive_test_clv_cells": int(
                robust_cells["test_mean_clv"].gt(0).sum()
            ),
            "positive_test_roi_share": roi_positive_share,
            "positive_test_clv_share": clv_positive_share,
            "minimum_required_share": float(minimum_robust_cell_share),
        },
        "readiness_checks": checks,
        "candidate_eligibility": {
            "contract": (
                "structural_rules_v1"
                if "reason" in decisions.columns
                else "legacy_unverified"
            ),
            "decision_rows_input": int(len(decisions)),
            "decision_rows_threshold_eligible": int(input_mask.sum()),
            "decision_rows_structurally_excluded": int((~input_mask).sum()),
        },
        "operating_contract": {
            "quote_timing": "opening_or_first_seen_only",
            "market": "total",
            "allowed_sides": [str(side).lower()],
            "flat_backtest_stake_units": 1.0,
            "forward_stake_cap_bankroll_pct": 0.25,
            "full_promotion_min_forward_decisions": 50,
            "historical_forward_test_decisions": test_metrics["unique_matches"],
            "additional_live_decisions_required_for_full_promotion": max(
                50 - test_metrics["unique_matches"],
                0,
            ),
            "require_fresh_price": True,
            "require_model_family_match": True,
        },
        "caveats": [
            "The test is walk-forward by match date, but model ratings may update from earlier test-season results; only thresholds remain frozen.",
            "Evidence uses OddsPortal average opening prices and exact matched closes, not arbitrary intraday or closing prices.",
            "The bootstrap resamples matches and does not remove league-wide regime risk.",
            "Forward use must keep the policy/model/side/quote-timing contract unchanged and track every eligible decision.",
        ],
    }
    return FrozenPolicyValidation(
        selected_bets=selected_test,
        threshold_grid=threshold_grid,
        summary=summary,
    )
