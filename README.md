# NWSL Fantasy

The home for NWSL fantasy football. Build private classic leagues with live snake drafts, compete in weekly and daily salary-cap contests, and follow every match window with real-time scoring.

## Features

- **Classic leagues** — Private season-long leagues with snake drafts, weekly head-to-head matchups, rolling waivers, and full commissioner control
- **Salary-cap contests** — Season-long, weekly, and daily salary-cap formats with shared player pools and clear lock windows
- **Live player board** — Real NWSL rosters with positions, salary pricing, projections, watchlists, and head-to-head compare
- **Draft room** — Real-time snake draft with queue management, autopick, and mobile-first layout
- **Matchday scoring** — Live scoring across finishing, creation, passing, defending, and goalkeeper actions
- **Lineup management** — Roster editing, autofill, and clear lock-time visibility before every slate

## Getting started

### Prerequisites

- Node.js 20.19+ or 24+
- pnpm 10+
- A Supabase project (for auth and data)

### Setup

```bash
pnpm install
cp .env.example .env.local
# Fill in your Supabase keys, database password, and any optional auth/email settings
pnpm prisma generate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Quick start

1. Create an account at `/signup`
2. Complete onboarding — pick your club and experience level
3. Create a league or join one with an invite code
4. Draft, set lineups, and follow live scoring from the dashboard

## Development

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Lint
pnpm typecheck    # Type check
```

## Tech stack

- **Framework** — Next.js 16 with App Router
- **Database** — PostgreSQL via Prisma 7
- **Auth** — Supabase Auth + Auth.js
- **Styling** — Tailwind CSS 4
- **Language** — TypeScript 5

## Environment variables

See `.env.example` for the full list. The key variables are:

| Variable | Purpose |
|---|---|
| `NEXTAUTH_URL` | Base URL for local and deployed Auth.js callbacks |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by the browser client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key for client auth and data access |
| `SUPABASE_SECRET_KEY` | Supabase secret key for server-side access |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js session secret |

The app reads Supabase config from environment variables. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are still accepted as compatibility fallbacks for older local setups.

## License

All rights reserved.
