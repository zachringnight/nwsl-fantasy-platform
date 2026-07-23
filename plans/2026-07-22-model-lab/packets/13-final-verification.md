# Packet 13: final-verification

## Objective
Regenerate every consumer-facing output from the lab artifact, machine-verify the fail-closed invariants, and run the full verification suites. Execution-only.

## REVISED (post-review, 2026-07-22)
Review found the original `totals_never_official` check was a silent no-op: it tested `'market' in s` against a column that does not exist in the real `betting_slate.csv` (verified header below), so `s.get(...) if 'market' in s else True` always evaluated to `True` without ever inspecting the data — one of the plan's three declared "non-negotiable" invariants was not actually being checked. Fixed below with the real, verified column names.

## Files
- Run-only. Outputs: `nwsl-model/data/processed/predictions.csv`, `betting_slate.csv`, `season_game_database.sqlite`, `season_game_model_lines_results.csv`, `data/processed/web/*.json`, and `plans/2026-07-22-model-lab/verification_summary.json`.

## Steps (cwd: nwsl-model/ unless noted)
1. `python3 scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv --model champion_pure --output data/processed/predictions.csv`
2. `python3 scripts/generate_betting_slate.py --predictions data/processed/predictions.csv --days 14`
3. `python3 scripts/build_season_game_database.py --season 2026`
4. `python3 scripts/export_web.py --config configs/default.yaml --model-dir data/processed --output-dir data/processed/web`
5. Fail-closed invariant checks (hard asserts, write results into the summary). `betting_slate.csv`'s verified real columns (one row per match, not per bet): `match_id, match_date, home_team, away_team, gating_status, has_market_odds, market_is_fresh, pick_tier, actionable_pick, accepted_bet, bet_reason, model, model_version, model_family, confidence_score, confidence_band, official_pick_count, lean_bet_count, actionable_pick_count, accepted_bet_count, recommended_bets, recommended_leans, actionable_picks, top_pick_tier, rejected_bet_reasons, market_timestamp, market_sportsbook, market_type, market_types, market_age_minutes`. Per-bet market detail lives in the `recommended_bets`/`recommended_leans` semicolon-formatted strings (e.g. `"1x2_home@2.10(edge=0.040,stake=1.0); ..."`), NOT in a `market` column (that column does not exist):
```bash
python3 - <<'EOF'
import pandas as pd, json
p = pd.read_csv('data/processed/predictions.csv')
s = pd.read_csv('data/processed/betting_slate.csv')
checks = {}
# official picks only under passed gating
checks['no_official_without_passed'] = bool(
    p[(p.get('top_pick_tier') == 'official_pick')].empty
    or (p.loc[p.top_pick_tier == 'official_pick', 'gating_status'] == 'passed').all())
# slate: accepted bets require passed gating
checks['slate_accepted_requires_passed'] = bool(
    s[s.accepted_bet.astype(bool)].empty
    or (s.loc[s.accepted_bet.astype(bool), 'gating_status'] == 'passed').all())
# totals never official: inspect the actual per-bet market tokens inside recommended_bets
# for rows whose top_pick_tier is official_pick (fixed vs the original no-op check, which
# tested a 'market' column that does not exist on this file and always passed vacuously)
official_rows = s.loc[s.get('top_pick_tier', pd.Series(dtype=str)) == 'official_pick', 'recommended_bets']
checks['totals_never_official'] = bool(
    official_rows.empty
    or not official_rows.astype(str).str.contains('total', case=False, na=False).any())
assert all(checks.values()), checks
json.dump(checks, open('../plans/2026-07-22-model-lab/fail_closed_checks.json', 'w'), indent=2)
print('fail-closed checks:', checks)
EOF
```
   If a re-run of generate_betting_slate.py changes this schema, re-verify column names against the actual header before trusting this check; the three invariants themselves are non-negotiable. An all-no_bet slate passes trivially and is healthy.
6. Full python suite: `python3 -m pytest` (expect every test green; count will exceed 306 with the new lab tests).
7. TS suite (repo root): `pnpm test` then `pnpm typecheck` (node_modules present from packet 05).
8. `cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && git diff --check` (whitespace hygiene).
9. Write `plans/2026-07-22-model-lab/verification_summary.json`: {pytest: {passed, failed, duration_s}, vitest: {files_passed, tests_passed}, typecheck: pass/fail, fail_closed: checks dict, slate: {rows, accepted_bets, leans, no_bet}, artifact_version: 'lab2026-07-22'}.

## Failure policy
A red test or failed invariant is reported honestly with the output inline, DONE_WITH_CONCERNS (or BLOCKED if the suites cannot run at all). Never edit code or data to make a check pass; that is the next session's work.

## Verification
The summary file exists and pytest/vitest sections show zero failures:
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && python3 -c "import json; d=json.load(open('plans/2026-07-22-model-lab/verification_summary.json')); print(json.dumps(d, indent=1)); assert d['pytest']['failed']==0"
```

## Done-signal
End with exactly one line: `DONE: 13` / `DONE_WITH_CONCERNS: 13: <one line>` / `BLOCKED: 13: <one line>`.
