# NWSL Fantasy Platform - Codex operating guide

## Source of truth

- Canonical checkout: `/Users/zsoskin/NWSL/nwsl-fantasy-platform-main`
- GitHub repository: `zachringnight/nwsl-fantasy-platform`
- Default branch: `main`
- Workspace router: `/Users/zsoskin/NWSL/README.md`

This repository contains both the Next.js fantasy product and the Python model
lab. Do not create another permanent NWSL clone or a `next` directory. Use a
short-lived branch for normal work. Use a linked worktree only when branch
isolation is necessary, and preserve or merge its unique work before removal.

At the start of every task:

1. Resolve the checkout with `pwd -P`.
2. Run `bash scripts/check-codex-project.sh`.
3. Inspect `git status --short` and preserve unrelated user changes.
4. Read the closest README or current plan for the surface being changed.

## Repository map

| Path | Role |
|---|---|
| `src/`, `scripts/`, `prisma/` | Next.js product, jobs, and database schema |
| `nwsl-model/` | Standalone Python model, data, tests, and publishing scripts |
| `docs/` | Product and technical reference |
| `plans/` | Dated implementation and evidence plans |
| `nwsl-model/data/evidence/` | Checksummed retained model/run evidence |

`CLAUDE.md` remains useful shared repository guidance. Do not edit it as part
of Codex setup work unless Zach explicitly asks.

## Toolchains and commands

The web application requires Node 24 and pnpm 11. The system default Node may
be newer, so prefer:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
pnpm typecheck
pnpm test
pnpm build
```

Run Python commands only from `nwsl-model/`; its imports and data paths are
working-directory relative:

```bash
cd nwsl-model
uv sync --extra dev
uv run pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py
uv run pytest
uv run ruff check .
```

Use targeted checks while implementing. Before a pull request, run the checks
appropriate to every changed surface. Treat local checks, GitHub CI, merge,
deployment, and production readback as separate gates.

## Model and data safety

- Never delete `nwsl-model/data/raw/matches.csv`.
- Never run `scripts/train.py --build-dataset`.
- Run model commands from `nwsl-model/`, never from the repository root.
- Filter odds by `source_type` before interpreting timestamps: `open`,
  `current`, and `close` have different meanings.
- General SPI-lite predictions and the frozen totals policy are separate lanes.
- Do not change the frozen policy, thresholds, stake controls, source contract,
  or promotion state without Zach's explicit approval.
- Frozen-policy evidence is exact fresh paired DraftKings totals only. FOX is
  context-only and API-Football is shadow-only. Never infer or substitute a
  missing price.
- A valid no-bet is a healthy result.
- For matchday execution, use only:

  ```bash
  cd nwsl-model
  bash scripts/run_matchday_refresh_if_scheduled.sh
  ```

  A no-match exit is a successful no-run. Do not invoke provider, model, or
  publishing components separately to bypass the schedule gate.
- Do not represent a publication as complete without its required success
  markers and authenticated readback.

The preserved opening-line worktree at
`/Users/zsoskin/.codex/worktrees/nwsl-opening-line-validation` is rollback
evidence, not a second active project. Do not modify or retire it unless the
task specifically covers that evidence and its retirement gate.

## Secrets, communication, and releases

Keep runtime values in gitignored `.env.local` files, environment variables,
Keychain, or the linked deployment service. Never print or commit tokens,
keys, OAuth data, database URLs, publishing secrets, or provider payloads that
contain credentials. `.env.example` is the variable-name contract.

Default to no-send for email, chat, or other outbound communication. Do not
publish, deploy, merge, or mutate external data unless the current task
authorizes that action. For release work:

1. Start from current `origin/main`.
2. Keep generated runtime changes separate from source changes.
3. Verify locally in proportion to risk.
4. Push or open a pull request only when authorized.
5. Confirm CI and production state before claiming either is live.
