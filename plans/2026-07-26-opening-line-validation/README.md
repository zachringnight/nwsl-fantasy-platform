# NWSL Opening-Line Validation (2026-07-26)

Status: opening-line implementation complete; ML remains unpromoted. A
separate totals-over policy is ready for capped forward use, not full
promotion.

This workstream closes a model-lab evidence gap: `odds.csv` already contained
opening and closing prices, but the backtest evaluated only closing prices, so
every CLV observation was structurally zero.

## What changed

- Added `backtest.odds_source_type` with a fail-safe default of `close`.
- Added `--odds-source-type {close,open}` to rolling and season-holdout CLIs.
- Kept opening research in separate output directories and artifact filenames,
  so it cannot overwrite close-line promotion evidence.
- Paired opening candidates only with the same match, market, sportsbook,
  side, and total line at the close.
- Left unmatched CLV missing instead of coercing it to zero.
- Fixed threshold analysis so rows rejected by fixed structural rules cannot
  re-enter an edge/confidence grid search.
- Versioned threshold eligibility as `structural_rules_v1`; the baseline
  promotion gate now rejects old/unfiltered evidence and non-close evidence.

## Evidence

Data state was unchanged from the completed lab: 301 regulation matches in the
rolling backtest, with model predictions on 251 validation matches. Opening
moneyline coverage was 211/251 (84.1%); opening totals coverage was 218/251
(86.9%).

### Rolling backtest at opening prices

These are the existing selection rules, settled at opening prices. Positive
ROI here is diagnostic only; the nested result below is the stronger test.

| Model | Bets | ROI | Mean CLV | Positive CLV |
|---|---:|---:|---:|---:|
| home_field_baseline | 35 | +28.9% | +0.61% | 37.1% |
| spi_lite_baseline | 32 | -1.8% | +1.26% | 43.8% |
| bivariate_poisson | 47 | -2.0% | +0.10% | 44.7% |
| dixon_coles | 47 | -4.0% | -0.11% | 44.7% |
| market_residual | 35 | -20.0% | -0.83% | 34.3% |
| team_ratings_poisson | 44 | -26.2% | -0.24% | 43.2% |

The home-field result does not have confirming CLV: its median CLV was -3.23%
and only 37.1% of bets beat the close. Treat the profit as outcome variance,
not a line-reading edge.

### Nested chronological opening-line moneyline tuning

This is the corrected run after fixed market constraints were kept in force.
Thresholds were selected on strictly prior blocks and applied to the next
block. Every model was negative.

| Model | OOS bets | OOS ROI | Tuned/fallback blocks | Final edge/confidence |
|---|---:|---:|---:|---:|
| home_field_baseline | 59 | -2.6% | 80 / 7 | 0.01 / 0.05 |
| bivariate_poisson | 76 | -11.8% | 80 / 7 | 0.02 / 0.05 |
| spi_lite_baseline | 46 | -13.1% | 81 / 6 | 0.08 / 0.03 |
| dixon_coles | 74 | -18.5% | 79 / 8 | 0.03 / 0.03 |
| team_ratings_poisson | 39 | -24.7% | 80 / 7 | 0.10 / 0.10 |
| market_residual | 32 | -49.2% | 81 / 6 | 0.08 / 0.05 |

An initial unfiltered run appeared to show SPI-lite at +19.7% over 59 bets.
That was a false positive: threshold preparation admitted candidates already
rejected by fixed price/side/probability-edge rules. The regression is now
covered by tests and the incompatible evidence schema cannot pass promotion.

### 2025 train to 2026 holdout at opening prices

| Model | Bets | ROI | Mean CLV | Positive CLV |
|---|---:|---:|---:|---:|
| dixon_coles | 25 | +43.2% | +4.83% | 52.0% |
| home_field_baseline | 24 | +37.3% | -2.50% | 25.0% |
| bivariate_poisson | 26 | +33.6% | +5.96% | 57.7% |
| spi_lite_baseline | 16 | -44.9% | +2.85% | 50.0% |

The two pure score models remain research candidates: their single-season
holdout is positive, but their multi-block rolling evidence is negative and
the samples are only 25-26 bets. The home-field holdout again fails the CLV
cross-check.

### Corrected close-line threshold evidence

Re-running the July 22 decision logs with `structural_rules_v1` changed the
SPI-lite close-line estimate from -12.4% over 132 rows to +3.0% over 65
eligible OOS bets. That is below the existing +5% promotion threshold. The
OOF-strongest baseline for the lab was `team_ratings_poisson`, whose corrected
close-line result is -25.1% over 151 bets. The no-promotion verdict is
unchanged.

## Verdict

Keep moneyline and the global champion registry fail-closed. No ML candidate
is stable across rolling and season-holdout evidence, and the default serving
configuration remains unchanged.

