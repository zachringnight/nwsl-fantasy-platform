# NWSL Model Handoff - 2026-05-28

## Repo State

- Repo: `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main`
- Branch: `codex/model-pipeline-refresh`
- Primary model package: `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model`
- Handoff timestamp checked locally: `2026-05-28T13:01:17-0400`
- User priority: build the best possible NWSL betting model, with current-season data, odds integrity, profitability testing, ML and totals coverage, lineups/player impact, and honest consumer-facing pick tiers.

The repo is intentionally dirty with many source, test, raw-data, and generated-artifact changes. Do not clean untracked files blindly.

## Current Data Coverage

- Model completed-match file: `nwsl-model/data/raw/matches.csv`
  - `274` completed matches
  - Seasons: `2025`, `2026`
  - Date range: `2025-03-15` to `2026-05-24`
- Model upcoming file: `nwsl-model/data/raw/upcoming.csv`
  - `155` scheduled 2026 matches
  - Date range: `2026-05-29` to `2026-11-01`
- Season database: `nwsl-model/data/processed/season_game_database.sqlite`
  - `240` total 2026 fixtures
  - `85` completed matches
  - `155` upcoming matches
  - `19` completed matches currently have positive-EV ML picks in the game-by-game diagnostic table after market rules.
- CSV database export: `nwsl-model/data/processed/season_game_model_lines_results.csv`

## Odds State

- Wide odds file: `nwsl-model/data/raw/odds.csv`
  - `493` rows
  - Source types: `477` close, `16` current
  - Markets: `254` 1X2, `239` total
  - Sportsbooks/sources: `OddsPortalAvg` 477, `FootyStats` 8, `FoxSports` 8
- Normalized odds file: `nwsl-model/data/raw/odds_normalized.csv`
- Close 1X2 coverage from latest input audit:
  - 2025: `162 / 189` matches, `85.71%`
  - 2026: `84 / 85` matches, `98.82%`
- Close totals coverage: `84.31%`
- Latest live refresh:
  - Apify/FootyStats actor run completed but returned no parseable NWSL odds text.
  - FOX Sports totals refresh succeeded for 8 near-term events.
  - Current rows now include stale FootyStats ML rows and fresh FoxSports totals rows; stale ML rows are no longer allowed to create leans after the timestamp parsing fix.

Do not print, commit, or include Apify tokens. The local env files are ignored and should stay local.

## Latest Model Artifact

- Current artifact: `nwsl-model/data/processed/models/20260527T160617Z`
- Promotion state:
  - `dixon_coles`: `research_only`
  - `bivariate_poisson`: `research_only`
- Latest artifact rolling validation:
  - `spi_lite_baseline`: 1X2 log loss `0.995740`, Brier `0.593890`
  - `dixon_coles`: 1X2 log loss `1.075951`, Brier `0.651602`, ML bets `7`, ML ROI `-73.28%`
  - `bivariate_poisson`: 1X2 log loss `1.091870`, Brier `0.660216`, ML bets `7`, ML ROI `-73.28%`

Conclusion: SPI-lite remains the best forecast baseline. The score models are not promoted and should not be represented as official betting models.

## 2025-Trained to 2026-Tested Holdout

Output directory: `nwsl-model/data/processed/season_holdout/2025_to_2026_totals_disabled/`

- Dixon-Coles:
  - ML-only bets: `16`
  - ROI: `+50.70%`
  - Home ROI: `+68.40%`
  - Away ROI: `+18.40%`
  - Draw bets: `0`
  - Totals bets: `0`
- Bivariate Poisson:
  - ML-only bets: `17`
  - ROI: `+20.27%`
  - Home ROI: `+35.31%`
  - Away ROI: `-3.50%`
  - Draw bets: `0`
  - Totals bets: `0`

Important interpretation: this holdout is encouraging for ML research, but it conflicts with the latest rolling artifact validation. Treat it as a candidate signal, not proof of a deployable model.

## Totals Status

Totals are deliberately disabled for actionable picks.

Latest launch totals diagnostics:

- Dixon-Coles:
  - n: `32`
  - mean predicted over probability: `0.4625`
  - actual over rate: `0.53125`
  - bias: `underprices_overs`
  - recommended action: `suppress_totals_until_recalibrated`
- Bivariate Poisson:
  - n: `32`
  - mean predicted over probability: `0.4631`
  - actual over rate: `0.53125`
  - bias: `underprices_overs`
  - recommended action: `suppress_totals_until_recalibrated`

Current config: `nwsl-model/configs/default.yaml`

- `betting.market_rules.totals.enabled=false`
- `allowed_sides=["over"]`
- Totals candidates are preserved in diagnostics but rejected with `market_disabled_by_validation`.

## Current Prediction And Slate Outputs

- Predictions: `nwsl-model/data/processed/predictions.csv`
  - `155` upcoming matches
  - `top_pick_tier`: all `no_bet`
  - `accepted_bet_count` total: `0`
  - `lean_bet_count` total: `0`
