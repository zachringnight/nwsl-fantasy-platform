# Packet 09: totals-market-model

## Objective
Rebuild totals as a separate calibrated market-line model instead of raw score-matrix totals: a fitted binary model of P(over main total line) that takes the market line as an input, evaluated chronologically. Totals remain suppressed for picks (config untouched); this packet produces the model and its evidence tooling only.

## Files
- Create: `nwsl-model/src/models/totals_market_model.py`
- Create: `nwsl-model/scripts/evaluate_totals_model.py`
- Create: `nwsl-model/tests/test_totals_market_model.py`

## REVISED (post-review, 2026-07-22)
Review found `predictions_spi_lite_baseline.csv` is missing `main_total_line`/`main_total_over_market_odds`/`main_total_under_market_odds`/`prob_over_main_total` today, because the baseline prediction-row builder (`_prediction_row_from_markets`) never added that block — only the pure-model path did. **Packet 04 fixes this** (adds the identical `main_total_*` block to the baseline path). This packet depends on packet 04 having landed; do not start until it has. As a safety net, still guard: if `main_total_line` is absent or entirely null on the input predictions file, this packet's script should report `n_evaluated=0` and `recommendation='keep_suppressed'` rather than crashing (belt-and-suspenders in case a different model is passed via `--model`).

## Context facts (verified)
- Known bias: both DC and BP underprice overs (mean predicted over prob 0.463 vs actual over rate 0.531, n=32 at launch diagnostics); spi_lite's independent-Poisson matrix has no dispersion parameter, so its total-goals variance is exactly lambda_home+lambda_away.
- Backtest predictions files carry everything needed per row (once packet 04 lands, for ALL models including baselines): `lambda_home, lambda_away, total_goals` (actual), `main_total_line`, `prob_over_main_total`, `main_total_over_market_odds`, `main_total_under_market_odds`, `match_date`, plus prob_over_{1.5,2.5,3.5,4.5}. Location: `<version_dir>/backtest/predictions_<model>.csv`.
- No-vig for two-way markets: multiplicative devig of [1/over_odds, 1/under_odds] (same convention as `_devig` in recommendations.py; implement locally for the frame, do not import the private).
- sklearn available: LogisticRegression. Config from packet 01: `totals_model: {enabled, regularization_c: 1.0, min_train_matches: 60}`.
- Chronological convention: expanding walk-forward, train strictly before test (mirror ExpandingWindowSplitter semantics; here operate on the predictions frame sorted by match_date, no slate splitting subtleties needed beyond grouping by date).

## Design (src/models/totals_market_model.py)
`class TotalsMarketModel`:
- `__init__(*, regularization_c=1.0, min_train_matches=60)`
- `fit(frame: pd.DataFrame) -> self`: usable rows = main_total_line notna, total_goals notna, total_goals != main_total_line (drop pushes), lambda_home/away notna. Features (5): [main_total_line, lambda_home + lambda_away, (lambda_home + lambda_away) - main_total_line, logit(clip(prob_over_main_total)), logit(clip(mkt_prob_over)) when odds present else logit(0.5) with an indicator feature has_market in place of a 6th]. Target: total_goals > main_total_line. LogisticRegression(C=regularization_c, max_iter=1000). fitted_=False under min_train_matches.
- `predict_prob_over(frame) -> pd.Series` aligned to frame.index (NaN where line missing; base prob passthrough `prob_over_main_total` when not fitted).
- `walk_forward_evaluate(frame, *, block='match_date') -> pd.DataFrame`: expanding refit per date block (train = strictly earlier rows), returning per-row model prob, base prob, market no-vig prob, outcome.

## Script (scripts/evaluate_totals_model.py)
CLI: `--artifact-root data/processed/models --version <default latest> --model spi_lite_baseline --config configs/default.yaml`. Loads `<version_dir>/backtest/predictions_<model>.csv`, runs walk_forward_evaluate, writes `<version_dir>/betting_analysis/totals_model_report.json`:
{version, model, n_evaluated, metrics: {model: {log_loss, brier, ece_10bin, mean_prob_over, actual_over_rate}, base_raw: {...same...}, market_novig: {...same, where available...}}, bias: {model_bias_direction, base_bias_direction}, recommendation: 'candidate_for_recalibrated_leans' | 'keep_suppressed'} where recommendation is 'candidate_for_recalibrated_leans' only if model log_loss < base log_loss AND model ece_10bin <= 0.06 AND n_evaluated >= 60. Print a compact table.

## Tests (write FIRST)
1. Synthetic where true P(over) depends on line and lambdas with a market that is well calibrated: walk-forward model beats the deliberately biased base prob on log loss.
2. Push rows (total_goals == line) are excluded from fit and metrics.
3. No-lookahead: per-row prediction for date d is unchanged when all rows after d are mutated.
4. Fallback: under min_train_matches, predict_prob_over returns base probs unchanged.
5. Report shape: recommendation logic hits both branches on constructed inputs.
6. Missing-column guard: script invoked on a predictions file with no `main_total_line` column (or all-null) produces `n_evaluated=0, recommendation='keep_suppressed'` without raising.

## Interface contract (produced)
- `<version_dir>/betting_analysis/totals_model_report.json` as above. Consumers: packet 11 (runs it, cites in LAB_REPORT). No pipeline consumer flips totals on; `betting.market_rules.totals.official_picks_enabled` stays false and this packet does not touch config.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_totals_market_model.py -q
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 09` / `DONE_WITH_CONCERNS: 09: <one line>` / `BLOCKED: 09: <one line>`.
