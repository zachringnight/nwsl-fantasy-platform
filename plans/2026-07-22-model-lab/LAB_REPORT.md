# NWSL Model Lab: Evidence Report (2026-07-22)

Artifact version: `lab2026-07-22`. All numbers below are read directly from the JSON/CSV outputs of this run; file paths are given so every figure can be traced back to source. Working tree is `nwsl-model/` unless stated otherwise.

## 0. Run log (this packet's steps, in order)

| step | command | result |
|---|---|---|
| 1 | `train.py --version lab2026-07-22` | dixon_coles and bivariate_poisson both converged (`grad_norm` 0.516 / 0.284) |
| 2 | `backtest.py --models dixon_coles bivariate_poisson market_residual` | completed, exit 0, **zero** `Fold N failed for <model>` lines in the run log |
| 2b | verify `market_residual` + `spi_lite_baseline` present in `backtest_summary.json` | passed: `['bivariate_poisson', 'dixon_coles', 'home_field_baseline', 'market_residual', 'rolling_npxg_poisson', 'spi_lite_baseline', 'team_ratings_poisson', 'uniform_baseline']` |
| 3 | `evaluate.py` (first pass) | completed |
| 4 | `tune_betting_thresholds.py --evidence-model spi_lite_baseline --models spi_lite_baseline dixon_coles bivariate_poisson market_residual` | wrote 4 per-model nested-threshold summaries + the evidence-model fixed-name copy |
| 5 | `evaluate_totals_model.py --model spi_lite_baseline` | `recommendation=keep_suppressed` |
| 6 | `evaluate.py` (second pass, picks up steps 4-5 OOS evidence) | completed |
| 7 | `promote.py` | champion registry updated; no promotions |
| 8 | `season_holdout.py --train-season 2025 --test-season 2026 --models spi_lite_baseline dixon_coles bivariate_poisson market_residual` | completed, exit 0 |
| 8b | verify all 4 models present in `season_holdout_summary.json` | passed: `['bivariate_poisson', 'dixon_coles', 'market_residual', 'spi_lite_baseline']` |
| 9 | `audit_model_inputs.py` | 2 HIGH, 1 MEDIUM issue (see §1) |

**The bet-settlement bug this lab specifically re-checks (baseline models never settling bets in `_evaluate_baseline_fold`) is confirmed fixed.** Both `spi_lite_baseline` (40 bets, rolling backtest) and `market_residual` (29 bets, rolling backtest) now have real, non-zero bet counts — previously this path silently produced zero bets for every baseline-family model. See §2 for full counts.

## 1. Data state

Source: `data/processed/models/lab2026-07-22/dataset_manifest.json`, `data/processed/models/lab2026-07-22/audit/model_input_audit.md`, `plans/2026-07-22-model-lab/odds_backfill_report.json`.

- Completed matches: 308 rows (301 regular-season after filtering 7 non-regulation), date range **2025-03-15 to 2026-07-19**, covering seasons 2025 (189 matches) and 2026 (119 matches).
- Upcoming/fixtures: 121 rows, 2026-07-25 to 2026-11-01.
- Odds: 1,369 rows across 5 sportsbooks (OddsPortalAvg, OddsPortalEvent, FootyStats, FoxSports, DraftKings), latest timestamp 2026-07-19T23:00:00Z.
- **June/July close-odds backfill (packet 10, already run, non-Apify direct HTTP mode):**
  - Before: June/July 2026 1X2 close coverage = 0.0% (34 matches with no close line).
  - After: June/July 2026 1X2 close coverage = **100.0%** (34/34 matches), +103 new close rows, 7 unmatched.
  - Overall close coverage moved from 79.87%→90.91% (1X2) and 79.22%→89.61% (totals).
  - `fetch_mode: "direct"` — the no-token HTTP path worked as designed; no Apify actor calls were made.
