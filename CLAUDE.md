# NWSL Fantasy Platform + Model Lab

Repo map:
- Repo root: Next.js/TS app (`src/`, `scripts/`, Prisma, Vitest).
- `nwsl-model/`: standalone Python betting-model package (scripts/, src/, tests/, configs/).
- `plans/`: dated run plans for multi-agent execution (e.g. `plans/2026-07-22-model-lab/`).
- `docs/`: handoffs and reference docs, see `docs/README.md`.

## Commands

Root (TS/JS), run from repo root:
```bash
pnpm install
pnpm test        # vitest run
pnpm typecheck    # tsc --noEmit
```

Python model package, run from `nwsl-model/` ONLY. `pythonpath = ["."]` in
`pyproject.toml` and `data.official_matches_dir` in configs are cwd-relative,
so running from the repo root silently breaks imports and data paths.
```bash
cd nwsl-model
python3 -m pytest                # full suite
python3 -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py   # fast loop
```
See `nwsl-model/README.md` and `nwsl-model/Makefile` for the full pipeline
(train, backtest, evaluate, tune thresholds, totals model, promote, holdout,
predict, slate, season db, web export).

## Sharp edges

1. Never run `python3 scripts/train.py --build-dataset` and never delete
   `nwsl-model/data/raw/matches.csv`. Matches are ESPN-keyed; a missing file
   auto-triggers a rebuild with `nwsl::`-namespaced ids that orphans every
   row in `odds.csv` (which is keyed to the ESPN ids).
2. All Python pipeline commands run from `nwsl-model/`, never from repo root.
3. `odds.csv` is wide: `[match_id, timestamp, sportsbook, market_type, line,
   home_odds, draw_odds, away_odds, over_odds, under_odds, source_type]`.
   `source_type` changes what `timestamp` means: `close` = kickoff-stamped
   consensus, `current` = wall-clock capture, `open` = opening line. Always
   filter on `source_type` before reading `timestamp`.
4. Tokens (`APIFY_TOKEN`, `THE_ODDS_API_KEY`) live only in gitignored
   `.env.local` files. Never print or commit them.

## Fail-closed philosophy

Official picks require `gating_status == 'passed'`. The betting slate forces
`accepted_bet = False` without fresh current odds. Totals stay suppressed
(`official_picks_enabled: false`) until a totals model passes validation.
`no_bet` everywhere is a valid, healthy end state, not a failure.

## Data refresh

For the data-refresh runbook (ESPN fetch, official appearances, ASA xG,
availability, FoxSports odds, manifest repair, audit), see
`nwsl-model/README.md` (Pipeline stages -> refresh) and the `refresh` target
in `nwsl-model/Makefile`.
