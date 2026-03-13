# NWSL Fantasy Platform

Planning-output repo plus a working hosted implementation for an NWSL fantasy product with a full classic draft path and salary-cap-ready league modes.

This project now contains:
- the original planning prompt chain in `docs/planning`
- concrete output documents for Steps 1-10 in `docs/outputs`
- a working Next.js / Prisma / Auth.js scaffold aligned to those decisions
- a Phase 1 hosted flow for signup, onboarding, create league, join league, and dashboard persistence
- an early Phase 2 draft and roster loop backed by hosted draft, queue, and roster data

## What is implemented

### Product documentation

- `docs/outputs/00-master-context-v2.md`
- `docs/outputs/01-product-strategy.md`
- `docs/outputs/02-competitive-teardown.md`
- `docs/outputs/03-information-architecture.md`
- `docs/outputs/04-core-user-flows.md`
- `docs/outputs/05-ux-design-system.md`
- `docs/outputs/06-game-mechanics.md`
- `docs/outputs/07-technical-architecture.md`
- `docs/outputs/08-screen-specs.md`
- `docs/outputs/09-build-plan.md`
- `docs/outputs/10-implementation-scaffold.md`

### Code scaffold

- App Router route tree for public, auth, dashboard, league, draft, matchup, player, settings, and help flows
- Shared component system organized by domain
- Design tokens in TypeScript and JSON
- Prisma 7 schema plus generated client
- Auth.js integration shell
- Provider abstraction with an API-Football adapter stub
- Background job definitions for ingest, scoring, waivers, matchups, and notifications

### Phase 1 hosted mode

- Hosted guest session creation with Supabase Auth
- Persisted onboarding state in `fantasy_profiles`
- Commissioner league creation with generated join codes in `fantasy_leagues`
- Invite-code league joining from typed code or deep link through hosted membership records
- Dashboard and league home routes backed by shared Supabase data

### Phase 2 foundation

- Hosted draft lobby with revealed snake order and commissioner controls
- Live draft room backed by `fantasy_drafts`, `fantasy_draft_picks`, `fantasy_draft_queue_items`, and `fantasy_roster_slots`
- Queue-first autopick support and roster population during draft
- Team editor with hosted lineup slot assignment and autofill
- League creation presets for classic season-long, season-long salary cap, weekly salary cap, and daily salary cap
- League-level contest metadata and salary-aware player browsing for future season-long salary cap and weekly or daily salary-cap variants

### Phase 3 foundation

- Hosted standings route for classic leagues with deterministic seeded results based on current roster state
- Hosted matchup route for classic leagues with seeded pregame, live, and final states that reuse the same roster simulation as standings
- Rolling-priority waiver claims stored in `fantasy_waiver_claims`
- Hosted transaction history stored in `fantasy_transactions`
- Hosted salary-cap entry builder with saved shared-pool slot assignments, explicit submission, reopen-before-lock behavior, and lock enforcement under the league cap
- Commissioner-triggered waiver processing for the current preview phase
- Salary-cap leagues explicitly gated away from classic waivers, standings, and head-to-head matchup flows into mode-appropriate messaging

## Important paths

### Planning inputs

- `docs/planning`

### Planning outputs

- `docs/outputs`

### App routes

- `src/app`

### Components

- `src/components/common`
- `src/components/draft`
- `src/components/league`
- `src/components/lineup`
- `src/components/matchup`
- `src/components/player`

### Data and infrastructure

- `prisma/schema.prisma`
- `src/lib/prisma.ts`
- `src/lib/auth.ts`
- `src/providers/contracts/fantasy-data-provider.ts`
- `src/providers/api-football/api-football-provider.ts`
- `src/jobs`

## Environment variables

Copy `.env.example` to `.env` or `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-publishable-key"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nwsl_fantasy"
AUTH_SECRET="replace-with-a-long-random-string"
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_EMAIL_FROM="hello@example.com"
AUTH_EMAIL_SERVER="smtp://username:password@smtp.example.com:587"
API_FOOTBALL_BASE_URL="https://v3.football.api-sports.io"
API_FOOTBALL_KEY=""
```

The Supabase values are required for the current live Phase 1 app.

The Prisma, Auth.js, and provider variables remain in the scaffold for later phases that add durable account auth, server workflows, and external data ingestion.

## Local development

The current Phase 1 flow is hosted, not browser-local. You need the two `NEXT_PUBLIC_SUPABASE_*` variables above to create a session, save onboarding, and create or join leagues.

```bash
pnpm install
pnpm prisma generate
pnpm dev
```

Open `http://localhost:3000`.

Test path:

1. Start a hosted guest session at `/signup`
2. Complete onboarding
3. Create a league or join one via `/leagues/join?code=YOURCODE`
4. Open `/dashboard` to see shared hosted league state

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm prisma validate
pnpm prisma generate
```

## Route overview

Implemented public and authenticated routes include:

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/onboarding`
- `/dashboard`
- `/leagues`
- `/leagues/create`
- `/leagues/join`
- `/leagues/[leagueId]`
- `/leagues/[leagueId]/draft`
- `/leagues/[leagueId]/draft/room`
- `/leagues/[leagueId]/draft/recap`
- `/leagues/[leagueId]/team`
- `/leagues/[leagueId]/matchup`
- `/leagues/[leagueId]/players`
- `/leagues/[leagueId]/standings`
- `/leagues/[leagueId]/transactions`
- `/leagues/[leagueId]/settings`
- `/players`
- `/players/[playerId]`
- `/players/compare`
- `/rules`
- `/help`
- `/settings`
- `/notifications`
- `/admin`

## Current status

The repo now has a real hosted account-to-league flow, an early hosted Phase 2 draft and lineup loop, and a Phase 3 foundation for seeded standings, matchup storytelling, rolling-priority waivers, and a saved salary-cap entry builder with submit and lock rules. It is still not a finished production app: durable account auth, provider ingestion, real fixture scoring, and broader in-season operations still need later implementation phases. The current fully playable launch path is still classic season-long snake draft, while salary-cap leagues now create cleanly, route correctly, and preserve the architecture needed for later season-long and weekly or daily contest-entry builds.
