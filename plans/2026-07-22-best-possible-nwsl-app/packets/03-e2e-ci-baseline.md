# Task 03: CI, local Supabase, and browser E2E baseline

**Wave:** 1

**Depends on:** none

## Files

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `e2e/public-hub.spec.ts`
- Create: `e2e/fantasy-activation.spec.ts`
- Create: `e2e/helpers/fantasy-fixtures.ts`
- Create: `scripts/test/seed-e2e.ts`
- Create: `.github/workflows/ci.yml`

## Interfaces

- Produces:
  - `seedE2eLeague(options: { managers: number; variant: FantasyGameVariant }): Promise<E2eLeagueFixture>`
  - `resetE2eFixture(fixtureId: string): Promise<void>`
  - npm scripts `test:e2e`, `test:e2e:ui`, `ci:release`.

## Test boundary

- Unit and component tests run with Vitest.
- E2E tests run against local Supabase and a production build.
- Preview smoke tests are read-only.
- Production smoke tests use public pages and a pre-created synthetic internal league. They do not create arbitrary public users.

## Steps

- [ ] Add `@playwright/test` and browser installation instructions.
- [ ] Add a local Supabase seed that creates two users, one private league, a completed draft, one legal lineup, one slate, and one submitted free-to-play entry.
- [ ] Cover public player, team, schedule, and match navigation.
- [ ] Cover signup-to-onboarding, create/join league, draft room load, lineup save, and contest entry save.
- [ ] Add CI jobs for unit tests, typecheck, lint, build, and E2E against local Supabase.
- [ ] Persist Playwright traces and screenshots only on failure.
- [ ] Ensure CI never receives production service-role credentials.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm ci:release`

Expected: unit tests, typecheck, lint, production build, and Playwright E2E all pass in one command.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if a clean checkout can run the full gate. `BLOCKED` only if the local Supabase CLI cannot start after three documented attempts.
