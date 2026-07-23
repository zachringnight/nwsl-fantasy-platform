# Packet 01: config-schema

## Objective
Add every new config namespace the lab needs to `nwsl-model/configs/default.yaml` in one place, so no other packet edits this file. Pin the odds staleness knob that currently exists only as a code default.

## Files
- Modify: `nwsl-model/configs/default.yaml`
- Modify: `nwsl-model/tests/test_config_defaults.py` (extend existing file)

## Context facts
- `configs/default.yaml` currently has NO `odds_provider` section; `load_bet_selection_config` reads `odds_provider.stale_line_minutes` with code default 180 (src/betting/recommendations.py).
- Existing `spi_lite:` block keys: rating_weight 0.55, current_full_weight_matches 10.0, max_rating_log_adjustment 0.70, lineup_log_scale 0.035, rest_log_scale 0.012, pace_weight 0.20, min_lambda 0.20, max_lambda 3.75. `SpiLiteBaseline.__init__` additionally takes `league_home_rate=1.25, league_away_rate=1.05` which are NOT config keys today (train/serve skew: backtest fits them per fold from train npxg, serving hardcodes defaults).
- Tests pass config as plain dicts; test_config_defaults.py asserts on the parsed YAML.

## Steps
1. Write failing tests in `tests/test_config_defaults.py`: load `configs/default.yaml` and assert the new keys below exist with these exact values.
2. Append to `default.yaml` (comment each block briefly, no em dashes in comments):

```yaml
odds_provider:
  stale_line_minutes: 180

# spi_lite: ADD two keys to the existing block (null means derive from training data and persist to the artifact)
#   league_home_rate: null
#   league_away_rate: null

threshold_tuning:
  edge_grid: [0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.10]
  confidence_grid: [0.0, 0.03, 0.05, 0.08, 0.10, 0.15]
  min_bets_per_cell: 8
  min_history_bets: 30
  rank_metric: roi_units

market_residual:
  enabled: true
  regularization_c: 1.0
  min_train_matches: 60

totals_model:
  enabled: true
  regularization_c: 1.0
  min_train_matches: 60
```

3. Add `league_home_rate: null` and `league_away_rate: null` INSIDE the existing `spi_lite:` block (do not duplicate the block).
4. Do not touch any other key. Do not reorder existing keys.

## Interface contract (produced)
- Config keys exactly as above. Consumers: packet 06 reads `spi_lite.league_home_rate/league_away_rate`; packet 07 reads `threshold_tuning.*`; packet 08 reads `market_residual.*`; packet 09 reads `totals_model.*`; recommendations.py picks up `odds_provider.stale_line_minutes` with no code change.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_config_defaults.py -q
```
Expected: all tests pass, including the new assertions. Then confirm nothing else broke:
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py
```
Expected: 0 failures.

## Done-signal
End your final message with exactly one line: `DONE: 01` or `DONE_WITH_CONCERNS: 01: <one line>` or `BLOCKED: 01: <one line>`.
