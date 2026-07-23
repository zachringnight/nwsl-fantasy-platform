# Packet 08: market-residual

## Objective
Build the market-residual layer: a fitted model that learns when model-vs-no-vig-market disagreement has historically carried signal, evaluable as a first-class backtest/holdout candidate named `market_residual`. This replaces guess-the-alpha blending with a fitted correction. Research candidate only: it enters no promotion path in this packet.

## REVISED (post-review, 2026-07-22): explicit dispatch wiring required

Adversarial review found the original wording ("dispatched in the baseline fold path") under-specified the actual code change needed, and that WITHOUT it `market_residual` raises `ValueError('Unknown model: market_residual')` in `_create_model` — a hard crash in `season_holdout.py` (no try/except there) and a silently-swallowed failure in the rolling backtest (`BacktestRunner.run` wraps each fold in try/except and just logs+continues). This packet now states the exact dispatch guard edit and depends on packet 04 having landed first, since it reuses the bet-settlement plumbing packet 04 adds to `_evaluate_baseline_fold`.

## Files
- Create: `nwsl-model/src/models/market_residual.py`
- Modify: `nwsl-model/src/backtest/runner.py` (new dispatch branch — packet 04 must be merged first)
- Modify: `nwsl-model/scripts/season_holdout.py` (add to DEFAULT_MODELS)
- Create: `nwsl-model/tests/test_market_residual.py`

