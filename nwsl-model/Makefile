# Run make from nwsl-model/. pythonpath is cwd-relative (pyproject.toml),
# and config paths (data.official_matches_dir etc.) assume this directory.

.PHONY: test test-fast refresh odds-poll backtest holdout slate policy-train policy-slate policy-settle

test:
	python3 -m pytest

test-fast:
	python3 -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py

# Data refresh stages 2-9 (ESPN pair runs from repo root via the TS pipeline
# and is not wrapped here; run it first: `cd .. && npx tsx scripts/fetch-espn-nwsl.ts
# && npx tsx scripts/generate-model-input.ts`). No Apify, no tokens needed.
refresh:
	python3 scripts/fetch_official_nwsl_data.py --season 2026
	python3 scripts/fetch_official_player_appearances.py --seasons 2025 2026
	python3 scripts/fetch_asa_data.py --seasons 2025 2026
	python3 scripts/rebuild_operational_features.py --season 2026
	python3 scripts/fetch_nwsl_availability.py
	bash scripts/poll_current_odds.sh
	python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models

odds-poll:
	bash scripts/poll_current_odds.sh

backtest:
	python3 scripts/backtest.py --config configs/default.yaml

holdout:
	python3 scripts/season_holdout.py --train-season 2025 --test-season 2026

slate:
	python3 scripts/generate_betting_slate.py --days 14

policy-train:
	python3 scripts/train.py --model team_ratings_only \
	  --output-dir data/processed/policy/nwsl-totals-open-over-v1/models

policy-slate:
	python3 scripts/generate_frozen_policy_slate.py --days 14

policy-settle:
	python3 scripts/settle_frozen_policy.py
