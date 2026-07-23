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
  odds/      # apify_footystats, apify_oddsportal, foxsports, provider, quality
  utils/     # artifacts, gating, dates, io
api/         # FastAPI prediction server (api/main.py, api/deps.py)
tests/       # pytest suite (306+ tests)
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
python3 -c "from pathlib import Path; from src.data.dataset_builder import build_appearances; \
  build_appearances(Path('.')).to_csv('data/raw/appearances.csv', index=False)"
python3 scripts/fetch_asa_data.py --seasons 2025 2026
python3 scripts/fetch_nwsl_availability.py
python3 scripts/fetch_foxsports_odds.py --days 14
python3 -c "from pathlib import Path; import pandas as pd; from src.odds.apify_footystats import update_dataset_manifest_odds; \
  update_dataset_manifest_odds(Path('data/raw/dataset_manifest.json'), pd.read_csv('data/raw/odds.csv'))"
python3 scripts/append_odds_snapshot.py --incoming data/raw/odds.csv --snapshot data/raw/odds_snapshots.csv
python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models
```
Or `make refresh` for everything except the ESPN pair. No Apify, no tokens needed for any of the above.

Historical closing-odds backfill (OddsPortal, direct HTTP, no Apify/tokens):
```bash
python3 scripts/fetch_apify_oddsportal_history.py --seasons 2026 --archive-fetch-mode direct --total-market-fetch-mode direct --include-1x2-opening
python3 scripts/normalize_odds.py --input data/raw/odds.csv --output data/raw/odds_normalized.csv
```

### 2. Train
```bash
python3 scripts/train.py --config configs/default.yaml [--model dixon_coles|bivariate_poisson|all] [--version VERSION]
```
Fits the two pure score models, team ratings, context provider, and (for spi_lite) writes `<version>/spi_lite_summary.json` with the training data's actual league home/away rates and `<version>/config_snapshot.json` with the exact config used, so served baselines match what was trained rather than falling back to class defaults.

### 3. Backtest and tune
```bash
python3 scripts/backtest.py --config configs/default.yaml --version VERSION [--models dixon_coles bivariate_poisson market_residual]
python3 scripts/tune_betting_thresholds.py --artifact-root data/processed/models --version VERSION --evidence-model spi_lite_baseline
python3 scripts/evaluate_totals_model.py --artifact-root data/processed/models --version VERSION --model spi_lite_baseline
```
Nested chronological threshold tuning walks the decision log forward in time, selecting thresholds only from strictly-prior blocks, and writes `<version>/betting_analysis/nested_thresholds_summary_<model>.json` (the OOS evidence the baseline promotion gate reads). Totals evaluation is diagnostic only: totals stay suppressed for picks regardless of its recommendation.

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
`Makefile` wraps `backtest`, `holdout`, `slate`, `test`, `test-fast` as shortcuts.

## Model registry

No registry object; three hardcoded sets in `src/backtest/runner.py` govern dispatch:
- `PURE_MODELS = {dixon_coles, bivariate_poisson}` — the only models `_create_model` builds and trains.
- `BASELINE_MODELS` — `uniform_baseline, home_field_baseline, team_ratings_poisson, rolling_npxg_poisson, spi_lite_baseline, regularized_elo_baseline`. Never trained/pickled; reconstructed at serve time. This is also gating.py's promotion bar (the "best baseline" pure models must beat).
- `MARKET_MODELS = {market_residual}` — uses close odds as an input feature, dispatched through the same baseline fold path but deliberately excluded from `BASELINE_MODELS` so it can never become the promotion bar itself.

Promotion (`champions.json`, written only by `promote.py`): a pure model passes `evaluate_go_live_gates` (beats best baseline on OOF-calibrated log loss/Brier by 2%, calibration, slice stability) or it stays `research_only`. If no pure model passes, `evaluate_baseline_go_live_gates` can promote a baseline (currently only exercised for `spi_lite_baseline`) if it is this run's OOF-strongest baseline AND its nested-tuning OOS evidence clears `n_blocks_tuned >= 5`, `n_bets >= 50`, `roi_units >= 0.05`. Every baseline gate result carries an `evidence_caveat`: OOS ROI is measured on close-time, uncalibrated backtest odds, not the live calibrated/current-odds stream, so a pass does not directly certify live performance.

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

## Testing

```bash
python3 -m pytest                 # full suite (~306+ tests, ~100s)
make test-fast                    # skip the two slow files (optimizer fits + subprocess pipeline)
```