- Remaining coverage gaps flagged by `audit_model_inputs.py` (HIGH/MEDIUM, not just June/July):
  - **[HIGH]** 2025 1X2 close coverage is still incomplete: 162/189 matches (85.71%), 62 matches missing close 1X2 league-wide.
  - **[MEDIUM]** Historical totals close coverage incomplete (79.22% pre-backfill baseline in the audit's own snapshot; totals backfill also ran but general historical totals gaps remain, primarily pre-2026).
  - **[HIGH]** Projected lineups are stale/synthetic for completed matches (latest projected-lineup report is 57 days old for the completed-match slice; upcoming fixtures are current).

## 2. Rolling validation (`backtest_summary.json`, `evaluation_summary.json`)

Source: `data/processed/models/lab2026-07-22/backtest_summary.json`, `.../evaluation_summary.json`.

| model | log_loss_1x2 (raw) | brier_1x2 (raw) | effective (OOF-calibrated) log_loss | n_bets | total_pnl | ROI | hit_rate |
|---|---|---|---|---|---|---|---|
| uniform_baseline | 1.0986 | 0.6667 | — | 0 | — | — | — |
| home_field_baseline | 1.0852 | 0.6569 | 1.0767 | 41 | +216.79 | **+5.70%** | 34.1% |
| team_ratings_poisson | 1.0508 | 0.6323 | **1.0527** | 47 | -1053.71 | -23.82% | 29.8% |
| rolling_npxg_poisson | 1.0701 | 0.6461 | 1.0639 | 45 | -1548.76 | -37.80% | 22.2% |
| **spi_lite_baseline** | 1.0463 | 0.6290 | 1.0601 | **40** | -1018.91 | -26.89% | 27.5% |
| **market_residual** | 1.0480 | 0.6298 | 1.0576 | **29** | -470.60 | -18.57% | 31.0% |
| dixon_coles (pure) | 1.0808 | 0.6521 | 1.0763 | 51 | -1023.16 | -20.43% | 31.4% |
| bivariate_poisson (pure) | 1.0874 | 0.6553 | 1.0696 | 55 | -1115.59 | -21.67% | 30.9% |

**Confirmed: `spi_lite_baseline` and `market_residual` both have non-zero bet counts in the rolling backtest (40 and 29 respectively).** This was previously silently broken (baseline-family models never called `_generate_and_settle_bets`); packet 04's fix is verified working here.

On raw log loss / brier, `spi_lite_baseline` is the best baseline this round; on the OOF-calibrated ("effective") metric used by the promotion gate, `team_ratings_poisson` edges it out (1.0527 vs 1.0601) — see §5 for why this matters to the baseline gate.

Every rolling-backtest model, including `market_residual` and `spi_lite_baseline`, lost money on flat-stake ROI over this window except `home_field_baseline` (+5.70%, 41 bets).

## 3. Season holdout: train=2025, test=2026 (`season_holdout_summary.json`)

Source: `data/processed/season_holdout/lab2026-07-22/season_holdout_summary.json`, `season_holdout_metadata.json`. Train: 182 matches (2025-03-15 to 2025-11-02). Test: 119 matches (2026-03-14 to 2026-07-19).

| model | log_loss_1x2 | brier_1x2 | n_bets | total_pnl | ROI | hit_rate |
|---|---|---|---|---|---|---|
| spi_lite_baseline | 1.0213 | 0.6127 | 9 | -30.43 | -3.50% | 33.3% |
| dixon_coles | 1.0338 | 0.6197 | 16 | +792.72 | **+50.70%** | 56.3% |
| bivariate_poisson | 1.0441 | 0.6253 | 17 | +326.26 | +20.27% | 47.1% |
| market_residual | 1.0239 | 0.6127 | **2** | -188.11 | -100.00% | 0.0% |

**All 4 requested models have holdout coverage** — the no-error-isolation risk flagged in the packet review (step 8b) did not materialize; `season_holdout.py` ran to completion with `market_residual` included and exit code 0.

Caveats on this table:
- `market_residual`'s holdout sample is only **2 bets** — both losers, hence -100% ROI. This is not a statistically meaningful signal in either direction; the low bet count is itself informative (the fitted residual layer rarely disagreed with the market enough to clear its own edge/confidence thresholds on 2026 holdout data), not a sign the model is broken.
- `dixon_coles` and `bivariate_poisson` show large positive holdout ROI (+50.7%, +20.3%) driven almost entirely by the `moneyline_home` side (dixon_coles: 10 bets, +68.4% ROI, 60% hit rate) on a 119-match, single-season holdout window — a small out-of-sample slice, not independent confirmation across multiple seasons.
- Per `src/models/market_residual.py`'s own documented caveat, `market_residual`'s `metadata["clv_vs_close_degenerate"]` is `True`: it settles bets at close odds using close odds as an input feature, which is legitimate (it never sees test-fold rows during fit) but makes CLV-vs-close mechanically ~0 by construction — not usable as a CLV signal for this model.
- Totals bets are 0 across all 4 models in the holdout (all `totals_official_pick_count = 0`, gated off by `lean_market_official_picks_disabled`) — consistent with totals staying suppressed (§5, §6).

## 4. Nested chronological threshold tuning (`betting_analysis/nested_thresholds_summary_<model>.json`)

Source: per-model files in `data/processed/models/lab2026-07-22/betting_analysis/`. Thresholds tuned strictly on prior folds only, evaluated on later folds (`n_blocks=87` total decision blocks each; `min_bets_per_cell=8`, `min_history_bets=30`, `rank_metric=roi_units`).

| model | market | OOS n_bets | OOS ROI (units) | blocks tuned | blocks fallback | recommended min_edge | recommended min_confidence |
|---|---|---|---|---|---|---|---|
| spi_lite_baseline | moneyline | 132 | -12.39% | 85 | 2 | 0.02 | 0.15 |
| spi_lite_baseline | totals | 104 | +0.005% | 80 | 7 | 0.00 | 0.00 |
| dixon_coles | moneyline | 200 | -20.69% | 85 | 2 | 0.00 | 0.10 |
| dixon_coles | totals | 122 | -15.85% | 80 | 7 | 0.02 | 0.00 |
| bivariate_poisson | moneyline | 204 | -8.15% | 85 | 2 | 0.01 | 0.10 |
| bivariate_poisson | totals | 124 | -14.60% | 80 | 7 | 0.10 | 0.03 |
| market_residual | moneyline | 110 | -18.08% | 85 | 2 | 0.10 | 0.10 |
| market_residual | totals | 110 | -11.98% | 80 | 7 | 0.00 | 0.00 |

Every model/market combination produced a real, negative-or-near-zero OOS ROI under nested tuning — no candidate shows OOS ROI that clears the baseline gate's own 5%-units threshold (`BASELINE_OOS_THRESHOLDS.min_roi_units = 0.05`; `src/utils/gating.py`) except spi_lite totals, which is a rounding-noise +0.005%, not a real edge.

Shared caveats (from each summary's own `metadata.caveats`, restated here per the packet instructions):
- Decision-log probabilities feeding this tuning are **uncalibrated** (no OOF isotonic/Platt calibration applied at decision-log generation time).
- `gating_status` is hardcoded to `"passed"` in backtest candidate generation for this purpose; live promotion gating is not reflected in these numbers.
- Odds coverage used here is close-line only — no current/live-line sensitivity captured.

## 5. Totals market model (`betting_analysis/totals_model_report.json`)

Source: `data/processed/models/lab2026-07-22/betting_analysis/totals_model_report.json`, evaluated against `spi_lite_baseline` on 223 matches.

| candidate | n | log_loss | brier | ECE (10-bin) | mean P(over) | actual over rate |
|---|---|---|---|---|---|---|
| model (spi_lite_baseline-derived) | 223 | 0.7103 | 0.2583 | 0.0716 | 0.4732 | 0.5112 |
| base_raw | 223 | 0.7024 | 0.2542 | 0.0551 | 0.4826 | 0.5112 |
| market_novig | 223 | 0.6996 | 0.2532 | 0.0936 | 0.5123 | 0.5112 |

**Recommendation: `keep_suppressed`.** The no-vig market price (`market_novig`) beats the model on both log loss and brier; the model does not add calibrated signal over the market for totals. This matches the standing config posture (`betting.markets.totals.official_picks_enabled: false`), so no action is required and none was taken — totals stays suppressed as designed.

## 6. Gates and promotion state

Source: `data/processed/models/lab2026-07-22/promotion_summary.json`, `evaluation_summary.json`, `champions.json`.

### Pure models (dixon_coles, bivariate_poisson)

Both fail the `beats_best_baseline_log_loss` / `beats_best_baseline_brier` / `total_goals_mae_ok` / `slice_stability_ok` checks against `spi_lite_baseline` (the current best baseline on those raw metrics):

| model | gating_status | beats_baseline_log_loss | beats_baseline_brier | total_goals_mae_ok | classwise_ece_ok | totals_ece_ok | totals_brier_ok | slice_stability_ok |
|---|---|---|---|---|---|---|---|---|
| dixon_coles | research_only | false | false | false | true | false | false | false |
| bivariate_poisson | research_only | false | false | false | true | false | false | false |

Both fail every per-slice log-loss ratio comparison against `spi_lite_baseline` (`slice_comparisons`, e.g. dixon_coles `later_season` ratio 1.038, `high_confidence` ratio 1.073 — both `passed: false` against the `max_slice_regression = 1.10` threshold's implied per-slice pass criterion as computed by the gate). Neither is promoted.

### Baseline gate (spi_lite_baseline candidacy — packet 06's first-class promotion path)

`promotion_summary.json.baseline_gate_result`:

```
model: team_ratings_poisson   <- NOT spi_lite_baseline; see note below
passed: false
gating_status: research_only
evidence_missing: false
evidence_caveat: "OOS ROI measured on close-time, uncalibrated backtest odds; live picks run on
  current, calibrated odds and current gating — this evidence does not directly transfer"
checks:
  evidence_present: true
  season_coverage_ok: true
  classwise_ece_ok: false
  posthoc_calibration_available: true
  is_strongest_baseline: false        <- fails here
  oos_n_blocks_tuned_ok: true
  oos_n_bets_ok: true
  oos_roi_ok: false                   <- and here
metrics.oos_moneyline: {n_blocks_tuned: 85, n_bets: 132, roi_units: -0.1239}
```

**Why the gate evaluated `team_ratings_poisson` instead of `spi_lite_baseline`:** the baseline gate always evaluates the model that is currently strongest by OOF-calibrated ("effective") log loss (`_best_baseline_by_effective_log_loss` in `src/utils/gating.py`), not a fixed name. This round, `team_ratings_poisson`'s OOF-calibrated log loss (1.0527) came in marginally better than `spi_lite_baseline`'s (1.0601) — see §2 — even though `spi_lite_baseline` wins on the raw (non-OOF) metric. Because the nested-threshold OOS evidence in step 4 was generated with `--evidence-model spi_lite_baseline`, the gate correctly flags `is_strongest_baseline: false` and fails closed rather than crediting `spi_lite_baseline`'s OOS evidence to a different model. This is the gate working as designed (see `_best_baseline_by_effective_log_loss`'s own docstring: "the honest comparison is the out-of-fold estimate, not the raw backtest number"), not a bug — but it also means this run produced no baseline-gate evidence for whichever model is "the" baseline going into the next round, because OOF-calibration is reshuffled per run (k-fold randomness), so which baseline model is "strongest" can flip between runs of the same pipeline on the same data. This is exactly the "OOF k-fold randomness" caveat called out in the packet's task index.

Independent of the naming mismatch, the gate also fails on its own numeric evidence: `oos_roi_ok: false` (OOS moneyline ROI -12.39%, threshold requires ≥ +5% units) and `classwise_ece_ok: false`. Even if the evidence-model naming issue were resolved (e.g. by re-running nested tuning with `--evidence-model team_ratings_poisson`), the ROI evidence itself does not clear the bar this round.

### Champion registry

`champions.json` after `promote.py`:
```json
{"aliases": {}, "experimental": {}}
```
No aliases, no promotions. Both pure models remain `research_only`; the baseline gate did not pass. This matches the fail-closed hard constraint — nothing was promoted by fiat.

## 7. Verdict: reject promotion this round (fail closed, as designed)

**The SPI-lite + market-residual strategy is not promoted this round. Slate stays fail-closed.** The two or three numbers that decide it:

1. **Bet-settlement is now real** (fixed from zero): `spi_lite_baseline` = 40 rolling-backtest bets / -26.9% ROI, `market_residual` = 29 rolling-backtest bets / -18.6% ROI, 2 holdout bets / -100% ROI. This closes the packet's headline concern (silent zero-bet baselines) but the resulting evidence is negative, not positive.
2. **Nested OOS threshold tuning found no model/market combination that clears the baseline gate's own +5%-units ROI bar** — best case was `spi_lite_baseline` totals at +0.005% (noise), everything else negative, moneyline worst-case -20.7% (dixon_coles).
3. **The baseline gate itself fails on both grounds**: (a) evidence-model mismatch — `team_ratings_poisson`, not `spi_lite_baseline`, is this round's OOF-strongest baseline, so the OOS evidence collected for `spi_lite_baseline` doesn't credit toward gate passage, and (b) even setting that aside, OOS ROI (-12.4%) and classwise ECE both fail their own thresholds.
4. **Totals model recommendation is `keep_suppressed`**: the no-vig market beats the model on both log loss and brier for totals; no case to promote.
5. **Pure models (`dixon_coles`, `bivariate_poisson`) remain `research_only`**: both lose to `spi_lite_baseline` on raw log loss/brier and fail every per-slice stability check.

Caveats that qualify every number above and should travel with this verdict:
- `clv_vs_close_degenerate` for `market_residual` (§3) — its CLV metric is structurally ~0 and uninformative by the model's own design, not a data problem.
- Coverage gaps remain: 2025 1X2 close odds still 85.71% (not 100%), projected lineups for completed matches are 57 days stale (§1). June/July 2026 close-odds coverage is now 100% thanks to packet 10's backfill, so the newest data is the most reliable, not the least.
- OOF-calibration k-fold randomness means "the strongest baseline" is not a stable label run-to-run (§6) — this makes any single-run baseline-gate pass or fail somewhat noisy at the margin; a persistent multi-run pattern would be stronger evidence than this one snapshot.
- The evidence-transfer caveat attached to every baseline-gate result regardless of pass/fail: OOS ROI is measured on close-time, uncalibrated backtest odds, while live picks run on current, calibrated odds under current gating — this evidence does not directly transfer to live performance even when it does pass.
- Season holdout is a single 2025-train/2026-test split (119 test matches) — not multiple independent holdout windows, and `market_residual`'s holdout n=2 is too small to read directionally at all.

**Net: fail-closed is the correct and actual end state.** No thresholds, gates, or config were edited to force a different outcome, consistent with the packet's hard constraints. `no_bet` / suppressed remains the operative state for totals, for the baseline candidacy, and for both pure models.
