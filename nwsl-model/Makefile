# Run make from nwsl-model/. pythonpath is cwd-relative (pyproject.toml),
# and config paths (data.official_matches_dir etc.) assume this directory.

.PHONY: test test-fast refresh backtest holdout slate

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
	python3 -c "from pathlib import Path; from src.data.dataset_builder import build_appearances; \
	  build_appearances(Path('.')).to_csv('data/raw/appearances.csv', index=False)"
	python3 scripts/fetch_asa_data.py --seasons 2025 2026
	python3 scripts/fetch_nwsl_availability.py
	python3 scripts/fetch_foxsports_odds.py --days 14
	python3 -c "from pathlib import Path; import pandas as pd; from src.odds.apify_footystats import update_dataset_manifest_odds; \
	  update_dataset_manifest_odds(Path('data/raw/dataset_manifest.json'), pd.read_csv('data/raw/odds.csv'))"
	python3 scripts/append_odds_snapshot.py --incoming data/raw/odds.csv --snapshot data/raw/odds_snapshots.csv
	python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models

backtest:
	python3 scripts/backtest.py --config configs/default.yaml

holdout:
	python3 scripts/season_holdout.py --train-season 2025 --test-season 2026

slate:
	python3 scripts/generate_betting_slate.py --days 14
