# Plan Status and Restart Checklist

## Current state

- Planning package: complete.
- Product implementation from this package: not started.
- Repository baseline reviewed: `main` at `58c2094` on July 22, 2026.
- Package validation: 19 tasks, 19 packets, 9 waves, and 51 dependency edges passed structural validation.
- Scope of this release: documentation and handoff material only.

The baseline commit is a historical anchor, not a permanent starting point. A future execution run must compare current `main` with this plan before editing code.

## Locked decisions

- Build an NWSL-specific, fantasy-first product.
- Use canonical public player, team, schedule, standings, and match routes as the acquisition layer.
- Make private classic leagues the primary retention loop.
- Treat salary-cap play as free-to-play contests with a first-class `contest_id`.
- Keep Supabase as the production data and fantasy backend.
- Use official NWSL data first and ESPN only as an explicit fallback for supported fields.
- Persist source, season, freshness, fallback, approximation, and scoring-version metadata.
- Keep Vercel preview deployments enabled.
- Preserve existing basketball code and reference material.
- Do not add real-money play, payments, wallets, or betting execution.
- Do not include an authentication or RLS redesign in this roadmap.

## Repository evidence behind the plan

- Public analytics routes currently live under `src/app/(analytics)/analytics/`.
- Canonical fantasy player routes currently use `src/app/players/[playerId]/`.
- `src/lib/analytics/analytics-data.ts` still returns empty player match-log and form arrays.
- `src/lib/analytics/events.ts` does not send production events to an analytics provider.
- Draft autopick exists in `src/lib/fantasy-api.ts`, but automatic timer enforcement remains a documented deployment follow-up.
- Fantasy scoring, settlements, notifications, social, and admin migrations already exist under `supabase/migrations/`.
- The existing salary-cap system is league-shaped and predates the roadmap's first-class contest boundary.
- Existing Vercel and player-card motion releases are already on `main` and are inputs to this plan, not work to remove.

## Assumptions to refresh

Before implementation, verify:

- The active NWSL season and provider contracts.
- Official data access, licensing, rate limits, and historical coverage.
- Current Supabase schema and the latest migration timestamp.
- Current Vercel project link, environments, preview behavior, and production domain.
- Current public route behavior and search indexing.
- Current scoring rule version.
- Browser and device support targets.
- Notification provider choice and operating budget.
- Rights to player images, team marks, and official-affiliation language.

## Restart checklist

1. Pull the latest `main`.
2. Confirm the worktree is clean or isolate unrelated changes.
3. Re-run the repository test, lint, typecheck, and production build gates.
4. Compare the current schema and routes with the task index in `manifest.md`.
5. Update packet file paths only when the codebase has materially moved.
6. Record any changed product decision before implementation.
7. Execute packet 01 and its done-check.
8. Integrate and verify each wave before starting the next one.

## Ownership

- Product scope and rights decisions: Zach.
- Technical implementation and packet reporting: future execution runner.
- Provider credentials and infrastructure access: repository owner.
- Final merge and production release: Zach or an explicitly authorized runner.
