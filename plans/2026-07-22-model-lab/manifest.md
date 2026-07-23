# NWSL Model Lab: Next Round (2026-07-22)

## Goal

Prove or reject an SPI-lite plus market-residual ML betting strategy under strict chronological validation, on data refreshed through 2026-07-21, while keeping every consumer-facing output fail-closed. Source of scope: `HANDOFF_NWSL_MODEL_2026-05-28.md`, section "Recommended Next Round" (all 6 items), plus a data-refresh wave forced by 8 weeks of staleness.

Done means:
1. Data refreshed: completed results, fixtures, appearances, availability through yesterday; season database and input audit rebuilt.
2. Close-odds history extended for June and July where a no-token HTTP path exists; coverage honestly reported where it does not.
3. `spi_lite_baseline` is a first-class production forecast candidate (trains, persists, predicts, gates) not just a benchmark.
4. Nested chronological ML threshold tuning exists: thresholds tuned only on prior folds, evaluated on later folds, no look-ahead.
5. A market-residual layer learns when model-vs-no-vig-market disagreement historically produced ROI, and is evaluated as a candidate, not auto-promoted.
6. Totals rebuilt as a separate calibrated market-line model, still suppressed unless it passes validation.
7. Fresh artifact trained, rolling validation plus 2025-to-2026 holdout run for all candidates, evidence assembled into a promote-or-reject report.
8. Full verification green: `python3 -m pytest` in `nwsl-model/`, `pnpm test` at repo root. Slate stays fail-closed unless gates genuinely pass.

## Architecture (current, verified by discovery)

- Python package `nwsl-model/`: scripts/ (entry points), src/ (models, betting, backtest, data, odds, features, utils), tests/ (306 collected), configs/default.yaml.
- Forecast models: `spi_lite_baseline` (current best benchmark), `dixon_coles`, `bivariate_poisson` (both research_only), `market_blend` (exists, role confirmed in discovery output).
- Decision stack: recommendations + staking + CLV + promotion gating with OOF-calibrated metrics.
- Data: raw CSVs in `nwsl-model/data/raw/`, processed outputs and season SQLite in `nwsl-model/data/processed/`, per-run artifacts under `data/processed/models/<version>/` (gitignored).
- TS side consumes `data/processed/web/*.json`; not in scope beyond regenerated exports.

## Hard constraints

- Fail closed. No pick tier, lean, or slate row may loosen its gates to produce output. `no_bet` everywhere is an acceptable end state.
- No Apify actor runs and no paid scraping. Only plain HTTP fetch paths that already exist in the repo. Never print or commit tokens; env files stay local.
- Chronological integrity. Any tuning or residual fitting must only see data strictly earlier than its evaluation window.
- No new Python dependencies unless already in pyproject.
- No promotion by fiat. Promotion state changes only if existing gates pass on refreshed evidence.
- Branch: `codex/model-pipeline-refresh`. Commit at end after green verification, then push (both pre-approved this session).

## Review status
Adversarially reviewed 2026-07-22 by a 4-lens panel (contracts, waves, feasibility, scope-safety) against the live codebase. Found one critical root-cause bug shared across 4 lenses: baseline models (spi_lite_baseline, and market_residual by extension) never settle bets in `BacktestRunner._evaluate_baseline_fold` — no `staker`, never calls `_generate_and_settle_bets`. Fixed by expanding packet 04's scope to add bet settlement to the baseline path (previously packet 04 only added fold_id/match_date columns). See REVIEW_NOTES.md for the full findings list and how each was resolved. Packets 04, 05, 06, 07, 08, 09, 11, 13 were revised as a result; 01, 02, 03, 10, 12 were reviewed and found sound as originally written.

## Decision record (align gate waived by Zach 2026-07-22)

- D1 Scope: all six handoff items plus data refresh, as one multi-wave run. Chosen over core-lab-only because staleness makes refreshed evidence the main value.
- D2 Odds extension: best-effort via existing non-Apify HTTP paths only. If June-July close odds cannot be fetched unattended, the lab still runs; ROI windows keep their existing coverage and the report says so plainly.
- D3 Residual layer: hand-rolled regularized logistic on model-vs-market disagreement features if sklearn is absent; sklearn if present. No boosting libs.
- D4 Config ownership: `configs/default.yaml` is edited by at most one packet per wave to avoid write collisions; other packets carry defaults in code.
- D5 Verification: every packet ends with its own check; full pytest at wave boundaries only (suite is ~2 min).
- D6 End state: evidence report + updated candidate wiring. Consumer slate remains fail-closed regardless of holdout ROI.

## Status protocol (orchestrator-enforced)

Each packet's agent ends with exactly one line: `DONE: <packet-id>`, `DONE_WITH_CONCERNS: <packet-id>: <one line>`, or `BLOCKED: <packet-id>: <one line>`. The orchestration script parses this; BLOCKED stops dependents, not the whole run.

