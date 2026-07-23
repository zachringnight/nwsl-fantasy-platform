# Packet 12: docs-organization

## Objective
Make the repo self-explanatory for future AI coders: a checked-in root CLAUDE.md with the load-bearing facts, a real nwsl-model README, a Makefile that encodes the cwd-sensitive commands, and handoff docs moved into docs/. Lean: four files plus moves, no doc sprawl.

## Files
- Create: `CLAUDE.md` (repo root, checked in)
- Create: `nwsl-model/README.md`
- Create: `nwsl-model/Makefile`
- Create: `docs/README.md`
- Move (git mv): `HANDOFF_NWSL_MODEL_2026-05-25.md`, `HANDOFF_NWSL_MODEL_2026-05-28.md` -> `docs/handoffs/`
- Organize: whatever sits in `nwsl-model/docs/` gets an entry in docs/README.md (leave files in place)

## Content requirements
Root `CLAUDE.md` (aim under 80 lines, dense, no em dashes anywhere):
- Repo map: Next.js/TS app at root (src/, scripts/), Python model package at nwsl-model/, plans/ for run plans, docs/ for handoffs.
- The commands block: pnpm install / pnpm test / pnpm typecheck from root; python3 -m pytest from nwsl-model/ ONLY (pythonpath is cwd-relative); fast loop flags.
- The four sharp edges, verbatim rules: (1) never run train.py --build-dataset or delete matches.csv (ESPN vs nwsl:: ID namespaces; odds.csv would be orphaned); (2) all Python pipeline commands run from nwsl-model/; (3) odds.csv timestamp semantics depend on source_type, filter first; (4) tokens live in gitignored .env.local, never print or commit them.
- Fail-closed philosophy one-liner: official picks require gating_status passed; slate requires fresh current odds; totals suppressed until validated; no_bet everywhere is a valid healthy state.
- Data refresh runbook pointer to nwsl-model/README.md and Makefile targets.

`nwsl-model/README.md` (aim under 150 lines):
- Package map (scripts/, src/ subpackages one line each, tests, configs).
- Pipeline stages with exact commands: refresh (ESPN TS pair, official, appearances, ASA, availability, FoxSports), train, backtest, evaluate, tune_betting_thresholds, evaluate_totals_model, promote, season_holdout, predict, slate, season db, export_web.
- Data contracts: matches/upcoming/odds/appearances/projected_lineups column lists (copy from src/data/schemas.py and the odds contract).
- Model registry semantics: PURE_MODELS vs baselines vs market_residual, champions.json aliases, baseline_fallback vs baseline_promoted, gates summary (pure gates and the baseline gate incl. the OOS evidence requirement).
- The same four sharp edges.

`nwsl-model/Makefile` targets (each just wraps the exact commands, honoring cwd):
- `test` (full pytest), `test-fast` (ignore slow files), `refresh` (stages 2-9 of the data refresh, minus Apify), `backtest`, `holdout`, `slate`. Comment at top: run make from nwsl-model/.

`docs/README.md`: one-paragraph index: handoffs/ (dated model handoffs), pointer to plans/ and to the two READMEs.

## Constraints
- Use git mv for the moves so history follows.
- No em dashes in any file. Short sentences. Do not restate code that will drift; prefer pointers to files.
- Do not invent commands; copy them from the packets and discovery-verified commands (they are in plans/2026-07-22-model-lab/packets/, readable from this repo).
- Facts must match the post-lab state (packets 06-09 landed): mention tune_betting_thresholds and evaluate_totals_model.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && ls CLAUDE.md nwsl-model/README.md nwsl-model/Makefile docs/README.md docs/handoffs/HANDOFF_NWSL_MODEL_2026-05-28.md && grep -c $'—' CLAUDE.md nwsl-model/README.md docs/README.md | (! grep -v ':0')
```
Expected: all files listed, zero em dashes. Then `cd nwsl-model && make test-fast` runs the fast pytest loop green.

## Done-signal
End with exactly one line: `DONE: 12` / `DONE_WITH_CONCERNS: 12: <one line>` / `BLOCKED: 12: <one line>`.