## Context facts (verified against source, incorporating packet 04's changes)
- `runner.py` dispatch guard (post-packet-04) reads `if base_model in BASELINE_MODELS:` inside `_evaluate_fold`. You must change this to:
  ```python
  if base_model in BASELINE_MODELS or base_model in MARKET_MODELS:
      return self._evaluate_baseline_fold(
          base_model=base_model, train=train, test=test,
          context_provider=context_provider, ratings_model=ratings_model,
          model_name=model_name, fold=fold, staker=staker, odds=odds,
      )
  ```
  Add a new module-level set right after `BASELINE_MODELS` in runner.py: `MARKET_MODELS = {"market_residual"}`. Do **NOT** add `market_residual` to `BASELINE_MODELS` itself (gating.py's `BASELINE_MODELS` is a separate set used as the promotion bar for pure models; `market_residual` using close odds as an input must never become that bar).
- Inside `_evaluate_baseline_fold` (post-packet-04, now takes `fold, staker, odds` too), add a new `elif base_model == "market_residual":` branch parallel to the existing `elif base_model == "spi_lite_baseline":` branch. Build the base SPI-lite model exactly as that branch does (same `SpiLiteBaseline(ratings_model=ratings_model, max_goals=..., league_home_rate=max(train_home_npxg, 0.1), league_away_rate=max(train_away_npxg, 0.1), **spi_cfg keys)` construction — reuse the local `spi_cfg = self.config.get("spi_lite", {})` already computed in that function if present, or read it fresh), wrap it in `MarketResidualModel(base_model=spi_instance, **self.config.get("market_residual", {}))`, call `.fit(train, context_provider)` ONCE before the per-row test loop (not per row — fit uses the whole `train` frame).
- Per test row, after computing `contextual_features` (already computed once per row in the existing loop), branch: `market_probs = None; if all(pd.notna(row.get(c)) for c in ("mkt_prob_home","mkt_prob_draw","mkt_prob_away")): market_probs = (float(row["mkt_prob_home"]), float(row["mkt_prob_draw"]), float(row["mkt_prob_away"]))`. Call `pred = market_residual_model.predict_score_matrix(row["home_team"], row["away_team"], market_probs=market_probs, contextual_features=contextual_features)`; set `lambda_home, lambda_away, matrix = pred.lambda_home, pred.lambda_away, pred.score_matrix`, `probs_override = (pred.home_win_prob, pred.draw_prob, pred.away_win_prob)`.
- `mkt_prob_home/draw/away` are already present on `row` for every test row: `BacktestRunner.run()` calls `compute_market_probabilities(matches)` on the FULL matches frame (merged with close odds) before the fold splitter runs, so both `train` and `test` already carry these columns (NaN when no close odds exist for that match — handle via the `pd.notna` guard above, which naturally falls back through `MarketResidualModel`'s own fallback-to-base-model behavior).
- Model-name grammar: `_parse_model_spec` splits on `'__'`; the name `market_residual` contains no `__`, so it is safe and will not be misparsed as an ablation variant.
- Bet settlement, fold_id, main_total_* columns: all inherited for free once you're routed through `_evaluate_baseline_fold`'s (packet-04-fixed) shared per-row settlement call and `_prediction_row_from_markets`. Do not duplicate that logic.
- `sklearn` is a declared dependency (`scikit-learn>=1.3`): use `sklearn.linear_model.LogisticRegression`.
- Packet 01 added config `market_residual: {enabled, regularization_c: 1.0, min_train_matches: 60}`.
- `season_holdout.py` DEFAULT_MODELS (currently `[dixon_coles, bivariate_poisson, uniform_baseline, home_field_baseline, team_ratings_poisson, rolling_npxg_poisson, spi_lite_baseline]`) does NOT include `regularized_elo_baseline` today; add `market_residual` to it so `python scripts/season_holdout.py` with no `--models` flag includes it.
- Honest framing: the residual model uses close odds as an input and settles bets at close odds. That is a legitimate close-time strategy (the review panel confirmed this is not leakage — train only sees train-fold rows, test rows use their own close odds at predict time, same as every other close-time backtest candidate), but CLV vs close is degenerate by construction. Stamp metadata caveat `clv_vs_close_degenerate` in the model's `PredictionResult.metadata`.

## Design (src/models/market_residual.py)
`class MarketResidualModel`:
- `__init__(self, base_model, *, regularization_c=1.0, min_train_matches=60, max_goals=8)` where `base_model` duck-types `predict_score_matrix(home_team, away_team, home_advantage=None, contextual_features=None) -> PredictionResult` (a `SpiLiteBaseline` instance in practice).
- `fit(self, train_matches: pd.DataFrame, context_provider) -> self`: rows require `mkt_prob_home/draw/away` not NaN and final goals present. For each usable row, get base-model probs via `predict_score_matrix` using `context_provider.for_match(...)` for that row's contextual features (mirror the pattern in `_evaluate_baseline_fold`'s spi branch). Feature vector per match (6 dims): `[logit(p_mkt_home), logit(p_mkt_draw), logit(p_mkt_away), p_base_home - p_mkt_home, p_base_draw - p_mkt_draw, p_base_away - p_mkt_away]`, probs clipped to `[1e-4, 1-1e-4]` before logit. Target: outcome class from goals (home/draw/away). Fit `LogisticRegression(C=regularization_c, max_iter=1000)`. If usable rows `< min_train_matches`, set `self.fitted_ = False`.
- `predict_score_matrix(self, home_team, away_team, *, market_probs=None, contextual_features=None) -> PredictionResult`: when fitted AND `market_probs` given (tuple of 3 floats, no NaN): base pred via base_model -> feature vector -> residual class probs -> rescale base score matrix to those targets (write a small local helper `_rescale_matrix_to_targets(matrix, p_home, p_draw, p_away)` that scales the strictly-upper/diagonal/strictly-lower triangular regions of the score matrix to the target H/D/A masses and renormalizes — do not import MarketBlender's private methods, this is a standalone ~15-line helper) -> `PredictionResult` with `metadata={"model": "market_residual", "base": "spi_lite_baseline", "fallback": False, "clv_vs_close_degenerate": True}`. When not fitted or `market_probs` missing: return the base model's prediction unchanged with `metadata={"model": "market_residual", "base": "spi_lite_baseline", "fallback": True}`.

## Tests (test_market_residual.py, write FIRST)
1. Perfect-market synthetic: outcomes drawn from market probs, with a deliberately biased base model. Fitted residual probs must have lower log loss than the base model's raw probs on held-out rows.
2. Fallback: no `market_probs` -> returns base prediction, `metadata["fallback"] is True`; unfitted (too few training rows) -> same.
3. No-lookahead: `fit` only sees rows passed to it (assert coefficients are identical whether or not out-of-sample rows are mutated before/after the fit call).
4. Matrix consistency: output `score_matrix` sums to 1 and its H/D/A region sums equal the residual 1X2 probs within 1e-6.
5. Runner integration: tiny synthetic backtest config dict (follow `test_backtest_profitability.py` conventions, matches this packet's own test conventions) runs `market_residual` through `BacktestRunner(config).run(...)` end to end and asserts: (a) `'market_residual' in results` and its predictions frame is non-empty, (b) its decision_log is non-empty when odds/edges are set up to produce at least one candidate, (c) `predictions` rows carry `main_total_line` when total odds are present in the fixture (inherited from packet 04's fix — this is a regression guard that the dispatch wiring didn't bypass it).

## Interface contract (produced)
- Candidate name `market_residual` is valid in `--models` for `scripts/backtest.py` and `scripts/season_holdout.py`, dispatches without raising, and (via packet 04's settlement fix) produces `decision_log_market_residual.csv` / `bet_log_market_residual.csv` / `predictions_market_residual.csv` with `main_total_*` columns and `fold_id`. Consumers: packet 11 (runs it in backtest + holdout), LAB_REPORT.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_market_residual.py tests/test_backtest_profitability.py tests/test_season_holdout.py -q
```
Expected: 0 failures. Additionally, sanity-run the actual dispatch once (not full backtest, just confirm no ValueError):
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -c "
from src.backtest.runner import resolve_models_to_run, BASELINE_MODELS, MARKET_MODELS
assert 'market_residual' in MARKET_MODELS
assert 'market_residual' not in BASELINE_MODELS
print('dispatch sets ok')"
```

## Done-signal
End with exactly one line: `DONE: 08` / `DONE_WITH_CONCERNS: 08: <one line>` / `BLOCKED: 08: <one line>`.
