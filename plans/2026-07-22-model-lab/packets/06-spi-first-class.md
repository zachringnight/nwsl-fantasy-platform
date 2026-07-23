# Packet 06: spi-first-class

## Objective
Make `spi_lite_baseline` a first-class production forecast candidate: explicitly promotable through gates (never by fiat), persistable with train-time league rates (kill the train/serve skew), and resolvable through the champion registry, while keeping every fail-closed invariant.

## Files
- Modify: `nwsl-model/src/utils/gating.py`
- Modify: `nwsl-model/src/utils/artifacts.py`
- Modify: `nwsl-model/src/models/baseline.py`
- Modify: `nwsl-model/scripts/train.py`
- Modify: `nwsl-model/scripts/predict.py`
- Modify: `nwsl-model/scripts/run_operator_report.py`
- Modify: `nwsl-model/scripts/promote.py`
- Modify: `nwsl-model/scripts/evaluate.py`
- Modify: `nwsl-model/tests/test_artifacts.py`, `nwsl-model/tests/test_spi_lite.py` (extend)

## REVISED (post-review, 2026-07-22)
Adversarial review flagged two real gaps, both addressed below:
1. **Evidence transfer gap.** Backtest decisions (which the OOS gate scores) use UNCALIBRATED probabilities and hardcoded `gating_status='passed'` on `source_type=='close'` odds; live picks apply `apply_market_calibration` and gate on `source_type=='current'` odds. Flipping `gating_status='passed'` on close-time backtest ROI alone opens LIVE official picks the evidence never directly validated. Fix: raise the OOS bar materially (below) and always attach a caveat field so a human sees the gap even after the gate passes.
2. **Evidence-model coupling.** The gate assumed `spi_lite_baseline` is always the strongest baseline; on refreshed data that may not hold. Fix: gate whichever model packet 07 was told is the evidence model, and packet 11 explicitly tells packet 07's script to target the strongest baseline by name (see packet 07's revised script contract).

## Context facts (verified)
- Today spi_lite serves ONLY via the implicit `_select_best_baseline` fallback (kind="baseline_fallback"): `resolve_model_artifact` (artifacts.py:141-198) alias branch loads `<version>/{model_family}_model.pkl` which never exists for baselines, so a hand-written alias would crash predict.
- `evaluate_go_live_gates` iterates only PURE_MODELS; `choose_champions` picks only among passing pure models. spi_lite cannot pass or be recorded.
- Train/serve skew: backtest fits `league_home_rate=max(train_home_npxg, 0.1)`, `league_away_rate=max(train_away_npxg, 0.1)` per fold (runner.py:544-545); serving hardcodes 1.25/1.05 because `ProjectionBaselineModel.__init__(strategy, ratings_model=None, max_goals=8, spi_lite_config=None)` (baseline.py:44-55) does not pass league rates and no config keys exist. Packet 01 added `spi_lite.league_home_rate: null` and `spi_lite.league_away_rate: null`.
- `_load_model_stack` + `_load_calibration_artifact` are DUPLICATED between predict.py (107-145) and run_operator_report.py (89-127). Change both identically.
- Gate metric convention: `effective_log_loss = posthoc.get('multiclass_log_loss_after_oof', raw)`; strongest baseline = min log_loss_1x2 among gating.py BASELINE_MODELS.
- promote.py is the only writer of champions.json; alias payload {model_family, blended, gating_status, mode, version, promoted_at}.
- Packet 07 produces `tune_betting_thresholds` OOS artifact at `<version_dir>/betting_analysis/nested_thresholds_summary.json` with `oos` block per market_group (see its contract). Fail closed when absent.

