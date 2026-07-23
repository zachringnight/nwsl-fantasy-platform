# Packet 04: baseline-bet-settlement-and-fold-persistence

## REVISED SCOPE (post-review, 2026-07-22)

Adversarial review found the plan's central premise broken at the root: **baseline models never settle bets today.** `_evaluate_baseline_fold` (the path spi_lite_baseline, market_residual, and every other benchmark dispatch through) has no `staker` parameter and never calls `_generate_and_settle_bets`. Confirmed on disk: `data/processed/models/2025plus-20260528T180732Z/backtest/` has `decision_log_*`/`bet_log_*` files ONLY for dixon_coles and bivariate_poisson; `spi_lite_baseline` has zero bets, zero candidates, `roi=None`. Every downstream packet (06, 07, 08, 09, 11) that reads a baseline decision log depends on this packet fixing it. This packet now does that, plus the original fold_id/match_date persistence, plus a second bug the review found: baseline predictions are missing the `main_total_*` columns packet 09 needs.

## Files
- Modify: `nwsl-model/src/backtest/runner.py`
- Modify: `nwsl-model/src/betting/recommendations.py`
- Modify: `nwsl-model/scripts/season_holdout.py` (keep in sync; it calls runner privates directly)
- Modify: `nwsl-model/tests/test_backtest_profitability.py` (extend)

## Verified source facts (read directly from the working tree 2026-07-22, use these exact names/lines as your map, but treat line numbers as approximate since the tree is dirty)

- `BacktestRunner._evaluate_fold(self, fold: BacktestFold, model_name, staker: StakingEngine, blender, odds, appearances=None, projected_lineups=None, team_season_priors=None, player_season_priors=None) -> pd.DataFrame`: `fold`, `staker`, and `odds` ARE already parameters here. It computes `context_provider` and `ratings_model` from `train`, then:
  ```python
  if base_model in BASELINE_MODELS:
      return self._evaluate_baseline_fold(
          base_model=base_model, train=train, test=test,
          context_provider=context_provider, ratings_model=ratings_model,
          model_name=model_name,
      )
  ```
  This is the ONLY place that needs new arguments threaded in: add `fold=fold, staker=staker, odds=odds`.