## Architecture facts every packet inherits

- All Python commands run from `nwsl-model/` (pytest pythonpath=["."] and `data.official_matches_dir='../data/nwsl-official'` are cwd-relative). TS commands run from repo root. `pnpm install` required once (node_modules absent).
- Python 3.14.3, global env. Allowed libs: numpy, pandas, scipy, scikit-learn, statsmodels, pydantic, pyyaml, matplotlib, pyarrow. NO xgboost/lightgbm.
- Full pytest green shape: `306 passed` in ~103s (count grows with new tests). Fast loop: `python3 -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py`.
- matches.csv/upcoming.csv are ESPN-keyed. NEVER run `train.py --build-dataset` and never delete matches.csv (auto-triggers rebuild with nwsl:: ids that orphans all odds rows).
- odds.csv wide contract: [match_id, timestamp, sportsbook, market_type, line, home_odds, draw_odds, away_odds, over_odds, under_odds, source_type]; source_type close=kickoff-stamped consensus, current=wall-clock capture, open=opening. Always filter source_type before interpreting timestamp.
- Model dispatch: PURE_MODELS={dixon_coles,bivariate_poisson} via _create_model; BASELINE_MODELS via _evaluate_baseline_fold. Model names must not contain '__' (ablation parser).
- Fail-closed invariants that must survive every packet: official picks require gating_status=='passed'; slate forces accepted_bet=False without fresh current odds; totals official_picks_enabled stays false.
- Never print or commit APIFY_TOKEN / THE_ODDS_API_KEY; .env.local files stay local.
- Commit messages: no em dashes, conventional prefixes. Tests first where behavior is verifiable.

## Task index

| id | name | files touched (create*, modify, run-only) | depends | wave |
|----|------|------------------------------------------|---------|------|
| 01 | config-schema | nwsl-model/configs/default.yaml, nwsl-model/tests/test_config_defaults.py | - | 1 |
| 02 | fix-appearances-fetch | nwsl-model/scripts/fetch_official_player_appearances.py, nwsl-model/tests/test_official_api.py | - | 1 |
| 03 | oddsportal-direct-mode | nwsl-model/src/odds/apify_oddsportal.py, nwsl-model/scripts/fetch_apify_oddsportal_history.py, nwsl-model/tests/test_apify_oddsportal.py | - | 1 |
| 04 | baseline-bet-settlement-and-fold-persistence (REVISED, was fold-persistence only) | nwsl-model/src/backtest/runner.py, nwsl-model/src/betting/recommendations.py, nwsl-model/scripts/season_holdout.py, nwsl-model/tests/test_backtest_profitability.py | - | 1 |
| 05 | data-refresh-exec | data files only (run-only; scripts from 02) | 02 | 2 |
| 06 | spi-first-class | nwsl-model/src/utils/gating.py, nwsl-model/src/utils/artifacts.py, nwsl-model/src/models/baseline.py, nwsl-model/scripts/train.py, nwsl-model/scripts/predict.py, nwsl-model/scripts/run_operator_report.py, nwsl-model/scripts/promote.py, nwsl-model/scripts/evaluate.py, nwsl-model/tests/test_artifacts.py, nwsl-model/tests/test_spi_lite.py | 01 | 2 |
| 07 | threshold-tuning | *nwsl-model/src/backtest/threshold_tuning.py, *nwsl-model/scripts/tune_betting_thresholds.py, *nwsl-model/tests/test_threshold_tuning.py | 01, 04 | 2 |
| 08 | market-residual | *nwsl-model/src/models/market_residual.py, nwsl-model/src/backtest/runner.py, nwsl-model/scripts/season_holdout.py, *nwsl-model/tests/test_market_residual.py | 01, 04 | 2 |
| 09 | totals-market-model | *nwsl-model/src/models/totals_market_model.py, *nwsl-model/scripts/evaluate_totals_model.py, *nwsl-model/tests/test_totals_market_model.py | 01 | 2 |
| 10 | odds-close-backfill | data files only (run-only; scripts from 03) | 03, 05 | 3 |
| 11 | lab-run | data + artifacts + *plans/2026-07-22-model-lab/LAB_REPORT.md (run-only) | 05, 06, 07, 08, 09, 10 | 3b |
| 12 | docs-organization | *CLAUDE.md (repo root), *nwsl-model/README.md, *nwsl-model/Makefile, docs/handoffs/ moves, *docs/README.md | 06, 07, 08, 09 | 3b |
| 13 | final-verification | run-only: predictions, slate, season db, web exports, full test suites | 11, 12 | 4 |

Wave conflict rule: within a wave no two packets touch the same file. default.yaml is owned by 01 alone; runner.py by 04 in wave 1 then 08 in wave 2; season_holdout.py by 04 then 08. Packets carry code defaults so they never edit default.yaml themselves.
