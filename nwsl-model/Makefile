# Run make from nwsl-model/. pythonpath is cwd-relative (pyproject.toml),
# and config paths (data.official_matches_dir etc.) assume this directory.

UV ?= uv
PYTHON := $(UV) run python

.PHONY: test test-fast refresh odds-poll backtest holdout slate policy-train policy-slate policy-settle

test:
	$(PYTHON) -m pytest

test-fast:
	$(PYTHON) -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py

# Data refresh stages 2-9 (ESPN pair runs from repo root via the TS pipeline
# and is not wrapped here; run it first: `cd .. && npx tsx scripts/fetch-espn-nwsl.ts
# && npx tsx scripts/generate-model-input.ts`). No Apify, no tokens needed.
refresh:
	$(PYTHON) scripts/fetch_official_nwsl_data.py --season 2026
	$(PYTHON) scripts/fetch_official_player_appearances.py --seasons 2025 2026
	$(PYTHON) scripts/fetch_asa_data.py --seasons 2025 2026
	$(PYTHON) scripts/rebuild_operational_features.py --season 2026
	$(PYTHON) scripts/fetch_nwsl_availability.py
	bash scripts/poll_current_odds.sh
	$(PYTHON) scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models

odds-poll:
	bash scripts/poll_current_odds.sh

backtest:
	$(PYTHON) scripts/backtest.py --config configs/default.yaml

holdout:
	$(PYTHON) scripts/season_holdout.py --train-season 2025 --test-season 2026

slate:
	$(PYTHON) scripts/generate_betting_slate.py --days 14

policy-train:
	$(PYTHON) scripts/train.py --model team_ratings_only \
	  --output-dir data/processed/policy/nwsl-totals-open-over-v1/models

policy-slate:
	$(PYTHON) scripts/generate_frozen_policy_slate.py --days 14

policy-settle:
	$(PYTHON) scripts/settle_frozen_policy.py
