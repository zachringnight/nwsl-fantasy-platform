# Packet 07: threshold-tuning

## Objective
Build nested chronological ML threshold tuning: walk the backtest decision log forward in time, select (min_edge, min_confidence) per market group using ONLY strictly-prior settled candidates, evaluate the frozen selection out-of-sample on each block, and emit an OOS profitability curve plus recommended thresholds. This is the evidence artifact the baseline promotion gate (packet 06) consumes.

## Files
- Create: `nwsl-model/src/backtest/threshold_tuning.py`
- Create: `nwsl-model/scripts/tune_betting_thresholds.py`
- Create: `nwsl-model/tests/test_threshold_tuning.py`

## REVISED (post-review, 2026-07-22)
Review found two gaps this packet now closes: (1) no contract for when the evidence model has an empty or missing decision log — packet 04 fixes baseline settlement so `spi_lite_baseline` WILL have a real decision log once wave 1 lands, but this script must still degrade gracefully rather than crash if odds coverage or edges happen to produce zero candidates; (2) packet 06's gate needs per-model-named summary files, not just one hardcoded to `spi_lite_baseline`, since the strongest baseline is data-dependent.

## Context facts (verified)
- `scripts/analyze_betting_thresholds.py` already has the reusable pieces: `_prepare_candidates` (merges decisions to predictions on match_id for home_goals_90/away_goals_90), `_settle_candidate(row)` (flat 1-unit: 1x2 win=price-1 else -1; totals exact-line push=0), `_market_group` ('1x2_'->moneyline, 'total_'->totals), DEFAULT_EDGE_THRESHOLDS, DEFAULT_CONFIDENCE_THRESHOLDS. Import them (`from scripts.analyze_betting_thresholds import ...` works via pythonpath=["."]).
- Packet 04 fixes baseline/market-model bet settlement (previously `spi_lite_baseline`/`market_residual` produced NO decision log at all — this was a critical bug the review caught) and adds `match_date` and `fold_id` to every decision-log row across both the pure and baseline/market paths. This packet depends on packet 04 having landed.
- Packet 01 added config `threshold_tuning: {edge_grid, confidence_grid, min_bets_per_cell: 8, min_history_bets: 30, rank_metric: roi_units}`.
- Decision logs live at `<version_dir>/backtest/decision_log_<model>.csv` beside `predictions_<model>.csv`; resolve version dirs like analyze_betting_thresholds does (`resolve_version_dir`).
- Known distribution caveats to state in the output metadata, not to solve here: backtest decisions use uncalibrated probs, gating_status hardcoded 'passed', close odds only; StakingEngine's global `betting.min_edge` floor interacts with per-market min_edge (report the recommended pair jointly).
- Same underlying candidate can appear once per sportsbook row per market side; leans carry accepted=False but stake>0. Flat-stake settlement over ALL candidate rows passing the cell thresholds is the convention (same as analyze_betting_thresholds).

## Algorithm (src/backtest/threshold_tuning.py)
`run_nested_threshold_tuning(decisions: pd.DataFrame, predictions: pd.DataFrame, *, edge_grid, confidence_grid, min_bets_per_cell=8, min_history_bets=30, rank_metric='roi_units', base_thresholds: dict | None = None) -> NestedTuningResult`
0. **Empty-input contract (new):** if `decisions` is `None` or empty, or lacks a `match_date` column with any non-null values, return a `NestedTuningResult` with `oos_curve` an empty DataFrame, `oos_summary` = `{group: {n_bets: 0, pnl_units: 0.0, roi_units: 0.0, hit_rate: 0.0, n_blocks_tuned: 0, n_blocks_fallback: 0} for group in ('moneyline', 'totals')}`, `recommended` = `base_thresholds` (the config defaults) unchanged, `metadata` including `"evidence_missing": True, "reason": "no decision log or no match_date coverage"`. Do NOT raise. This is the honest "no evidence" state, not an error.
1. Otherwise, prepare candidates via the analyze_betting_thresholds helpers.
2. Blocks = sorted unique match_date (a slate). For each block b in order:
   - history = candidates with match_date < b (strictly).
   - Per market_group: if settled history rows >= min_history_bets, score every grid cell on history (flat stake), keep cells with n_bets >= min_bets_per_cell, pick argmax rank_metric (ties: pnl_units desc, then n_bets desc, then LOWER min_edge for stability). Else fall back to base_thresholds for that group (default: moneyline min_edge 0.03/min_confidence 0.05, totals 0.10/0.0, mirroring configs/default.yaml market_rules).
   - Apply the FROZEN chosen cell to block b's candidates, settle flat-stake, accumulate OOS rows (block, market_group, chosen_min_edge, chosen_min_confidence, n_bets, pnl_units, source='tuned'|'fallback').
