# Packet 05: data-refresh-exec

## Objective
Refresh all model inputs through yesterday (2026-07-21): completed results, fixtures, official player appearances (INCLUDING actually rewriting `data/raw/appearances.csv`, not just the nwsl-official logs), ASA xG, availability, and current FoxSports totals. Execution-only: run existing scripts in the correct order; write no source code.

## REVISED (post-review, 2026-07-22)
Review found the original step list refreshed `data/nwsl-official/nwsl_*_official_player_match_logs.csv` but never rebuilt `data/raw/appearances.csv` itself — the only other writer of that file is `dataset_builder.build_dataset` via the FORBIDDEN `--build-dataset` path. Verified fix: `src/data/dataset_builder.py::build_appearances(repo_root) -> pd.DataFrame` is a **pure, non-destructive** function — it reads only `data/nwsl-official/nwsl_*_official_player_match_logs.csv` (+ optional player_profiles.csv for position backfill) and returns a fresh appearances frame. It does NOT touch `matches.csv` or `odds.csv` and does NOT depend on `--build-dataset`. Call it directly (step 5b below) to safely rebuild `appearances.csv` after the official logs refresh.

## Files
- Run-only. Data outputs: `nwsl-model/data/raw/*`, `data/nwsl-official/*`, `src/data/espn/*.json`, audit under the latest version dir.

## Hard cautions
- NEVER run `train.py --build-dataset` and never delete `nwsl-model/data/raw/matches.csv` (missing file auto-triggers a rebuild with nwsl:: ids that orphans every ESPN-keyed odds row).
- Never print or commit tokens. This packet needs NO tokens (skip all Apify fetches).
- `generate-model-input.ts` clobbers `dataset_manifest.json` odds fields to 100 percent missing; step 8 repairs them.

## Steps (exact order, exact cwd)
1. `cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm install` (node_modules is absent; pnpm-lock.yaml is the lockfile).
2. `npx tsx scripts/fetch-espn-nwsl.ts` (repo root; ESPN scoreboard windows are hardcoded through 20261201 so today's results are covered).
3. `npx tsx scripts/generate-model-input.ts` (splits into matches.csv completed + upcoming.csv scheduled).
4. `cd nwsl-model && python3 scripts/fetch_official_nwsl_data.py --season 2026`
5. `python3 scripts/fetch_official_player_appearances.py --seasons 2025 2026` (packet 02 fixed the schema; runs AFTER matches.csv refresh so new matches crosswalk).
5b. Rebuild `data/raw/appearances.csv` from the refreshed official logs (pure, non-destructive; does NOT touch matches.csv/odds.csv):
    `python3 -c "from pathlib import Path; from src.data.dataset_builder import build_appearances; df = build_appearances(Path('.')); df.to_csv('data/raw/appearances.csv', index=False); print('appearances.csv rows:', len(df))"`
6. `python3 scripts/fetch_asa_data.py --seasons 2025 2026` (also re-patches manifest xG keys).
7. `python3 scripts/fetch_nwsl_availability.py`
8. `python3 scripts/fetch_foxsports_odds.py --days 14` (plain HTTP current totals; also exercises the odds manifest updater). Then repair the manifest odds fields explicitly:
   `python3 -c "import pandas as pd; from src.odds.apify_footystats import update_dataset_manifest_odds; update_dataset_manifest_odds('data/raw/dataset_manifest.json', pd.read_csv('data/raw/odds.csv'))"`
9. `python3 scripts/append_odds_snapshot.py --incoming data/raw/odds.csv --snapshot data/raw/odds_snapshots.csv`
10. Audit against the latest existing artifact dir:
    `python3 scripts/audit_model_inputs.py --config configs/default.yaml --artifact-root data/processed/models`
11. Report, in your final message: new matches.csv row count and max match_date, upcoming.csv count, appearances.csv row count before/after step 5b and completed-match coverage pct from the audit, and the audit's open issues list.

## Failure policy
Each fetch is best-effort: if one source fails (network, markup change), continue with the rest, and report exactly what failed and what data is stale as a DONE_WITH_CONCERNS. BLOCKED only if the ESPN refresh itself fails (everything downstream keys on matches.csv).

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -c "
import pandas as pd
m = pd.read_csv('data/raw/matches.csv'); u = pd.read_csv('data/raw/upcoming.csv')
assert m['match_date'].max() >= '2026-07-15', m['match_date'].max()
past_in_upcoming = (u['match_date'] < '2026-07-22').sum()
if past_in_upcoming:
    print(f'NOTE: {past_in_upcoming} past-dated rows remain in upcoming.csv (likely postponed/rescheduled fixtures, not a failure)')
print('matches:', len(m), 'through', m['match_date'].max(), '| upcoming:', len(u))"
```
Expected: assertion on matches.csv freshness passes (roughly 150+ completed 2026 matches total: 85 as of May 24 plus ~2 months of play). A nonzero past-dated upcoming count is a note, not a failure — NWSL postponements legitimately leave past-dated rows in scheduled status.

## Done-signal
End with exactly one line: `DONE: 05` / `DONE_WITH_CONCERNS: 05: <one line>` / `BLOCKED: 05: <one line>`.
