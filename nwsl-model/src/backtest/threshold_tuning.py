"""Nested chronological ML threshold tuning for betting decision logs.

Walks a backtest decision log forward in time, block by block (a block is a
single match_date / slate). For each block, thresholds (min_edge,
min_confidence) per market group are selected using ONLY strictly-prior
settled candidates, then the frozen selection is applied out-of-sample to
that block. This guarantees no look-ahead: nothing in a block's chosen
thresholds can depend on results from that block or any later block.

This module intentionally reuses the candidate-preparation and settlement
helpers from ``scripts.analyze_betting_thresholds`` so the settlement
convention (flat 1-unit stake, 1x2 win = price - 1 else -1, totals exact-line
push = 0) stays identical between the ad hoc analysis script and this
nested-tuning evidence generator.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import pandas as pd

from scripts.analyze_betting_thresholds import _prepare_candidates

MARKET_GROUPS: tuple[str, ...] = ("moneyline", "totals")

# Mirrors configs/default.yaml betting.market_rules. Used whenever a block's
# prior history is too sparse to tune on, or as the fallback threshold
# family for a market group entirely.
DEFAULT_BASE_THRESHOLDS: dict[str, dict[str, float]] = {
    "moneyline": {"min_edge": 0.03, "min_confidence": 0.05},
    "totals": {"min_edge": 0.10, "min_confidence": 0.0},
}

# Mirrors configs/default.yaml threshold_tuning grid defaults.
DEFAULT_EDGE_GRID: list[float] = [0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.10]
DEFAULT_CONFIDENCE_GRID: list[float] = [0.0, 0.03, 0.05, 0.08, 0.10, 0.15]

OOS_CURVE_COLUMNS: list[str] = [
    "block",
    "market_group",
    "chosen_min_edge",
    "chosen_min_confidence",
    "n_bets",
    "pnl_units",
    "wins",
    "source",
]

GLOBAL_MIN_EDGE_NOTE = (
    "betting.min_edge (the global StakingEngine floor) must be <= the "
    "recommended per-market min_edge for that market's picks to actually "
    "clear the staker; read the recommended min_edge/min_confidence pair "
    "jointly with the global floor, not in isolation."
)

CAVEATS: list[str] = [
    "Backtest decision-log probabilities are uncalibrated (no OOF isotonic/"
    "Platt calibration applied at decision-log generation time).",
    "gating_status is hardcoded to 'passed' in backtest candidate generation; "
    "live promotion gating is not reflected in this evidence.",
    "Odds coverage used here is close-line only; there is no current/live-line "
    "sensitivity captured in these thresholds.",
    "The same underlying candidate can appear once per sportsbook row per "
    "market side; flat-stake settlement is applied over all candidate rows "
    "passing the cell thresholds, matching analyze_betting_thresholds.",
]


@dataclass
class NestedTuningResult:
    """Result of a nested chronological threshold-tuning run."""

    oos_curve: pd.DataFrame
    oos_summary: dict[str, Any]
    recommended: dict[str, Any]
    metadata: dict[str, Any]


def _empty_oos_summary() -> dict[str, dict[str, Any]]:
    return {
        group: {
            "n_bets": 0,
            "pnl_units": 0.0,
            "roi_units": 0.0,
            "hit_rate": 0.0,
            "n_blocks_tuned": 0,
            "n_blocks_fallback": 0,
        }
        for group in MARKET_GROUPS
    }


def _resolve_base_thresholds(
    base_thresholds: dict[str, dict[str, float]] | None,
) -> dict[str, dict[str, float]]:
    if base_thresholds is None:
        return {group: dict(values) for group, values in DEFAULT_BASE_THRESHOLDS.items()}
    resolved: dict[str, dict[str, float]] = {}
    for group in MARKET_GROUPS:
        values = base_thresholds.get(group) if isinstance(base_thresholds, dict) else None
        resolved[group] = dict(values) if values else dict(DEFAULT_BASE_THRESHOLDS[group])
    return resolved


def _build_metadata(
    *,
    edge_grid: list[float],
    confidence_grid: list[float],
    min_bets_per_cell: int,
    min_history_bets: int,
    rank_metric: str,
    model: str,
    generated_at: str,
) -> dict[str, Any]:
    return {
        "edge_grid": list(edge_grid),
        "confidence_grid": list(confidence_grid),
        "min_bets_per_cell": int(min_bets_per_cell),
        "min_history_bets": int(min_history_bets),
        "rank_metric": rank_metric,
        "caveats": list(CAVEATS),
        "model": model,
        "generated_at": generated_at,
        "evidence_missing": False,
    }


def _empty_result(
    *,
    resolved_base: dict[str, dict[str, float]],
    metadata: dict[str, Any],
    reason: str,
    recommended: dict[str, Any] | None = None,
) -> NestedTuningResult:
    payload_recommended = (
        recommended
        if recommended is not None
        else {group: dict(values) for group, values in resolved_base.items()}
    )
    payload_metadata = dict(metadata)
    payload_metadata["evidence_missing"] = True
    payload_metadata["reason"] = reason
    return NestedTuningResult(
        oos_curve=pd.DataFrame(columns=OOS_CURVE_COLUMNS),
        oos_summary=_empty_oos_summary(),
        recommended=payload_recommended,
        metadata=payload_metadata,
    )


def _score_cell(group: pd.DataFrame, min_edge: float, min_confidence: float) -> dict[str, Any]:
    if group.empty:
        selected = group
    else:
        selected = group[
            group["edge"].ge(float(min_edge))
            & group["confidence"].ge(float(min_confidence))
            & group["market_price"].gt(1.0)
        ]
    n_bets = int(len(selected))
    pnl = float(selected["pnl_unit"].sum()) if n_bets else 0.0
    wins = int(selected["pnl_unit"].gt(0).sum()) if n_bets else 0
    return {
        "min_edge": float(min_edge),
        "min_confidence": float(min_confidence),
        "n_bets": n_bets,
        "pnl_units": pnl,
        "roi_units": (pnl / n_bets) if n_bets else 0.0,
        "hit_rate": (wins / n_bets) if n_bets else 0.0,
        "wins": wins,
    }


def _select_thresholds(
    group: pd.DataFrame,
    *,
    edge_grid: Iterable[float],
    confidence_grid: Iterable[float],
    min_bets_per_cell: int,
    min_history_bets: int,
    rank_metric: str,
    base: dict[str, float],
) -> tuple[dict[str, float], str, dict[str, Any] | None]:
    """Select the best (min_edge, min_confidence) cell on `group` (history).

    Returns (chosen_thresholds, source, best_cell_stats). source is 'tuned'
    when a grid cell was selected on sufficient history, else 'fallback'.
    """
    if group.empty:
        settled_count = 0
    else:
        settled_count = int(group["market_price"].gt(1.0).sum())

    if settled_count < min_history_bets:
        return dict(base), "fallback", None

    cells = [
        _score_cell(group, edge, confidence)
        for edge in edge_grid
        for confidence in confidence_grid
    ]
    eligible = [cell for cell in cells if cell["n_bets"] >= min_bets_per_cell]
    if not eligible:
        return dict(base), "fallback", None

    eligible.sort(
        key=lambda cell: (
            -cell.get(rank_metric, cell["roi_units"]),
            -cell["pnl_units"],
            -cell["n_bets"],
            cell["min_edge"],
            cell["min_confidence"],
        )
    )
    best = eligible[0]
    chosen = {"min_edge": best["min_edge"], "min_confidence": best["min_confidence"]}
    return chosen, "tuned", best


def run_nested_threshold_tuning(
    decisions: pd.DataFrame | None,
    predictions: pd.DataFrame | None,
    *,
    edge_grid: Iterable[float],
    confidence_grid: Iterable[float],
    min_bets_per_cell: int = 8,
    min_history_bets: int = 30,
    rank_metric: str = "roi_units",
    base_thresholds: dict[str, dict[str, float]] | None = None,
    model: str = "",
    generated_at: str = "",
) -> NestedTuningResult:
    """Run nested chronological threshold tuning on a decision log.

    Blocks are sorted unique ``match_date`` values in ``decisions``. For each
    block, thresholds are selected on strictly-prior history only (never on
    same-block or future rows), then frozen and applied to that block's own
    candidates to compute out-of-sample profitability. See module docstring
    and packet 07 for the full algorithm contract.
    """
    edge_grid = list(edge_grid)
    confidence_grid = list(confidence_grid)
    resolved_base = _resolve_base_thresholds(base_thresholds)
    metadata_base = _build_metadata(
        edge_grid=edge_grid,
        confidence_grid=confidence_grid,
        min_bets_per_cell=min_bets_per_cell,
        min_history_bets=min_history_bets,
        rank_metric=rank_metric,
        model=model,
        generated_at=generated_at,
    )

    # Step 0: empty-input contract. No decision log, or no match_date
    # coverage at all, is an honest "no evidence" state, not an error.
    has_decisions = decisions is not None and not decisions.empty
    has_match_date = (
        has_decisions
        and "match_date" in decisions.columns
        and decisions["match_date"].notna().any()
    )
    if not has_decisions or not has_match_date:
        recommended = (
            base_thresholds
            if base_thresholds is not None
            else {group: dict(values) for group, values in resolved_base.items()}
        )
        return _empty_result(
            resolved_base=resolved_base,
            metadata=metadata_base,
            reason="no decision log or no match_date coverage",
            recommended=recommended,
        )

    # Defensive: if candidates cannot be prepared (e.g. predictions missing
    # required columns, or the merge produces zero matched rows), degrade
    # gracefully rather than crash the whole tuning/export pipeline.
    try:
        candidates = _prepare_candidates(decisions, predictions if predictions is not None else pd.DataFrame())
    except ValueError as exc:
        return _empty_result(
            resolved_base=resolved_base,
            metadata=metadata_base,
            reason=f"could not prepare candidates: {exc}",
        )

    if candidates.empty:
        return _empty_result(
            resolved_base=resolved_base,
            metadata=metadata_base,
            reason="no candidates after merging decisions with predictions",
        )

    dated = candidates[candidates["match_date"].notna()].copy()
    blocks = sorted(dated["match_date"].unique())

    oos_rows: list[dict[str, Any]] = []
    n_blocks_tuned = {group: 0 for group in MARKET_GROUPS}
    n_blocks_fallback = {group: 0 for group in MARKET_GROUPS}

    for block in blocks:
        history = dated[dated["match_date"] < block]
        block_rows = dated[dated["match_date"] == block]
        for group in MARKET_GROUPS:
            history_group = history[history["market_group"] == group]
            block_group = block_rows[block_rows["market_group"] == group]
            chosen, source, _best = _select_thresholds(
                history_group,
                edge_grid=edge_grid,
                confidence_grid=confidence_grid,
                min_bets_per_cell=min_bets_per_cell,
                min_history_bets=min_history_bets,
                rank_metric=rank_metric,
                base=resolved_base[group],
            )
            if source == "tuned":
                n_blocks_tuned[group] += 1
            else:
                n_blocks_fallback[group] += 1
            cell_result = _score_cell(block_group, chosen["min_edge"], chosen["min_confidence"])
            oos_rows.append(
                {
                    "block": block,
                    "market_group": group,
                    "chosen_min_edge": chosen["min_edge"],
                    "chosen_min_confidence": chosen["min_confidence"],
                    "n_bets": cell_result["n_bets"],
                    "pnl_units": cell_result["pnl_units"],
                    "wins": cell_result["wins"],
                    "source": source,
                }
            )

    oos_curve = (
        pd.DataFrame(oos_rows, columns=OOS_CURVE_COLUMNS)
        if oos_rows
        else pd.DataFrame(columns=OOS_CURVE_COLUMNS)
    )

    oos_summary: dict[str, Any] = {}
    for group in MARKET_GROUPS:
        if oos_curve.empty:
            group_rows = oos_curve
        else:
            group_rows = oos_curve[oos_curve["market_group"] == group]
        n_bets = int(group_rows["n_bets"].sum()) if not group_rows.empty else 0
        pnl_units = float(group_rows["pnl_units"].sum()) if not group_rows.empty else 0.0
        wins = int(group_rows["wins"].sum()) if not group_rows.empty else 0
        oos_summary[group] = {
            "n_bets": n_bets,
            "pnl_units": pnl_units,
            "roi_units": (pnl_units / n_bets) if n_bets else 0.0,
            "hit_rate": (wins / n_bets) if n_bets else 0.0,
            "n_blocks_tuned": n_blocks_tuned[group],
            "n_blocks_fallback": n_blocks_fallback[group],
        }

    # Step 3: final recommendation computed on ALL history, same guardrails.
    recommended: dict[str, Any] = {}
    recommended_source: dict[str, str] = {}
    for group in MARKET_GROUPS:
        all_group = candidates[candidates["market_group"] == group]
        chosen, source, _best = _select_thresholds(
            all_group,
            edge_grid=edge_grid,
            confidence_grid=confidence_grid,
            min_bets_per_cell=min_bets_per_cell,
            min_history_bets=min_history_bets,
            rank_metric=rank_metric,
            base=resolved_base[group],
        )
        recommended[group] = {
            "min_edge": chosen["min_edge"],
            "min_confidence": chosen["min_confidence"],
        }
        recommended_source[group] = source
    recommended["global_min_edge_note"] = GLOBAL_MIN_EDGE_NOTE

    metadata = dict(metadata_base)
    metadata["n_blocks"] = len(blocks)
    metadata["recommended_source"] = recommended_source

    return NestedTuningResult(
        oos_curve=oos_curve,
        oos_summary=oos_summary,
        recommended=recommended,
        metadata=metadata,
    )
