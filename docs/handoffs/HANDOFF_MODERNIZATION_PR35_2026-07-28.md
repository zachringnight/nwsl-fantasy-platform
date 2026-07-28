# NWSL Platform Modernization Handoff — PR #35

- **Date:** 2026-07-28
- **Canonical continuation:** [PR #35](https://github.com/zachringnight/nwsl-fantasy-platform/pull/35)
- **Branch:** `codex/nwsl-next-20260728`
- **Base:** `main`
- **Modernization baseline commit:** `518cf5279e8005754e46d0579d4620e989712045`
- **Clean worktree:** `/Users/zsoskin/Codex/work/nwsl-fantasy-next`

## Current status

PR #35 modernizes the web and model toolchains without changing prediction
policy, model thresholds, or provider authority. The Vercel check was green and
GitHub reported the PR mergeable when this handoff was written. Recheck both
before merging because provider and branch state can change.

The modernization has been implemented and locally verified:

- Node.js 24 LTS and pnpm 11 are declared in `.node-version`,
  `package.json`, and `pnpm-lock.yaml`.
- Next.js 16, React 19, Prisma 7, Tailwind CSS 4, Storybook 10, Vite 8,
  Vitest 4, and current compatible application dependencies are installed.
- Python 3.12 and a reproducible `uv.lock` now drive the model environment.
- Unused NextAuth packages and types were removed; the application continues
  to use Supabase Auth.
- Production dependency audit and peer dependency checks are clean.

## Immediate next action

- **Owner:** Zach or the next coder reviewing PR #35
- **Timing:** Before starting additional feature work

1. Recheck PR #35 checks and review its dependency/toolchain changes.
2. Merge only after the PR is green and approved.
3. Fetch the updated `origin/main`.
4. Create a new `codex/` branch and clean worktree from that updated main for
   the next feature slice.

Do not build new feature work directly on PR #35 or in the preserved dirty
worktree described below.

## Bootstrap

The clean worktree is already configured. From a new machine or worktree:

```bash
cd /Users/zsoskin/Codex/work/nwsl-fantasy-next
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
pnpm install --frozen-lockfile
cd nwsl-model
uv sync --extra dev
```

Use the checked-in `.node-version`, `.python-version`, `pnpm-lock.yaml`, and
`uv.lock` as the version sources of truth.

## Verification completed

These checks passed against the modernization branch before this handoff:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm peers check
pnpm audit --prod --audit-level high
cd nwsl-model && uv run python -m pytest -q
```

Results:

- TypeScript: passed.
- ESLint: 0 errors and 32 warnings.
- JavaScript tests: 357 passed.
- Production build: passed, including 44 static pages.
- Peer dependency check: clean.
- Production dependency audit: no known vulnerabilities.
- Python tests: 449 passed.
- Desktop and mobile browser smoke checks passed for `/` and `/analytics`,
  including navigation and console/overlay checks.

## Intentional compatibility choices

- TypeScript remains on 5.9.x because TypeScript 7 is outside the current
  `typescript-eslint` peer range.
- ESLint remains on 9.x because ESLint 10 is outside current React lint-plugin
  peer ranges.
- `@types/node` tracks Node 24.
- Supabase JS is pinned to the newest release accepted by pnpm's
  supply-chain-age policy at install time.
- `sharp` and `postcss` are overridden to patched releases.
- Existing effect-triggered loader architecture remains visible as ESLint
  warnings. It was not silently disabled or rewritten during the toolchain
  upgrade.

## Preserved local WIP — do not clean

The previous working directory remains intentionally dirty:

- **Path:** `/Users/zsoskin/NWSL/nwsl-fantasy-platform-main`
- **Branch:** `codex/local-analytics-predictions-wip-20260728`
- **Contents:** uncommitted analytics/prediction modifications and untracked
  files that were deliberately excluded from PR #35.

Do not reset, stash, delete, rebase in place, or bulk-copy that worktree.
After PR #35 merges, inventory its diff against fresh `origin/main`, then port
only still-needed changes onto a new clean branch/worktree. Check for overlap
with PRs #28, #30, #32, #33, and #34 before moving any file.

Likely follow-up areas are analytics instrumentation, prediction UI, public
data contracts, and migrations, but the dirty diff must be reviewed before
scope is chosen.

## Product and model invariants

Keep these lanes separate:

- General NWSL predictions are production SPI-lite data.
- The frozen DraftKings Over 2.5 policy is research-only.

PR #35 does not authorize model retuning or a change in data authority. The
frozen research policy requires exact, fresh, paired DraftKings total 2.5
quotes. FOX remains context only, API-Football remains shadow data, and no
provider substitution is allowed. A gated `NO RUN` or no-pick result is valid
when the required stop conditions are met.

## Environment and deployment boundaries

- The worktree's `.vercel` project link is local and ignored by Git.
- Production environment secrets were not pulled into this worktree.
- The local `.env.local` link contains only the existing Apify token; do not
  print or commit it.
- Authenticated Supabase and production-only flows require separately
  retrieving and verifying the correct environment configuration.
- A green Vercel preview proves the preview build completed; it is not proof
  that production was deployed or that authenticated production flows passed.

## Open items and risks

- Recheck PR checks immediately before merge.
- Review the 32 non-blocking ESLint warnings when touching the affected
  loader/effect code; do not normalize new warnings.
- Keep the intentional TypeScript, ESLint, Node type, and Supabase pins until
  their peer/supply-chain constraints change.
- Do not clean legacy worktree metadata or the preserved WIP as part of this
  handoff.
- Production-authenticated and live Supabase flows remain a separate
  verification step.

## Do not redo

Dependency enumeration, peer-resolution work, security audit remediation, the
full JavaScript and Python test suites, the production build, and public-route
desktop/mobile browser smoke checks have already been completed for PR #35.
Repeat them only when the branch changes or as required by review.