The totals follow-up below supports one isolated exception:
`nwsl-totals-open-over-v1` may run at a 0.25%-of-bankroll cap under its exact
model, side, and quote contract. That is capped forward use, not full
promotion.

## Frozen 2025 to 2026 totals-over follow-up

The earlier nested result adapted thresholds during 2026. The stricter test
selected one threshold pair using 2025 only and then held it fixed for all
2026 rows:

| Policy | Frozen edge/confidence | 2025 train | 2026 test | Test ROI | Mean CLV |
|---|---:|---:|---:|---:|---:|
| team-ratings total over | 0.02 / 0.03 | 26 | 30 | +35.6% | +4.61% |

Additional checks:

- Match-cluster bootstrap 95% ROI interval: +4.53% to +63.82%.
- Match-cluster bootstrap 95% mean-CLV interval: +2.94% to +6.40%.
- All 35 threshold-grid cells with at least eight training and test bets had
  positive 2026 ROI and mean CLV.
- Naive always-over returned +4.23% in 2026 and -16.31% in 2025; the frozen
  selector added +31.39 percentage points of 2026 ROI.
- Every selected row is one unique match, structurally eligible, an over, and
  an OddsPortal average opening quote.

The exported evidence status is `ready_for_capped_forward_use`. By owner
decision on 2026-07-26, there is no separate full-promotion decision quota or
positive-ROI/CLV gate. Forward ROI and like-for-like CLV remain monitored
evidence, while pick-level and source-health safeguards continue to fail
closed.

## Current operational proof

The July 26 refresh now has:

- 313 completed matches, including 124 in 2026 through July 25;
- 313/313 completed matches with player appearances;
- 116/116 remaining fixtures with fresh projected-lineup joins;
- 99.68% effective match xG coverage;
- five current FOX totals markets fetched in 24 seconds, with 15 unpriced
  event pages isolated as missing markets instead of aborting the run.

The fresh `20260726T184332Z` policy artifact evaluated 22 fixtures in the next
14 days. Five had current totals prices and zero cleared the frozen thresholds.
That no-bet slate was persisted to the forward decision log.

## Reproduction

Run from `nwsl-model/`:

```bash
python3 scripts/backtest.py \
  --config configs/default.yaml \
  --models home_field_baseline team_ratings_poisson spi_lite_baseline \
    market_residual dixon_coles bivariate_poisson \
  --odds-source-type open \
  --output-dir data/processed/research/opening-line-2026-07-26

python3 scripts/season_holdout.py \
  --config configs/default.yaml \
  --train-season 2025 \
  --test-season 2026 \
  --models home_field_baseline spi_lite_baseline dixon_coles bivariate_poisson \
  --odds-source-type open \
  --output-dir data/processed/research/opening-line-holdout-2025-to-2026

python3 scripts/tune_betting_thresholds.py \
  --artifact-root data/processed/models \
  --version lab2026-07-22 \
  --backtest-dir data/processed/research/opening-line-2026-07-26 \
  --output-dir data/processed/research/opening-line-2026-07-26/nested-tuning-filtered \
  --models home_field_baseline team_ratings_poisson spi_lite_baseline \
    market_residual dixon_coles bivariate_poisson \
  --evidence-model spi_lite_baseline

python3 scripts/validate_frozen_policy.py \
  --backtest-dir data/processed/research/opening-line-2026-07-26 \
  --model team_ratings_poisson \
  --policy-id nwsl-totals-open-over-v1 \
  --train-season 2025 \
  --test-season 2026 \
  --output-dir data/processed/research/opening-line-2026-07-26/frozen-policy
```

Generated research artifacts are intentionally gitignored. This report is the
durable summary.

## Verification

- `python3 -m pytest`: 381 passed.
- Ruff on every changed Python file: passed.
- `git diff --check`: passed.
- `bash -n scripts/track_matchday_cron.sh`: passed.
- Operational feature refresh: `status=ready`, 313/313 appearance coverage,
  116/116 projected-lineup coverage.
- Current policy slate: five priced matches, zero actionable, all rejections
  explained by the frozen edge/confidence gates.
- Both regenerated nested summaries report
  `candidate_eligibility=structural_rules_v1`; the opening summary records
  `odds_source_types=["open"]` and the corrected close summary records
  `odds_source_types=["close"]`.

Repository-wide Ruff still reports legacy findings outside this change. No
unrelated lint cleanup was folded into the model workstream.

## Next model step

Do not retune `nwsl-totals-open-over-v1`. Accumulate 20 more locked live
decisions, materialize their closing prices, and require positive forward ROI
and mean CLV before removing the 0.25% stake cap or entering the global
promotion path. ML remains research-only.

The fresh serving artifact contains ratings for all 16 current teams, including
both 2026 expansion clubs. The frozen 2025-only season-holdout warnings remain
expected for that deliberately preseason test.