## Steps
1. Failing tests first:
   - test_artifacts.py: (a) `evaluate_baseline_go_live_gates` returns passed=False when the OOS evidence file is absent, with `evidence_missing=True` in the result; (b) passes only when: season coverage ok, classwise ECE <= 0.05, posthoc calibration available, model is the strongest baseline by effective (OOF) log loss, AND the nested-tuning OOS artifact shows moneyline `oos.n_blocks_tuned >= 5` (real walk-forward evidence, not all-fallback), `oos.n_bets >= 50` (raised from 30 — thin samples overfit grid selection), and `oos.roi_units >= 0.05` (raised from `> 0` — a positive-but-negligible ROI at close-time uncalibrated prices is not a reliable signal); (c) the passing result ALWAYS includes `"evidence_caveat": "OOS ROI measured on close-time, uncalibrated backtest odds; live picks run on current, calibrated odds and current gating — this evidence does not directly transfer"` regardless of pass/fail, so it is visible in evaluation_summary.json either way; (d) `resolve_model_artifact` on an alias whose model_family is in the baseline tuple returns kind='baseline_promoted' and does NOT attempt a pkl load; (e) `choose_champions` records a baseline champion only when no pure model passed and the baseline gate passed.
   - test_spi_lite.py: `ProjectionBaselineModel(strategy='spi_lite_baseline', ..., league_home_rate=X, league_away_rate=Y)` passes the rates through to SpiLiteBaseline (assert on resulting lambdas or stored config).
2. `train.py`: after fitting team ratings, compute league rates from the SAME training frame the backtest convention uses (mean home npxg, mean away npxg, floored at 0.1; respect `spi_lite.league_home_rate`/`league_away_rate` config overrides when not null) and write `<version>/spi_lite_summary.json` = {league_home_rate, league_away_rate, n_matches, source: 'train_npxg_mean'}.
3. `baseline.py`: `ProjectionBaselineModel.__init__` gains optional `league_home_rate=None, league_away_rate=None`, forwarded to SpiLiteBaseline when strategy=='spi_lite_baseline' (None keeps current defaults).
4. `artifacts.py`: alias resolution: when `model_family` is in the baseline tuple, return kind='baseline_promoted' (no pkl path); keep existing fallback behavior otherwise.
5. predict.py AND run_operator_report.py `_load_model_stack`: for kind in {'baseline_fallback','baseline_promoted'}, read `<version>/spi_lite_summary.json` when present and pass the rates into ProjectionBaselineModel. Absent file keeps today's behavior (defaults), so old artifacts still serve.
6. `gating.py`: add `evaluate_baseline_go_live_gates(backtest_summary, evaluation_summary, dataset_manifest, oos_summary) -> dict` with the checks and evidence_caveat in step 1b/c, statuses 'passed'|'research_only', same shape as the pure gate results. Extend `choose_champions(gate_results, baseline_gate_results=None)`: pure passers keep absolute priority for champion_pure; if none pass and a baseline passed, alias champion_pure -> {model_family: <baseline>, mode: 'baseline', gating_status: 'passed', evidence_caveat: <the string>}.
7. `evaluate.py`: also build benchmark/gate inputs for the strongest baseline (extend `_build_benchmark_comparison` guard) and include baseline gate evaluation in evaluation_summary.gate_results. Determine the strongest baseline by name from `backtest_summary` (min log_loss_1x2 among gating.py's BASELINE_MODELS), then look for the OOS artifact at `<version>/betting_analysis/nested_thresholds_summary_<that model name>.json` FIRST, falling back to `<version>/betting_analysis/nested_thresholds_summary.json` (packet 07's default single-model filename) if the model-specific one is absent; if neither exists, mark `evidence_missing=True` and gate fails closed.
8. `promote.py`: pass baseline gate results into choose_champions and write the alias as decided. Never remove existing aliases.
9. Fail-closed check: with no OOS artifact, promotion output must be identical to today (empty aliases, research_only everywhere). generate_betting_slate.py's `gating_status != 'passed' -> accepted_bet=False` is untouched.

## Interface contract (produced)
- `<version>/spi_lite_summary.json` {league_home_rate: float, league_away_rate: float, n_matches: int, source: str}.
- `evaluate_baseline_go_live_gates(...)` result dict: {model, passed: bool, gating_status, checks: {...}, metrics: {...}}.
- champions.json alias may now carry mode 'baseline' with kind resolution 'baseline_promoted'.
- Consumers: packet 11 runs evaluate/promote; packet 13 verifies slate gating.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_artifacts.py tests/test_spi_lite.py tests/test_recommendations.py tests/test_betting_slate.py -q
```
Expected: 0 failures. Then run the pipeline smoke (it subprocess-runs train/backtest/evaluate/promote and breaks last on schema drift):
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_pipeline_smoke.py -q
```
Expected: passes.

## Done-signal
End with exactly one line: `DONE: 06` / `DONE_WITH_CONCERNS: 06: <one line>` / `BLOCKED: 06: <one line>`.