- Web predictions: `nwsl-model/data/processed/web/predictions.json`
- Near-term slate: `nwsl-model/data/processed/betting_slate.csv`
  - `8` rows
  - all `no_bet`
- Web slate: `nwsl-model/data/processed/web/betting_slate.json`

This is intentional. The model should fail closed until odds freshness, model gates, and market-specific validation support picks.

## Major Changes Since 2026-05-25 Handoff

- Added current-season first configuration and reduced overfitted home-field behavior.
- Added SPI-lite baseline and made it the benchmark to beat.
- Added ASA xG, official availability, player priors, roster continuity, and lineup feature plumbing.
- Added OddsPortal historical close ingestion/probes and FOX Sports current totals ingestion.
- Added normalized odds schema and odds quality states.
- Added full 2026 game-by-game SQLite/CSV database with projections, market lines, EV picks, outcomes, ROI fields, and no-bet reasons.
- Added 2025-to-2026 season holdout workflow.
- Added ML/totals decision logs, side-level profitability diagnostics, CLV/EV/staking test coverage, and reason-code gating.
- Added market rule `enabled` flags and disabled totals until recalibrated.
- Fixed mixed timestamp parsing so stale current ML rows cannot bypass stale-line checks.
- Refreshed predictions, web exports, betting slate, season database, input audit, backtest/evaluation/promotion summaries.

## Key Source Files Touched Or Added

- `nwsl-model/configs/default.yaml`
- `nwsl-model/src/utils/dates.py`
- `nwsl-model/src/data/loaders.py`
- `nwsl-model/src/betting/recommendations.py`
- `nwsl-model/src/betting/staking.py`
- `nwsl-model/src/backtest/runner.py`
- `nwsl-model/scripts/build_season_game_database.py`
- `nwsl-model/scripts/season_holdout.py`
- `nwsl-model/scripts/audit_model_inputs.py`
- `nwsl-model/scripts/fetch_apify_footystats_odds.py`
- `nwsl-model/scripts/fetch_apify_oddsportal_history.py`
- `nwsl-model/scripts/fetch_foxsports_odds.py`
- `nwsl-model/scripts/normalize_odds.py`
- `nwsl-model/scripts/predict.py`
- `nwsl-model/scripts/generate_betting_slate.py`
- `nwsl-model/scripts/evaluate.py`
- `nwsl-model/src/models/spi_lite.py`
- `nwsl-model/src/odds/normalization.py`
- `nwsl-model/src/odds/foxsports.py`
- `nwsl-model/src/features/lineup_features.py`
- `nwsl-model/src/features/roster_continuity.py`

Many tests were added or updated under `nwsl-model/tests/`, including odds normalization, Apify/OddsPortal, FOX Sports totals, lineup/roster continuity, SPI-lite, season holdout, season database, betting profitability, slate, recommendation gates, and timestamp parsing coverage.

## Verification Completed On 2026-05-28

Commands run fresh:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
python3 -m pytest -q
```

Result: `275 passed in 116.97s`

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
pnpm test
```

Result: `37 passed`, `239 passed`

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
git diff --check
```

Result: passed with no output.

Input audit refreshed:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models --version 20260527T160617Z --output-dir data/processed/models/20260527T160617Z/input_audit
```

Open issues from audit:

- Historical totals close odds coverage is incomplete.
- Historical player appearance coverage is sparse.
- Projected lineup coverage is forward-only.

## Recommended Next Round

Do not start with a consumer UI or more model complexity. The next highest-value batch is:

1. Make SPI-lite a first-class production forecast candidate.
2. Build nested chronological ML threshold tuning: tune only on prior folds and evaluate later folds.
3. Add a market residual layer that learns when model-vs-no-vig-market disagreement has historically produced ROI and CLV.
4. Rebuild totals as a separate calibrated market-line model, not as raw Dixon-Coles totals.
5. Improve historical player/lineup coverage for completed 2026 matches.
6. Keep current slate output fail-closed: official picks require promotion gates; leans require fresh odds and explicit lower-tier labeling.

Suggested first command sequence for the next agent:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models --version 20260527T160617Z --output-dir data/processed/models/20260527T160617Z/input_audit
python3 scripts/season_holdout.py --config configs/default.yaml --train-season 2025 --test-season 2026 --models spi_lite_baseline dixon_coles bivariate_poisson --output-dir data/processed/season_holdout/next_round_model_lab
```

Then implement the SPI-lite + market residual lab only after confirming the holdout runner supports `spi_lite_baseline` as a first-class candidate. If not, add that support with focused tests first.

## Practical Summary

The repo now has complete 2026 fixture coverage, a game-by-game projections/lines/results database, current/freshness-aware odds handling, ML and totals decision logs, and full verification passing. The model is not yet consumer-ready as an official betting product. ML has encouraging holdout signals but failed the latest rolling artifact validation; totals are biased under and intentionally disabled. The next work should prove or reject an SPI-lite plus market-residual ML strategy under strict chronological validation before any promotion.