- `BacktestRunner._evaluate_baseline_fold(self, base_model, train, test, context_provider, ratings_model, model_name) -> pd.DataFrame`: builds per-baseline `lambda_home/lambda_away/matrix/probs_override` in a big if/elif chain keyed on `base_model` (uniform_baseline, home_field_baseline, team_ratings_poisson, rolling_npxg_poisson, regularized_elo_baseline, spi_lite_baseline), then for every test row calls `self._prediction_row_from_markets(row=row, model_name=model_name, matrix=matrix, lambda_home=lambda_home, lambda_away=lambda_away, contextual_features=contextual_features, probs_override=probs_override)` and appends to `rows`. NO bet settlement happens anywhere in this function.
- `BacktestRunner._prediction_row_from_markets(self, row, model_name, matrix, lambda_home, lambda_away, contextual_features=None, probs_override=None) -> dict`: internally computes `markets = derive_all_markets(matrix, match_id=str(row["match_id"]))`, builds `result_row` with prob_home/draw/away, lambdas, score_matrix, contextual columns, and a loop over `(1.5, 2.5, 3.5, 4.5)` adding `prob_over_{line}/fair_over_{line}/fair_under_{line}` when present. It does **NOT** add the `main_total_line` / `main_total_over_market_odds` / `main_total_under_market_odds` / `prob_over_main_total` / `fair_over_main_total` / `fair_under_main_total` / `main_total_over_actual` block. That block exists ONLY in the pure-model path inside `_evaluate_fold` (the `total_line = row.get("total_line", row.get("line")); if pd.notna(total_line): ...` block, right after the `(1.5,2.5,3.5,4.5)` loop, before `results.append(result_row)`). This is why packet 09 would find zero total-market columns on `predictions_spi_lite_baseline.csv`.
- `BacktestRunner._generate_and_settle_bets(self, row, pred, markets, odds_rows, staker, model_name) -> None`: uses `row`, `markets`, `odds_rows`, `staker`, `model_name`. The `pred` parameter is accepted but **never referenced in the function body** — confirmed by reading the full body. It is safe to make `pred` optional (`pred: PredictionResult | None = None`) and call sites for baseline/market rows can pass `pred=None`.
- Pure-path call site (inside `_evaluate_fold`'s test-row loop): builds `odds_rows` by filtering `odds` to `match_id == str(row["match_id"])` and `source_type == "close"` (case-insensitive), calls `self._generate_and_settle_bets(row, pred, markets, odds_rows=..., staker=staker, model_name=base_model)`. Mirror this EXACT odds-row filter in the baseline path.
- `evaluate_market_candidates(*, match_id, slate_key, odds_rows, markets, staker, selection, now=None, model_version='', model_family='', blended=False, gating_status='unknown') -> list[BetDecision]` (src/betting/recommendations.py) is called from inside `_generate_and_settle_bets` with `gating_status="passed"` hardcoded (intentional; comment explains backtest candidate generation should not be blocked by live promotion gates) and `blended=model_name == "full_blend"`.
- `BetDecision` dataclass and `to_record()` in `src/betting/recommendations.py` (class starts near line 144; `to_record` near line 175; `evaluate_market_candidates` starts near line 604). Fields include edge, confidence, probability_edge, expected_value, clv, pick_tier, actionable, accepted, reason, stake, stake_pct, slate_key, gating_status.
- `season_holdout.py::run_season_holdout` calls `runner._evaluate_fold(...)` directly with NO try/except (unlike `BacktestRunner.run`, which wraps each fold's `_evaluate_fold` call in try/except and logs+continues on failure). Any signature change to `_evaluate_fold`'s call chain must keep season_holdout.py working; it does not call `_evaluate_baseline_fold` directly so it needs no edit for the settlement change itself, only for fold_id if you add new required params.

## Steps

### A. Baseline (and future market-model) bet settlement — THE critical fix
1. Failing test first in `tests/test_backtest_profitability.py`: build a tiny synthetic backtest config (mirror `test_backtest_config.py`'s dict-config pattern) with enough matches to form at least one fold, close odds present for the test-fold matches, and `models_to_run=["spi_lite_baseline"]`. Run `BacktestRunner(config).run(matches, odds=odds)`. Assert the returned `all_model_results["spi_lite_baseline"]["decision_log"]` is non-empty (at least one row) OR, if the synthetic odds/edges genuinely produce no accepted candidates, assert the decision log at minimum contains rejected-candidate rows (i.e. `evaluate_market_candidates` was actually invoked, not skipped). Prefer constructing odds/edges so at least one bet is accepted, so the test is a real settlement check, not just a "was it called" check.
2. In `_evaluate_fold`, change the baseline dispatch call to thread the three already-available locals through:
   ```python
   if base_model in BASELINE_MODELS:
       return self._evaluate_baseline_fold(
           base_model=base_model, train=train, test=test,
           context_provider=context_provider, ratings_model=ratings_model,
           model_name=model_name, fold=fold, staker=staker, odds=odds,
       )
   ```
3. Extend `_evaluate_baseline_fold`'s signature to accept `fold: BacktestFold, staker: StakingEngine, odds: Optional[pd.DataFrame]`.
4. Inside its per-row loop, right after `matrix`/`lambda_home`/`lambda_away`/`probs_override` are resolved (after the big if/elif chain, before appending to `rows`):
   - Compute `markets = derive_all_markets(matrix, match_id=str(row["match_id"]))` once.
   - Build `odds_rows` with the exact same filter the pure path uses (match_id + source_type=='close', case-insensitive, empty DataFrame when odds is None/empty).
   - Call `self._generate_and_settle_bets(row, pred=None, markets=markets, odds_rows=odds_rows, staker=staker, model_name=base_model, fold_id=fold.fold_id, match_date=str(row.get("match_date")))` (fold_id/match_date kwargs added in part C below).
   - Pass the SAME `markets` object into `_prediction_row_from_markets` instead of letting it recompute internally: change `_prediction_row_from_markets`'s signature to accept `markets` as a required parameter (remove its internal `derive_all_markets` call, since the caller now always supplies it) — this means the pure path's call site inside `_evaluate_fold` must also pass its already-computed `markets` (it already computes one at `markets = derive_all_markets(pred.score_matrix, match_id=...)` right before calling `_generate_and_settle_bets` — reuse the same variable if that call site is refactored to also use `_prediction_row_from_markets`; if the pure path does NOT currently call `_prediction_row_from_markets` at all (it builds `result_row` inline), leave the pure path's inline construction untouched and ONLY change `_prediction_row_from_markets`'s signature/callers, since it is exclusively used by `_evaluate_baseline_fold` today (verify this with a grep for `_prediction_row_from_markets(` before changing the signature; if it has exactly one call site, changing its signature is safe).
5. Extend `_generate_and_settle_bets`'s signature: `pred: PredictionResult | None = None` (was required, now optional/unused-but-kept for the pure path's existing call), plus new keyword-only `fold_id: int | None = None, match_date: str = ""`.

### B. main_total_* columns for baseline predictions
6. Failing test: a baseline backtest (e.g. `home_field_baseline`) run with odds containing a `total` market row for the test match produces a `predictions_<model>.csv`-equivalent frame (the DataFrame `_evaluate_baseline_fold` returns) with a non-null `main_total_line` column for that row.
7. Add the exact same `main_total_line`/`main_total_over_market_odds`/`main_total_under_market_odds`/`prob_over_main_total`/`fair_over_main_total`/`fair_under_main_total`/`main_total_over_actual` block (copy verbatim from the pure path in `_evaluate_fold`, adapting `result_row["total_goals"]` which `_prediction_row_from_markets` already sets) into `_prediction_row_from_markets`, using the `row` and `markets` it already has in scope.

### C. fold_id / match_date persistence (original packet-04 objective, now correctly scoped)
8. Failing tests: a settled backtest decision log (from either path) contains `fold_id` and `match_date` columns populated for every row; prediction result rows (both `_evaluate_fold`'s inline pure-path rows and `_prediction_row_from_markets`'s baseline rows) contain `fold_id`; `evaluate_market_candidates` called WITHOUT the new kwargs still works (backward compat for live `predict.py`, which never passes fold_id/match_date).
9. `recommendations.py`: add optional fields `fold_id: int | None = None` and `match_date: str = ''` to `BetDecision` (and `to_record`). Add optional kwargs `fold_id=None, match_date=''` to `evaluate_market_candidates`, threaded into every decision it creates including rejects.
10. `runner.py`: thread `fold_id=fold.fold_id, match_date=str(row.get('match_date'))` from both `_generate_and_settle_bets` call sites (pure path already has `fold` in scope; baseline path now does too per step 2) down into `evaluate_market_candidates`. Stamp `result_row["fold_id"] = fold.fold_id` in the pure path's inline dict and pass `fold_id=fold.fold_id` into `_prediction_row_from_markets` (add it as a parameter, stamp it into `result_row`).
11. Do not disturb: the `metrics.get('log_loss_1x2', 'N/A')` `:.4f` format string; the `blended = model_name == 'full_blend'` logic; `gating_status="passed"` hardcoding in backtest generation.

## Interface contract (produced)
- Baseline and market-model backtest runs now emit `decision_log_<model>.csv` and `bet_log_<model>.csv` (previously absent for every model in BASELINE_MODELS). This is a new capability, not a schema addition — packets 06/07/08/09/11 depend on it existing.
- `predictions_<model>.csv` for baseline models now carries `main_total_*` columns identical in shape to the pure-model path.
- decision_log/predictions rows across both paths carry `fold_id` (int) and `match_date` (str).
- `_prediction_row_from_markets` signature changes (adds required `markets`, adds `fold_id`); note this explicitly for packet 08, which calls the same baseline dispatch machinery for `market_residual`.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_backtest_profitability.py tests/test_recommendations.py tests/test_season_holdout.py tests/test_backtest_config.py -q
```
Expected: 0 failures. Then the fast loop:
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py
```
Expected: 0 failures. Then confirm the smoke test still passes (it subprocess-runs the pipeline and would catch a broken baseline path):
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_pipeline_smoke.py -q
```
Expected: passes.

## Done-signal
End with exactly one line: `DONE: 04` / `DONE_WITH_CONCERNS: 04: <one line>` / `BLOCKED: 04: <one line>`.
