# Packet 11: lab-run

## Objective
Run the full evidence lab on refreshed data: train a fresh artifact, run the rolling backtest and the 2025-to-2026 season holdout for every candidate, run nested threshold tuning and the totals model evaluation, let the gates decide promotion, and write LAB_REPORT.md with the promote-or-reject evidence. Execution-only; long-running; sequential by nature.

## REVISED (post-review, 2026-07-22)
Review found this packet's original verification would report DONE even if `market_residual` (the lab's headline candidate) silently produced zero results: the rolling backtest swallows per-fold exceptions (`try/except: log + continue`) with nothing propagating, and `season_holdout.py` calls the runner with NO try/except at all, so a `market_residual` crash there aborts the ENTIRE holdout, losing every model's ROI (including spi_lite, dixon_coles, bivariate_poisson) silently. Neither failure mode was checked before. Steps 2b and 8b below close that gap. Also: packet 07 now writes per-model-named summary files (`nested_thresholds_summary_<model>.json`); step 4 and the verification below account for that.

## Files
- Run-only. Artifacts under `nwsl-model/data/processed/models/<version>/`, holdout under `data/processed/season_holdout/`, report at `plans/2026-07-22-model-lab/LAB_REPORT.md`.

## Hard cautions
- NEVER pass `--build-dataset` to train.py.
- Fail closed: if any gate fails, that is a finding for the report, not a thing to tune away. Do not edit thresholds, gates, or config to force a pass.
- If a step crashes, capture the traceback in the report and continue with what exists; BLOCKED only if train or backtest cannot complete at all, OR if `market_residual` is absent from the backtest AND the holdout after one retry (see 2b/8b) — that is a core deliverable, not an optional one.

## Steps (cwd: nwsl-model/, in order)
1. `python3 scripts/train.py --config configs/default.yaml --version lab2026-07-22`
2. `python3 scripts/backtest.py --config configs/default.yaml --version lab2026-07-22 --models dixon_coles bivariate_poisson market_residual`
   (benchmarks incl. spi_lite_baseline join via config backtest.benchmarks; market_residual is the packet 08 candidate)
2b. **New: verify market_residual actually produced results before continuing.**
   ```bash
   python3 -c "
   import json
   m = json.load(open('data/processed/models/lab2026-07-22/backtest_summary.json'))['models']
   assert 'market_residual' in m, 'market_residual produced no folds in the rolling backtest'
   assert 'spi_lite_baseline' in m, 'spi_lite_baseline missing from backtest_summary'
   print('backtest candidates present:', sorted(m.keys()))"
   ```
   If this fails: read the runner logs for `Fold {id} failed for market_residual: <error>` (backtest.py prints/logs these), fix the ROOT CAUSE if it is a small, obvious issue in `src/models/market_residual.py` (e.g. a shape mismatch), re-run step 2, and re-check. If the failure is not quickly fixable, report it plainly as a concern in LAB_REPORT (do not silently proceed) and mark this packet DONE_WITH_CONCERNS, not DONE.