3. Final recommendation per market_group = selection computed on ALL history (same guardrails).
4. NestedTuningResult dataclass: `oos_curve: pd.DataFrame`, `oos_summary: dict` per market_group {n_bets, pnl_units, roi_units, hit_rate, n_blocks_tuned, n_blocks_fallback}, `recommended: dict` shaped like betting.market_rules payload fragments plus a top-level note that betting.min_edge (global staking floor) must be <= the recommended per-market min_edge to take effect, `metadata: dict` (grids, guardrails, caveats list, model, generated_at as caller-provided string, `evidence_missing: bool` defaulting False, set True only by the step-0 empty-input path).

## Script (scripts/tune_betting_thresholds.py)
CLI: `--artifact-root data/processed/models`, `--version` (default latest), `--models` (default: all models with a `decision_log_<model>.csv` present, whether empty or not), `--config configs/default.yaml` (reads threshold_tuning block). For EVERY model processed, writes into `<version_dir>/betting_analysis/`: `nested_thresholds_oos_curve_<model>.csv` (empty file with headers when evidence_missing) AND `nested_thresholds_summary_<model>.json` = {version, model, oos: oos_summary, recommended, metadata}. Additionally, for the model named by `--evidence-model` (default `spi_lite_baseline`; pass `--evidence-model` explicitly when the caller knows the strongest baseline by name), ALSO write a copy at the fixed path `nested_thresholds_summary.json` (same content) for backward-compatible/simple consumption. If a requested model has no decision log file at all (not even empty), skip it with a printed warning rather than failing the whole run. Print a compact table, no tokens involved.

## Tests (test_threshold_tuning.py, write FIRST)
1. No-lookahead property: build a synthetic decision log where late blocks contain a spectacular cell that early history does not support; assert early blocks' chosen thresholds are unaffected by mutating all future rows (run twice with scrambled future outcomes, assert identical selections for early blocks).
2. min_history_bets guardrail: sparse history uses base_thresholds fallback and marks source='fallback'.
3. OOS accumulation: hand-computable 3-block fixture where the known best cell wins on history and the OOS pnl equals the hand-settled sum.
4. Recommended output shape: keys match betting.market_rules fragment (min_edge, min_confidence per group) and the summary JSON round-trips through json.dumps.
5. Empty-input contract: `run_nested_threshold_tuning(decisions=pd.DataFrame(), predictions=pd.DataFrame(), ...)` returns cleanly (no raise) with `metadata["evidence_missing"] is True` and zeroed oos_summary per the step-0 spec.

## Interface contract (produced)
- `<version_dir>/betting_analysis/nested_thresholds_summary_<model>.json` for every processed model, plus `nested_thresholds_summary.json` as a copy for `--evidence-model`: {version: str, model: str, oos: {moneyline: {n_bets: int, pnl_units: float, roi_units: float, hit_rate: float, n_blocks_tuned: int, n_blocks_fallback: int}, totals: {...}}, recommended: {moneyline: {min_edge: float, min_confidence: float}, totals: {...}, global_min_edge_note: str}, metadata: {..., evidence_missing: bool}}. Consumers: packet 06 gate (moneyline `oos.n_blocks_tuned >= 5`, `oos.n_bets >= 50`, `oos.roi_units >= 0.05` — raised bar per packet 06's revision; reads the per-model-named file first, falls back to the fixed-name copy), packet 11 lab run, LAB_REPORT.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_threshold_tuning.py tests/test_threshold_profitability.py -q
```
Expected: 0 failures (existing analyze_betting_thresholds tests must stay green since we import from it).

## Done-signal
End with exactly one line: `DONE: 07` / `DONE_WITH_CONCERNS: 07: <one line>` / `BLOCKED: 07: <one line>`.
