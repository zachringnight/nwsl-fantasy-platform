# NWSL Model Handoff - 2026-05-25

## Repo State

- Repo: `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main`
- Branch: `codex/model-pipeline-refresh`
- Primary model package: `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model`
- User priority: build the best NWSL betting model possible, with this season's data complete as the highest priority.

## Current Data Coverage

- Fresh ESPN data has been pulled into `src/data/espn/`.
- `src/data/espn/matches-2026.json` contains the full 2026 regular-season fixture set:
  - 240 total matches
  - 85 completed matches
  - 155 upcoming matches
  - Date range: `2026-03-14` to `2026-11-01`
  - 16 teams, 30 matches per team
- Model raw training file:
  - `nwsl-model/data/raw/matches.csv`
  - 274 completed matches
  - Seasons: 2025 and 2026
  - Date range: `2025-03-15` to `2026-05-24`
- Model upcoming file:
  - `nwsl-model/data/raw/upcoming.csv`
  - 155 scheduled 2026 matches
  - Date range: `2026-05-29` to `2026-11-01`
- Dataset manifest:
  - `nwsl-model/data/raw/dataset_manifest.json`
  - `odds.source_available=false`
  - `odds.rows=0`
  - `xg_missing_pct=100`
  - `odds_missing_pct=100`

This matches the NWSL 2026 schedule footprint: 16 clubs and 240 regular-season matches. Source: https://www.nwslsoccer.com/news/nwsl-announces-2026-schedule-footprint

## Model Artifacts

- Latest trained artifact: `nwsl-model/data/processed/models/20260525T211927Z`
- Trained model families:
  - `dixon_coles`: converged
  - `bivariate_poisson`: converged
- Prediction output:
  - `nwsl-model/data/processed/predictions.csv`
  - `nwsl-model/data/processed/web/predictions.json`
  - 155 upcoming match predictions
- Betting output:
  - `accepted_bet_count=0`
  - `candidate_bet_count=0`
  - No active odds source was available, so the system correctly produced no bets.

Important caution: the full-season projection file currently includes extreme far-future probabilities. The 95th percentile `confidence_score` is about `0.986`, and max is about `0.9996`. Treat the current full-season output as projections only, not bet-ready pricing, until a completed chronological backtest/evaluation and calibration pass are finished.

## Code Changes Made

- Added deterministic model input generation:
  - `src/lib/model-input-builder.ts`
  - `src/lib/model-input-builder.test.ts`
  - `scripts/generate-model-input.ts`
- Extended 2026 ESPN schedule fetch windows:
  - `scripts/fetch-espn-nwsl.ts`
- Added/restored betting recommendation module:
  - `nwsl-model/src/betting/recommendations.py`
- Hardened staking fields and slate exposure:
  - `nwsl-model/src/betting/staking.py`
- Added calibration helpers used by prediction/evaluation paths:
  - `nwsl-model/src/models/calibration.py`
- Fixed latest-artifact resolution by modification time:
  - `nwsl-model/src/utils/artifacts.py`
- Made backtest artifact-aware:
  - `nwsl-model/scripts/backtest.py`
  - Supports `--artifact-root` and `--version`
  - Writes `backtest_summary.json` into the selected model version
- Made backtest runner support bounded fold-fit settings:
  - `nwsl-model/src/backtest/runner.py`
- Fixed default backtest config to use supported baselines:
  - `nwsl-model/configs/default.yaml`
  - Current defaults use `uniform_baseline`, `home_field_baseline`, `team_ratings_poisson`, and `rolling_npxg_poisson`
  - `run_ablations=false`
  - `step_size=28`
  - backtest fold fit override: `max_iter=250`, `tol=1.0e-6`

## Tests Added Or Updated

- `nwsl-model/tests/test_artifacts.py`
- `nwsl-model/tests/test_backtest_config.py`
- `nwsl-model/tests/test_calibration_helpers.py`
- `nwsl-model/tests/test_config_defaults.py`
- `nwsl-model/tests/test_recommendations.py`
- `src/lib/model-input-builder.test.ts`

## Verification Completed

- `pnpm test`
  - Passed: `238 passed`
- `python3 -m pytest -q --ignore=tests/test_pipeline_smoke.py`
  - Passed: `116 passed`
- `python3 -m pytest nwsl-model/tests/test_pipeline_smoke.py -q`
  - Passed after patching `backtest.py`
- `python3 -m pytest nwsl-model/tests/test_backtest_config.py nwsl-model/tests/test_config_defaults.py -q`
  - Passed
