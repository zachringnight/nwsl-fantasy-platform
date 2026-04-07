# NWSL Model Handoff

Date: 2026-04-07  
Workspace: `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main`  
Branch: `codex/merge-cleanup-worktree`

## Scope

This handoff covers the `nwsl-model` pure-projection refactor and the full real artifact run for the current `2025+` setup.

Primary goal of this phase:

- treat `nwsl-model` as a pure pre-match projection engine
- use `2025 full season + 2026-to-date` only
- evaluate on forecast quality, calibration, and stability
- do not rely on historical odds for promotion

## Current Outcome

The real pipeline was run end to end on artifact version `pure-projection-2025plus-v2`.

Status:

- training: completed
- backtest: completed
- evaluation: completed
- promotion: completed
- operator report: completed

Result:

- both pure models remain `research_only`
- no champion was promoted
- current `champions.json` is intentionally empty

## Most Important Reality Check

This version is not promotable. The pure models underperform the simple baselines on the `2026` holdout.

That is not a tooling failure. The artifact flow is working correctly now. The model quality is the blocker.

## Key Fix Made During This Run

Backtest scheduling bug fixed in:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/src/backtest/runner.py`

Problem:

- `backtest.run_ablations: false` was being ignored
- every requested pure model still expanded into:
  - `__no_asa`
  - `__no_lineup`
  - `__no_priors`
  - `__no_rest`

Fix:

- added explicit `resolve_models_to_run(...)`
- ablations only run when `run_ablations` is actually enabled

Regression test added:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/tests/test_backtest_runner.py`

## Real Artifact Version

Artifact directory:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2`

Important files:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/training_summary.json`
- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/backtest_summary.json`
- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/evaluation_summary.json`
- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/calibration_artifacts.json`
- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/champions.json`

Backtest exports:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/backtest/metrics_comparison.csv`
- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/backtest/predictions_dixon_coles.csv`
- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/backtest/predictions_bivariate_poisson.csv`

## Real Training Summary

Source:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/training_summary.json`

Key values:

- version: `pure-projection-2025plus-v2`
- matches: `226`
- history window: `2025+`
- contextual columns: `83`

Model fit state:

- `dixon_coles`: `converged = false`, `log_likelihood = -158.546888460331`
- `bivariate_poisson`: `converged = false`, `log_likelihood = -158.4299205858264`

This is already a red flag. The models finished artifact generation but did not converge.

## Real Backtest Results

Source:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/backtest_summary.json`

Pure models:

- `dixon_coles`: `log_loss_1x2 = 1.3393`, `brier_score_1x2 = 0.7145`, `expected_total_goals_mae = 2.0856`
- `bivariate_poisson`: `log_loss_1x2 = 1.5043`, `brier_score_1x2 = 0.7470`, `expected_total_goals_mae = 1.9237`

Baselines:

- `uniform_baseline`: `log_loss_1x2 = 1.0986`, `brier_score_1x2 = 0.6667`, `expected_total_goals_mae = 1.1066`
- `home_field_baseline`: `log_loss_1x2 = 1.0670`, `brier_score_1x2 = 0.6455`, `expected_total_goals_mae = 1.1142`
- `team_ratings_poisson`: `log_loss_1x2 = 1.0906`, `brier_score_1x2 = 0.6627`, `expected_total_goals_mae = 1.1918`
- `rolling_npxg_poisson`: `log_loss_1x2 = 1.0905`, `brier_score_1x2 = 0.6575`, `expected_total_goals_mae = 1.0919`

Interpretation:

- both pure models are materially worse than the strongest simple baselines
- this is not close enough for promotion

## Evaluation / Gate Result

Source:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/pure-projection-2025plus-v2/evaluation_summary.json`

Gate result:

- `dixon_coles`: `passed = false`, `gating_status = research_only`
- `bivariate_poisson`: `passed = false`, `gating_status = research_only`

Champion recommendation:

- `aliases = {}`
- `experimental = {}`

Promotion output:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/models/champions.json`

Current file content is intentionally empty because nothing passed.

## Operator Report

Command was verified end to end, but there were no upcoming fixtures in the official reference window.

Output:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/data/processed/operator/20260407T190035Z/run_summary.json`

Result:

- no upcoming fixtures found in next 7 days

## Config Used For The Real Run

Config file:

- `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/configs/default.yaml`

Important live values:

- `data.history_start_season: 2025`
- `backtest.min_train_matches: 189`
- `backtest.step_size: 8`
- `backtest.run_ablations: false`

Those backtest values are deliberate. They make the `2025 -> 2026` expanding-window run practical on real data.

## Commands Already Run Successfully

From `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model`:

```bash
python3 scripts/build_dataset.py --repo-root .. --history-start-season 2025
python3 scripts/train.py --config configs/default.yaml --model all --version pure-projection-2025plus-v2
python3 scripts/backtest.py --config configs/default.yaml --artifact-root data/processed/models --version pure-projection-2025plus-v2
python3 scripts/evaluate.py --artifact-root data/processed/models --version pure-projection-2025plus-v2
python3 scripts/promote.py --artifact-root data/processed/models --version pure-projection-2025plus-v2
python3 scripts/run_operator_report.py --config configs/default.yaml --model dixon_coles --model-dir data/processed/models
pytest tests -q
```

## Tests Passing

Latest verified test results:

- `pytest tests -q` -> `114 passed in 55.74s`
- focused post-fix regression:
  - `pytest tests/test_backtest_runner.py tests/test_pipeline_smoke.py tests/test_artifacts.py -q`
  - `5 passed in 25.61s`

## Worktree State

The worktree is dirty.

This includes:

- code changes across `nwsl-model`
- newly generated raw datasets under `nwsl-model/data/raw`
- newly generated processed artifacts under `nwsl-model/data/processed/models`
- operator output under `nwsl-model/data/processed/operator`

No commit was made in this phase.

## What Should Happen Next

### Highest-priority model work

1. Fix optimizer convergence in:
   - `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/src/models/dixon_coles.py`
   - `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model/src/models/bivariate_poisson.py`

2. Run intentional ablations to identify which feature families are harming `2026` holdout performance:
   - ASA features
   - lineup features
   - priors
   - schedule/rest features

3. Compare the pure models against the simple baselines as the main acceptance bar, not against prior versions.

4. Investigate why the contextual feature set is underperforming:
   - leakage is less likely now
   - mis-specified feature scaling or unstable optimization is more likely
   - the team-expansion handling for `Boston Legacy` and `Denver Summit` should also be reviewed

### What not to do next

- do not promote a champion manually
- do not treat this artifact version as production-ready
- do not assume the operator-report path proves model quality; it only proves the reporting code path works

## Recommended Next Engineer Workflow

1. Review:
   - `training_summary.json`
   - `backtest_summary.json`
   - `evaluation_summary.json`

2. Reproduce the bad results once:
   - rerun `backtest.py` on `pure-projection-2025plus-v2`

3. Fix convergence and parameter stability first.

4. Run intentional ablations with a separate artifact version name.

5. Only rerun `promote.py` after the pure models beat the strongest baseline cleanly.

## Bottom Line

The infrastructure is in much better shape than before this run:

- the pure `2025+` pipeline is real
- artifacts are versioned
- calibration artifacts are written
- gates are enforced
- promotion now fails safely
- the hidden ablation scheduling bug is fixed

But the current model quality is not good enough. The next engineer should treat this as a research-state projection engine with a working artifact pipeline, not as a promotable model.
