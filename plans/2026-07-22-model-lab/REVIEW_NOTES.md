# Adversarial Review Notes (2026-07-22)

Four-lens review (contracts, wave/dependency correctness, feasibility, scope-safety) run against the manifest and 13 packets before execution. Workflow `wf_0461c93e-d81`, 4 agents, ~703K tokens, 118 tool calls, all cross-checked claims against the live working tree.

## Critical: baseline models never settle bets (found independently by all 4 lenses)

`BacktestRunner._evaluate_baseline_fold` (the dispatch path for `spi_lite_baseline` and every other benchmark) has no `staker` parameter and never calls `_generate_and_settle_bets` — that call exists only in the pure-model path (`_evaluate_fold`'s `dixon_coles`/`bivariate_poisson` branch). Confirmed on disk: the latest real artifact has `decision_log_*`/`bet_log_*` files only for the two pure models; `spi_lite_baseline` shows `moneyline_n_bets=0`, `roi=None`. This broke the plan's central thesis: packets 06 (baseline promotion gate), 07 (nested threshold tuning), 08 (market_residual, which dispatches through the same broken path), 09 (totals model, which also found baseline predictions missing `main_total_*` columns for the same root reason), and 11 (the lab run that ties it together) all consumed an artifact that would never exist.

**Fix:** packet 04 (wave 1, already owns `runner.py`) was expanded from "add fold_id/match_date" to "add bet settlement to the baseline path, add the missing main_total_* columns, then add fold_id/match_date" — verified against the actual source with exact line-level detail so an isolated executor agent doesn't have to rediscover this. Packet 08 was rewritten to state the exact dispatch-guard edit (`MARKET_MODELS` set, `or base_model in MARKET_MODELS`) it depends on. Packet 09's dependency is now satisfied by packet 04's fix, with a defensive fallback kept anyway.

## Other confirmed findings and fixes

| # | Severity | Packet | Finding | Fix |
|---|----------|--------|---------|-----|
| 1 | critical | 04 | fold_id stamping instruction referenced a `fold` variable that doesn't exist inside `_evaluate_baseline_fold` | Folded into the same settlement fix: `fold` is now threaded in as a real parameter |
| 2 | critical | 08 | `market_residual` dispatch guard was described in prose, not as code; without the exact `runner.py` edit it raises `ValueError` (hard crash in season_holdout, silent drop in rolling backtest) | Packet 08 now states the exact `MARKET_MODELS` set + dispatch condition edit |
| 3 | critical | 11 | No check that `market_residual` actually produced backtest results; per-fold crashes are silently swallowed by `try/except: log + continue` | Added step 2b: hard assert `market_residual` and `spi_lite_baseline` are in `backtest_summary.json['models']` before continuing |
| 4 | major | 11 | `season_holdout.py` has NO try/except around `_evaluate_fold`; a market_residual crash there aborts the entire holdout (all 4 models), invisibly | Added step 8b: assert `season_holdout_summary.json` exists and covers all requested models; documented fallback (drop market_residual, keep the other 3) if it doesn't |
| 5 | minor | 13 | `totals_never_official` fail-closed check tested a `market` column that doesn't exist on the real `betting_slate.csv`, so it always passed vacuously — one of the plan's three "non-negotiable" invariants was not actually being checked | Rewritten against the verified real schema; checks `recommended_bets` string content for `official_pick` rows |
| 6 | major | 05 | Goal item 1 ("appearances through yesterday") had no mechanism — the only writer of `appearances.csv` was the forbidden `--build-dataset` path | Found `dataset_builder.build_appearances()` is a pure, non-destructive function (reads only nwsl-official logs, never touches matches.csv/odds.csv); packet 05 now calls it directly |
| 7 | major | 06 | Baseline promotion gate would flip `gating_status='passed'` (unlocking LIVE official picks) on close-time, uncalibrated backtest ROI evidence that doesn't directly transfer to the live calibrated/current-odds stream | Raised the OOS bar (n_bets 30→50, roi_units >0→≥0.05, added n_blocks_tuned≥5) and require an `evidence_caveat` string always attached to the gate result, visible whether it passes or fails |
| 8 | minor | 06/07 | Gate assumed `spi_lite_baseline` is always the strongest baseline; not guaranteed on refreshed data | Packet 07 now writes per-model-named summary files; packet 06 resolves the strongest baseline by name and reads its file |
| 9 | minor | 07 | No contract for "evidence model has zero settled bets" (possible even after fix #1, e.g. if odds coverage collapses) | Added an explicit empty-input contract: return a zeroed, honestly-labeled `evidence_missing=True` result instead of raising |
| 10 | minor | 05 | `assert (u['match_date'] >= today).all()` would spuriously fail on legitimate postponed-fixture rows | Relaxed to a reported note, not a hard failure |

## Confirmed sound as originally written
Packets 01 (config-schema), 02 (fix-appearances-fetch), 03 (oddsportal-direct-mode), 10 (odds-close-backfill), 12 (docs-organization). Wave partitioning and the file-conflict matrix were confirmed clean by the waves lens — no two same-wave packets touch the same file.

## Explicitly evaluated and confirmed NOT a problem
- Chronological integrity in packets 07/08/09: per-fold use of a train row's own close odds as a fit feature, with test rows using their own close odds at predict time, is a legitimate close-time strategy (each row uses only its own market data, not future information), not leakage.
- Leaving the promotion gate's OOF calibration as random k-fold (not chronological) unchanged, with a caveat note, was confirmed the right call for this lab's scope rather than a blocking defect.