- `pnpm exec vitest run src/lib/model-input-builder.test.ts`
  - Passed
- Focused Python compile/checks on changed modules passed during the work.

Not completed:

- A full real backtest/evaluation/promotion run was started and then stopped by user request.
- The stopped run completed Dixon-Coles folds and entered `bivariate_poisson`.
- No final `backtest_summary.json`, `evaluation_summary.json`, or `promotion_summary.json` exists for `20260525T211927Z`.

## Odds And Apify State

- Apify token was found and validated.
- It was saved only to ignored local env files:
  - `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/.env.local`
  - `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/.env.local`
- Both files are mode `0600` and gitignored.
- Do not print, commit, or include the token in handoffs.

Apify source checks:

- BetMGM actor: https://apify.com/zen-studio/betmgm-odds
  - Soccer leagues were available, but NWSL was not present in the tested NJ soccer list.
- DraftKings actor was tested through its public actor endpoint and did not list NWSL in soccer leagues.
- FanDuel actor returned `403`.
- Scrapemint Sports Odds Scraper: https://apify.com/scrapemint/sports-odds-scraper
  - No confirmed NWSL coverage from the checks available in this run.
- The repo has a The Odds API provider in `nwsl-model/src/odds/provider.py`, but no usable `THE_ODDS_API_KEY` or `ODDS_API_KEY` was found locally.

Current conclusion: the model can produce fair prices, but it cannot produce legitimate betting recommendations until a live NWSL odds feed is available.

## Current Dirty/Untracked Work

Expect many changed data and generated artifact files. Important new source/test files:

- `src/lib/model-input-builder.ts`
- `src/lib/model-input-builder.test.ts`
- `nwsl-model/src/betting/recommendations.py`
- `nwsl-model/tests/test_backtest_config.py`
- `nwsl-model/tests/test_calibration_helpers.py`
- `nwsl-model/tests/test_config_defaults.py`
- `nwsl-model/tests/test_recommendations.py`

Important generated files/folders:

- `nwsl-model/data/raw/upcoming.csv`
- `nwsl-model/data/processed/models/20260525T205637Z/`
- `nwsl-model/data/processed/models/20260525T210817Z/`
- `nwsl-model/data/processed/models/20260525T211927Z/`

Pre-existing untracked generated folders may also be present:

- `nwsl-model/data/processed/models/champions.json`
- `nwsl-model/data/processed/models/projection-agent-check-2025plus/`
- `nwsl-model/data/processed/models/pure-projection-2025plus-v2/`
- `nwsl-model/data/processed/models/pure-projection-2025plus-v3/`
- `nwsl-model/data/processed/operator/`
- `nwsl-model/data/processed/predictions-smoke.csv`
- `scripts/__pycache__/`

Do not blindly clean untracked files without checking provenance.

## Recommended Next Steps

1. Finish a bounded chronological backtest on the latest artifact.

   ```bash
   cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
   python3 scripts/backtest.py --config configs/default.yaml --artifact-root data/processed/models --version 20260525T211927Z
   ```

2. Run evaluation and promotion only after backtest completes.

   ```bash
   python3 scripts/evaluate.py --artifact-root data/processed/models --version 20260525T211927Z
   python3 scripts/promote.py --artifact-root data/processed/models --version 20260525T211927Z
   ```

3. If the score models fail promotion gates, keep `champion_pure` unpromoted and use the best baseline/research-only output rather than forcing a betting model.

4. Build a near-term betting slate output separate from full-season projections.

   Recommended scope:
   - next 7 to 14 days only
   - require current odds rows
   - require calibration artifact
   - suppress bet recommendations when `gating_status != passed`

5. Wire a real odds feed.

   Preferred order:
   - The Odds API if a usable soccer/NWSL key exists or can be added
   - Apify actor only if it can demonstrate NWSL league coverage
   - Otherwise keep `accepted_bet_count=0` and report `missing_market_price`

6. Re-run full verification before commit.

   ```bash
   cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
   pnpm test
   python3 -m pytest -q
   ```

## Practical Handoff Summary

The highest-priority data task is handled: this repo now has the full 2026 NWSL regular-season schedule and model-ready completed/upcoming splits. The model pipeline has been repaired enough to train, predict, run smoke lifecycle tests, and avoid fake bets when odds are missing.

The remaining work is model-quality validation, not data collection: complete the chronological backtest/evaluation/promotion cycle, decide whether the score model truly beats baselines, and only then expose bet recommendations once a live odds source exists.