3. `python3 scripts/evaluate.py --artifact-root data/processed/models --version lab2026-07-22`
4. `python3 scripts/tune_betting_thresholds.py --artifact-root data/processed/models --version lab2026-07-22 --config configs/default.yaml --evidence-model spi_lite_baseline --models spi_lite_baseline dixon_coles bivariate_poisson market_residual`
   (writes `nested_thresholds_summary_<model>.json` for each requested model that has a decision log, plus the fixed-name copy for spi_lite_baseline; empty/missing decision logs degrade gracefully per packet 07's contract, they do not crash this step)
5. `python3 scripts/evaluate_totals_model.py --artifact-root data/processed/models --version lab2026-07-22 --model spi_lite_baseline --config configs/default.yaml`
6. Re-run evaluate so baseline gates see the OOS evidence written in steps 4-5:
   `python3 scripts/evaluate.py --artifact-root data/processed/models --version lab2026-07-22`
7. `python3 scripts/promote.py --artifact-root data/processed/models --version lab2026-07-22`
8. `python3 scripts/season_holdout.py --config configs/default.yaml --train-season 2025 --test-season 2026 --models spi_lite_baseline dixon_coles bivariate_poisson market_residual --output-dir data/processed/season_holdout/lab2026-07-22`
8b. **New: this script has NO per-model error isolation — if market_residual raises, the WHOLE holdout aborts and no model's ROI is written.** After step 8:
   ```bash
   python3 -c "
   import json, pathlib
   p = pathlib.Path('data/processed/season_holdout/lab2026-07-22/season_holdout_summary.json')
   assert p.exists(), 'season_holdout_summary.json missing — the holdout run aborted entirely'
   d = json.load(open(p))
   present = set(d.get('model_metrics', {}).keys())
   requested = {'spi_lite_baseline', 'dixon_coles', 'bivariate_poisson', 'market_residual'}
   missing = requested - present
   assert not missing, f'holdout missing models: {missing}'
   print('holdout models present:', sorted(present))"
   ```
   If step 8 itself crashed (summary file absent), re-run it EXCLUDING `market_residual` (`--models spi_lite_baseline dixon_coles bivariate_poisson`) so the three working models still produce holdout evidence, then note in LAB_REPORT that market_residual's holdout ROI is unavailable and why. This is a DONE_WITH_CONCERNS outcome, not silent proceeding.
9. `python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models --version lab2026-07-22`
10. Write `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/plans/2026-07-22-model-lab/LAB_REPORT.md` assembled from the JSON/CSV outputs (no invented numbers; cite file paths):
    - Data state: matches through date, close-odds coverage incl. June-July backfill result (read plans/.../odds_backfill_report.json).
    - Rolling validation table: per model log_loss_1x2, brier, and the OOF-calibrated effective metrics (from evaluation_summary.json), plus moneyline betting diagnostics. Explicitly confirm market_residual and spi_lite_baseline HAVE non-zero bet counts (this was previously silently broken; call it out as fixed).
    - Season holdout table (from season_holdout_summary.json): same metrics plus ML ROI per model. Note explicitly which models have holdout coverage per step 8b.
    - Nested threshold tuning: OOS curve summary, recommended thresholds, blocks tuned vs fallback, per model that has one (nested_thresholds_summary_<model>.json).
    - Totals model: report table + recommendation (totals_model_report.json).
    - Gates: full gate results for pure models AND the baseline gate (evaluation_summary.json gate_results, promotion_summary.json), including the `evidence_caveat` string packet 06 attaches, champions.json final state.
    - Verdict section: promote or reject the SPI-lite plus market-residual strategy, in plain language, with the two or three numbers that decide it, plus caveats (clv_vs_close_degenerate for market_residual, coverage gaps, OOF k-fold randomness note, the close-time/uncalibrated evidence-transfer caveat from packet 06).
11. Runtime expectation: train ~1-3 min, backtest tens of minutes with market_residual per-fold fits (LogisticRegression is fast; spi predictions per train row dominate). If backtest exceeds 90 minutes, note it and continue.

## Interface contract (produced)
- Version dir `lab2026-07-22` complete with backtest_summary.json (containing market_residual and spi_lite_baseline as real entries with bet counts), evaluation_summary.json, promotion_summary.json, betting_analysis/* (per-model nested threshold summaries + totals report), plus a holdout dir with model coverage confirmed, and LAB_REPORT.md. Consumers: packet 13 (serves predictions from this artifact), the end report, Zach.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 - <<'EOF'
import json, pathlib
v = pathlib.Path('data/processed/models/lab2026-07-22')
for f in ['backtest_summary.json', 'evaluation_summary.json', 'promotion_summary.json',
          'betting_analysis/nested_thresholds_summary.json', 'betting_analysis/totals_model_report.json']:
    assert (v/f).exists(), f'missing {f}'
bt = json.load(open(v/'backtest_summary.json'))['models']
assert 'market_residual' in bt, 'market_residual absent from backtest_summary — see step 2b'
assert 'spi_lite_baseline' in bt, 'spi_lite_baseline absent from backtest_summary'
hs = pathlib.Path('data/processed/season_holdout/lab2026-07-22/season_holdout_summary.json')
assert hs.exists(), 'season_holdout_summary.json missing — see step 8b'
assert pathlib.Path('../plans/2026-07-22-model-lab/LAB_REPORT.md').exists()
print('lab artifacts complete')
EOF
```
Expected: `lab artifacts complete`.

## Done-signal
End with exactly one line: `DONE: 11` / `DONE_WITH_CONCERNS: 11: <one line>` / `BLOCKED: 11: <one line>`.
