# NWSL Betting Model

A production-ready NWSL betting model for sides and totals using a joint 90-minute score prediction framework.

## Overview

This model predicts the full regulation-time scoreline distribution P(home_goals = i, away_goals = j) and derives all betting markets from a single score matrix:

- **1X2** (match result) probabilities
- **Draw no bet** prices
- **Asian handicaps** (quarter, half, and whole lines: +/-0.25 through +/-1.5)
- **Totals / over-under** (1.5 to 4.5, including quarter lines like 2.25, 2.75)
- **BTTS** (both teams to score)

### Models

Two joint score models are implemented and benchmarked:

1. **Dynamic Dixon-Coles**: Independent Poisson with low-score correction (rho parameter), recency-weighted MLE
2. **Dynamic Bivariate Poisson**: Bivariate Poisson likelihood with shared scoring component (lambda3), capturing positive score dependence

Both use:
- Exponentially decayed recency weighting
- Dynamic team attack/defense ratings driven by npxG
- Home advantage parameter
- Contextual covariate support
- Market probability blending with configurable alpha

## Setup

### Requirements

- Python 3.11+
- Dependencies listed in `pyproject.toml`

### Installation

```bash
cd nwsl-model
pip install -e ".[dev]"
```

Or install dependencies directly:

```bash
pip install pandas numpy scipy scikit-learn statsmodels pydantic pyyaml matplotlib pyarrow pytest
```

## Data

Place your data files in `data/raw/`:

| File | Required | Description |
|------|----------|-------------|
| `matches.csv` | Yes | Match results with goals and xG |
| `odds.csv` | No | Market odds (open/close) |
| `venues.csv` | No | Stadium coordinates for travel |
| `appearances.csv` | No | Player appearance data |
| `projected_lineups.csv` | No | Projected lineups |

The model runs with graceful degradation when optional tables are missing.

### Matches schema (minimum required columns)

```
match_id, match_date, season, home_team, away_team, home_goals_90, away_goals_90
```

Recommended additional columns: `home_npxg`, `away_npxg`, `home_xg`, `away_xg`, `regular_season_flag`, `match_status`

See `src/data/schemas.py` for full column definitions.

## Usage

### 1. Train models

```bash
python scripts/train.py --config configs/default.yaml
python scripts/train.py --config configs/default.yaml --model dixon_coles
python scripts/train.py --config configs/default.yaml --model bivariate_poisson
```

Outputs model artifacts to `data/processed/models/`.

### 2. Generate predictions

```bash
python scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv
python scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv --model bivariate_poisson
```

Outputs per-match predictions with score matrices, fair odds, edges, and bet recommendations.

### 3. Run backtest

```bash
python scripts/backtest.py --config configs/default.yaml
python scripts/backtest.py --config configs/default.yaml --models dixon_coles bivariate_poisson full_blend
```

Uses expanding-window time splits only (no random splits). Outputs:
- Fold-level and aggregate metrics
- Bet log with settlement
- Calibration plots
- CLV report

### 4. Evaluate

```bash
python scripts/evaluate.py --backtest-dir data/processed/backtest --plots
```

Generates calibration plots, ROI charts, and benchmark comparison tables.

## Configuration

All parameters are controlled via `configs/default.yaml`:

- **Team ratings**: Half-life, shrinkage, season carryover
- **Dixon-Coles**: Rho bounds, home advantage init
- **Bivariate Poisson**: Lambda3 bounds
- **Market blend**: Alpha schedule by matches played
- **Betting**: Min edge, Kelly fraction, max stake
- **Backtest**: Min training matches, step size

## Architecture

```
src/
  data/          # Schemas, loaders, validation, transforms
  features/      # Match, schedule, travel, weather, lineup, market features
  models/        # Base model, Dixon-Coles, bivariate Poisson, team ratings,
                 # lineup adjustment, market blend, calibration
  betting/       # Score matrix, market derivation, settlement, staking, CLV
  backtest/      # Expanding-window splitter, runner, metrics, reports
  utils/         # Logging, dates, math utilities, I/O
```

### Key design decisions

- **One joint model**: All markets derive from a single score matrix per match
- **npxG-driven ratings**: Team strength comes from non-penalty expected goals, not raw goals
- **No hardcoded teams**: Dynamic team discovery; expansion teams get league-average priors
- **Exponential decay v1**: Designed for later upgrade to state-space / Bayesian random-walk
- **Graceful degradation**: Missing data tables produce warnings, not crashes

## Testing

```bash
cd nwsl-model
pytest tests/ -v
```

Tests cover:
- Score matrix validity (non-negative, sums to 1)
- De-vig math correctness
- Quarter-line settlement logic
- Expanding-window split correctness and no-leakage guarantees
- Derived market probabilities summing correctly
- Bivariate Poisson likelihood sanity
- Dixon-Coles low-score correction behavior

## Backtest methodology

- **Expanding window only**: Each fold trains on all prior data, predicts only future matches
- **No random splits**: Strict temporal ordering
- **No leakage**: No future odds, injuries, or lineups used before their availability timestamp
- **Benchmarks**: Market implied, Dixon-Coles, bivariate Poisson, full model + market blend
- **Metrics**: Log loss, Brier score, CRPS, calibration error, ROI, hit rate, CLV, mean edge

## Staking

- Fractional Kelly criterion (default 0.25x Kelly)
- Minimum edge threshold (default 2%)
- Maximum stake cap (default 1% of bankroll)
- Sides and totals reported separately
- Quarter-line settlement matches actual sportsbook behavior
