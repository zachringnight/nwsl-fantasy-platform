# NWSL Betting Model

A joint 90-minute score-prediction framework for NWSL sides and totals markets. Every market (1X2, Asian handicap, totals, BTTS) derives from one score matrix per match, not separate models per market.

Run everything in this package from `nwsl-model/` (pytest's `pythonpath = ["."]` and `data.official_matches_dir` in configs are cwd-relative).

## Package map

```
scripts/     # CLI entry points (one script per pipeline stage)
src/
  data/      # Schemas, loaders, validation, transforms, dataset_builder
  features/  # Match, schedule, lineup, market, ASA/xG features
  models/    # base, dixon_coles, bivariate_poisson, spi_lite, market_residual,
             # totals_market_model, market_blend, calibration, team_ratings
  betting/   # score_matrix, market_derivation, recommendations, staking, clv
  backtest/  # splitter, runner, threshold_tuning, metrics, reports
  odds/      # api_football shadow, foxsports, historical imports, freshness/quality
  utils/     # artifacts, gating, dates, io
api/         # FastAPI prediction server (api/main.py, api/deps.py)
tests/       # pytest suite (396 tests at the 2026-07-26 publishing checkpoint)
configs/default.yaml   # single source of truth for all parameters
```

## Pipeline stages

### 1. Data refresh
```bash
# ESPN results + fixtures (repo root, TS)
cd .. && npx tsx scripts/fetch-espn-nwsl.ts && npx tsx scripts/generate-model-input.ts

# Official appearances, ASA xG, availability, current totals odds (nwsl-model/)
cd nwsl-model
python3 scripts/fetch_official_nwsl_data.py --season 2026
python3 scripts/fetch_official_player_appearances.py --seasons 2025 2026
python3 scripts/fetch_asa_data.py --seasons 2025 2026
python3 scripts/rebuild_operational_features.py --season 2026
python3 scripts/fetch_nwsl_availability.py
bash scripts/poll_current_odds.sh
python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models
```
Or `make refresh` for everything except the ESPN pair. No local odds credential
or Apify token is needed: the poller reads the fixed, cached API-Football NWSL
feed and the public FOX pages.

The lightweight source-only command is:

```bash
make odds-poll
```

It performs five bounded actions:

1. Captures multi-book API-Football goal totals into
   `data/raw/api_football_shadow_current.csv` and its own snapshot history.
2. Refreshes FOX Sports into the authoritative `odds.csv`.
3. Removes rows older than `odds_provider.stale_line_minutes` that are still
   labeled `current`; historical `open`, `close`, and shadow evidence is kept.
4. Captures the cleaned authoritative line history for CLV.
5. Writes `data/raw/odds_source_health.json`, including a forward-observation
   gate for API-Football.

API-Football is deliberately shadow-only. It cannot affect picks until it has
at least seven observation days, five matched fixtures, two sportsbooks, full
freshness, zero unmatched rows, and at least 90% coverage of FOX-priced
fixtures. Clearing those checks only makes the feed ready for manual review;
promotion is never automatic. Set `ENABLE_LEGACY_APIFY_ODDS=1` only for an
explicit diagnostic retry of the old DraftKings/FootyStats actors.

The recurring Codex cadence is intentionally bounded: the full tracker runs
once at 8:00 AM Pacific every day. On dates present in `upcoming.csv`, two
additional gated runs occur at 2:00 PM and 8:00 PM Pacific. The extra task runs
`scripts/run_matchday_refresh_if_scheduled.sh`, which exits before any provider
call on non-match days.

Historical closing-odds backfill (OddsPortal, direct HTTP, no Apify/tokens):
```bash
python3 scripts/fetch_apify_oddsportal_history.py --seasons 2026 --archive-fetch-mode direct --total-market-fetch-mode direct --include-1x2-opening
python3 scripts/normalize_odds.py --input data/raw/odds.csv --output data/raw/odds_normalized.csv
```

### 2. Train
```bash
python3 scripts/train.py --config configs/default.yaml [--model dixon_coles|bivariate_poisson|team_ratings_only|all] [--version VERSION]
```
Fits the two pure score models, team ratings, context provider, and (for spi_lite) writes `<version>/spi_lite_summary.json` with the training data's actual league home/away rates and `<version>/config_snapshot.json` with the exact config used, so served baselines match what was trained rather than falling back to class defaults.

`team_ratings_only` is reserved for the isolated totals policy. Keep its
artifacts outside the global champion root:

```bash
python3 scripts/train.py \
  --model team_ratings_only \
  --output-dir data/processed/policy/nwsl-totals-open-over-v1/models
```

### 3. Backtest and tune
```bash
python3 scripts/backtest.py --config configs/default.yaml --version VERSION [--models dixon_coles bivariate_poisson market_residual]
python3 scripts/tune_betting_thresholds.py --artifact-root data/processed/models --version VERSION --evidence-model spi_lite_baseline
python3 scripts/evaluate_totals_model.py --artifact-root data/processed/models --version VERSION --model spi_lite_baseline
```
Nested chronological threshold tuning walks the decision log forward in time, selecting thresholds only from strictly-prior blocks, and writes `<version>/betting_analysis/nested_thresholds_summary_<model>.json` (the OOS evidence the baseline promotion gate reads). Totals evaluation is diagnostic only: totals stay suppressed for picks regardless of its recommendation.

Opening-line/CLV research uses the same chronological runner but writes to a
separate directory so it cannot overwrite the close-line promotion artifacts:

```bash
python3 scripts/backtest.py \
  --config configs/default.yaml \
  --models spi_lite_baseline dixon_coles bivariate_poisson \
  --odds-source-type open \
  --output-dir data/processed/research/opening-line-YYYY-MM-DD
```

Opening candidates are paired only to the same match, market, sportsbook,
side, and total line at the close. Missing pairs remain missing, not zero.
Threshold sweeps keep structural selection rules fixed (enabled markets/sides,
price bounds, and probability-edge bounds) and vary only edge/confidence;
their metadata records excluded reasons as `structural_rules_v1`. The
promotion gate accepts only that eligibility version and close-line evidence,
so opening research can inform the next model round without promoting a live
alias by accident.

#### Frozen totals-over policy

`nwsl-totals-open-over-v1` is a separate capped lane. It does not change
`champion_pure`, the global promotion registry, or the default moneyline and
totals rules.

- Model: `team_ratings_poisson`
- Market/side: total over only
- Quote contract: opening or first-seen current quote; a later quote is usable
  only if the over price is no worse
- Frozen thresholds: expected-value edge `>= 0.02`, confidence `>= 0.03`
- Stake cap: 0.25% of bankroll per locked match
- Test design: thresholds selected on 2025 only and held fixed for the 2026
  rolling test
- No separate full-promotion quota or ROI/CLV gate. The capped policy remains
  governed by its pick-level thresholds, quote contract, and source-health
  safeguards; forward ROI and CLV remain monitoring evidence.

Rebuild the validation evidence:

```bash
python3 scripts/validate_frozen_policy.py \
  --backtest-dir data/processed/research/opening-line-2026-07-26 \
  --model team_ratings_poisson \
  --policy-id nwsl-totals-open-over-v1 \
  --train-season 2025 \
  --test-season 2026 \
  --output-dir data/processed/research/opening-line-2026-07-26/frozen-policy
```

Run and settle the live lane:

```bash
make policy-train
make policy-slate
make policy-settle
```

Serving fails closed when the evidence/model/market/side contract does not
match, a quote is stale, a later price is worse than first seen, or the frozen
thresholds are not met. Every near-term decision is recorded locally, at most
one actionable pick is locked per match, and settlement uses 90-minute goals.
After the complete runner succeeds, `scripts/publish_frozen_policy.py` posts
the run, slate, immutable locked picks, and settlement updates to the
Supabase-backed predictions page. A failed run never replaces the latest good
publication, and daily publications do not create GitHub commits or Vercel
deployments.

Validate the publication contract without writing:

```bash
python3 scripts/publish_frozen_policy.py --dry-run
```

The live publisher reads `NWSL_MODEL_PUBLISH_SECRET` from the process,
gitignored `.env.local`, or the `nwsl-model-publish` / `codex` macOS Keychain
item. Never print or commit it.

### 4. Evaluate and promote
```bash
python3 scripts/evaluate.py --artifact-root data/processed/models --version VERSION
python3 scripts/promote.py --artifact-root data/processed/models --version VERSION
```
Run `evaluate.py` again after the tuning/totals steps above so the baseline gate sees their OOS evidence before `promote.py` decides `champions.json`.

### 5. Holdout, predict, serve
```bash
python3 scripts/season_holdout.py --config configs/default.yaml --train-season 2025 --test-season 2026 [--models spi_lite_baseline dixon_coles bivariate_poisson market_residual]
python3 scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv --model champion_pure --output data/processed/predictions.csv
python3 scripts/generate_betting_slate.py --predictions data/processed/predictions.csv --days 14
python3 scripts/build_season_game_database.py --season 2026
python3 scripts/export_web.py --config configs/default.yaml --model-dir data/processed --output-dir data/processed/web
```
`Makefile` wraps `backtest`, `holdout`, `slate`, `policy-train`,
`policy-slate`, `policy-settle`, `test`, and `test-fast` as shortcuts.

## Model registry

No registry object; three hardcoded sets in `src/backtest/runner.py` govern dispatch:
- `PURE_MODELS = {dixon_coles, bivariate_poisson}` — the only models `_create_model` builds and trains.
- `BASELINE_MODELS` — `uniform_baseline, home_field_baseline, team_ratings_poisson, rolling_npxg_poisson, spi_lite_baseline, regularized_elo_baseline`. Never trained/pickled; reconstructed at serve time. This is also gating.py's promotion bar (the "best baseline" pure models must beat).
- `MARKET_MODELS = {market_residual}` — uses the configured evaluation quote as an input feature (close by default; open only in separate research runs), dispatched through the same baseline fold path but deliberately excluded from `BASELINE_MODELS` so it can never become the promotion bar itself.

Promotion (`champions.json`, written only by `promote.py`): a pure model passes `evaluate_go_live_gates` (beats best baseline on OOF-calibrated log loss/Brier by 2%, calibration, slice stability) or it stays `research_only`. If no pure model passes, `evaluate_baseline_go_live_gates` can promote a baseline (currently only exercised for `spi_lite_baseline`) if it is this run's OOF-strongest baseline AND its nested-tuning OOS evidence is tagged `structural_rules_v1`, uses close lines only, and clears `n_blocks_tuned >= 5`, `n_bets >= 50`, `roi_units >= 0.05`. Every baseline gate result carries an `evidence_caveat`: OOS ROI is measured on structurally eligible close-time candidates with uncalibrated model probabilities, not the live calibrated/current-odds stream, so a pass does not directly certify live performance.

Serving (`src/utils/artifacts.py::resolve_model_artifact`, consumed by `scripts/predict.py`, `scripts/run_operator_report.py`, and `api/deps.py`): `kind="baseline_fallback"` when no promotion exists (implicitly serves whichever baseline had the lowest log loss in the latest backtest); `kind="baseline_promoted"` when `champions.json` explicitly promoted a baseline. Both read `spi_lite_summary.json` and `config_snapshot.json` from the artifact's own version dir so the served model matches what was actually trained and gated, not the API's current live config.

## Data contracts

- **matches.csv / upcoming.csv** (ESPN-keyed match ids): required `match_id, match_date, season, home_team, away_team, home_goals_90, away_goals_90`; optional `competition, regular_season_flag, home_npxg, away_npxg, home_xg, away_xg, home_penalties, away_penalties, venue, stadium, match_status, resumed_flag, incomplete_flag`.
- **odds.csv** (wide): `match_id, timestamp, sportsbook, market_type, line, home_odds, draw_odds, away_odds, over_odds, under_odds, source_type`. `source_type` changes what `timestamp` means (`close` = kickoff-stamped consensus, `current` = wall-clock capture, `open` = opening line) — always filter on it before reading `timestamp`.
- **appearances.csv**: required `match_id, player_id, team, start_minute, end_minute`.
- **projected_lineups.csv**: required `match_id, team, player_id`.

Full definitions and optional columns: `src/data/schemas.py`.

## Sharp edges

1. Never run `python3 scripts/train.py --build-dataset` and never delete `data/raw/matches.csv`. Matches are ESPN-keyed; a missing file auto-triggers a rebuild with `nwsl::`-namespaced ids that orphans every row in `odds.csv`.
2. Run every command in this package from `nwsl-model/`, never the repo root.
3. `odds.csv` timestamp semantics depend on `source_type` (see Data contracts above).
4. `APIFY_TOKEN` / `THE_ODDS_API_KEY` live only in gitignored `.env.local` files. Never print or commit them.
5. Policy-only ratings belong under
   `data/processed/policy/nwsl-totals-open-over-v1/models`, never the global
   `data/processed/models` root.
6. `api_football_shadow_*` files are research evidence only. Never merge them
   into `odds.csv` or change their `source_type` without an explicit,
   forward-validated policy review.

## Testing

```bash
python3 -m pytest                 # full suite (396 tests at this checkpoint)
make test-fast                    # skip the two slow files (optimizer fits + subprocess pipeline)
```
