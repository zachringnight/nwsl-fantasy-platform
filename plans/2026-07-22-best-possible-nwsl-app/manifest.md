# Best Possible NWSL Fantasy App Plan

**Goal:** Build the most trusted and enjoyable NWSL fantasy product: a premium public league intelligence hub, a reliable private-league game, free-to-play salary-cap contests, and a live matchday experience where every fantasy score is traceable to real NWSL events.

**Architecture:** Supabase becomes the normalized source of truth for public NWSL entities, match events, fantasy scoring, contests, and job history. Provider adapters ingest official NWSL data first and use ESPN only for documented fallback fields. Next.js App Router serves cached public read models and authenticated fantasy workflows. Supabase Realtime powers live match and fantasy updates. Supabase Cron and Edge Functions run minute-sensitive jobs. Vercel previews remain the release gate and production deploys only after tests, build, preview QA, and canonical-domain verification.

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase Postgres/Auth/Realtime/Edge Functions/Cron, Vercel, Vitest, Playwright, PostHog, Vercel Web Analytics and Speed Insights.

## Product decision

The product is fantasy-first and NWSL-specific.

- Public player, team, schedule, match, standings, and model pages are acquisition and education surfaces.
- Private classic leagues are the primary retention loop.
- Salary-cap contests are free-to-play. No deposits, withdrawals, cash prizes, gambling settlement, or wallet system.
- Match predictions remain clearly labeled model research. They do not become betting recommendations.
- The app does not claim official NWSL licensing without written approval.

## Success measures

- Data freshness: scheduled matches within 15 minutes, live events within 90 seconds, final fantasy scores within 10 minutes of official final.
- Reliability: zero duplicate draft picks, zero cross-contest score leakage, scoring correction rate below 0.1 percent.
- Activation: 60 percent of completed signups create or join a league in the same session.
- Weekly retention: 70 percent of managers in active leagues submit a legal lineup before lock.
- Matchday: 50 percent of active managers open matchup or live match center during a scoring window.
- Performance: mobile p75 LCP below 2.5 seconds, INP below 200 milliseconds, CLS below 0.1.
- Accessibility: WCAG 2.2 AA on all P0 flows.
- Search: every public player, team, schedule, and match page has canonical metadata, structured data, and sitemap coverage.

## Global constraints

- Keep Supabase as the only live fantasy and public-data backend. Do not add new Prisma-backed product features.
- Add migrations only. Do not destructively rewrite production tables.
- Use stable provider IDs as database keys and unique human-readable slugs for public URLs.
- Official NWSL data is primary. ESPN is a named fallback for schedule, result, venue, broadcast, and standings fields only.
- Persist provider, fetched timestamp, source season, and approximation flags with every derived record.
- Never invent unavailable stats. Render an honest unavailable or estimated state.
- Use the current scoring rule version for every snapshot and persist `scoring_version`.
- All match, slate, lineup, and leaderboard reads must scope by exact `match_id`, `slate_key`, or `contest_id`.
- Preview deploys remain enabled. Production requires passing CI, Ready preview, merge, Ready production deployment, and live canonical-domain checks.
- Public pages must work without authentication. Private league and personal data stay behind existing Supabase Auth flows.
- No new auth or RLS redesign is included in this roadmap.
- No real-money contests, payments, cash prizes, or betting execution.
- Motion must respect `prefers-reduced-motion` and must not block content or interaction.
- Use direct imports for large chart or motion components. Dynamically load route-specific heavy UI.
- Each packet reports `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.
- Do not commit or deploy from an execution packet unless Zach explicitly authorizes it in that execution thread.

## Task index

| ID | Task | Files touched | Depends on | Wave |
|----|------|---------------|------------|------|
| 01 | Canonical NWSL data schema and contracts | `supabase/migrations/`, `src/types/nwsl-data.ts`, `src/lib/nwsl/contracts.ts` | none | 1 |
| 02 | Product analytics and KPI instrumentation | `src/lib/analytics/`, `src/components/providers/`, `src/app/layout.tsx` | none | 1 |
| 03 | CI, local Supabase, and browser E2E baseline | `playwright.config.ts`, `e2e/`, `.github/workflows/`, `package.json` | none | 1 |
| 04 | Provider adapters and normalized ingest | `src/lib/nwsl/providers/`, `src/lib/nwsl/ingest/`, `scripts/` | 01 | 2 |
| 05 | Cached public read models | `src/lib/nwsl/read-models/`, `src/lib/nwsl/cache.ts` | 01, 04 | 3 |
| 06 | Automated jobs, freshness, and failure recovery | `src/lib/jobs/`, `src/app/api/jobs/`, `supabase/functions/`, `supabase/migrations/` | 01, 04 | 3 |
| 07 | Canonical public routes, SEO, and navigation | `src/app/players/`, `src/app/teams/`, `src/app/schedule/`, `src/app/matches/`, `src/app/sitemap.ts`, `next.config.ts` | 05 | 4 |
| 08 | Best-in-class player pages | `src/app/players/`, `src/components/player/`, `src/features/player/` | 05, 07 | 5 |
| 09 | Best-in-class team and league pages | `src/app/teams/`, `src/app/standings/`, `src/components/team/` | 05, 07 | 5 |
| 10 | Schedule and live match center | `src/app/schedule/`, `src/app/matches/`, `src/features/match-center/` | 05, 06, 07 | 5 |
| 11 | Player projection engine and explanations | `supabase/migrations/`, `src/lib/projections/`, `src/components/projections/` | 04, 05 | 5 |
| 12 | Incremental live fantasy scoring | `src/lib/scoring/`, `src/lib/fantasy-standings.ts`, `src/features/matchup/` | 06, 10, 11 | 6 |
| 13 | Classic league lifecycle, autopick, waivers, and playoffs | `supabase/functions/`, `src/lib/fantasy-draft.ts`, `src/lib/fantasy-api.ts`, `src/lib/playoffs/` | 06, 12 | 7 |
| 14 | Free-to-play DFS contest model | `supabase/migrations/`, `src/lib/contests/`, `src/app/contests/`, `src/features/salary-cap/` | 01, 11, 12 | 7 |
| 15 | Personalization, alerts, email, and web push | `src/lib/notifications/`, `src/app/notifications/`, `public/sw.js`, `supabase/migrations/` | 02, 06, 10, 12 | 7 |
| 16 | Achievements, recaps, and shareable cards | `src/lib/fantasy-achievements.ts`, `src/app/share/`, `src/components/rewards/` | 12, 13, 14 | 8 |
| 17 | Mobile PWA, accessibility, and performance | `src/app/manifest.ts`, `public/sw.js`, P0 route components, `next.config.ts` | 07, 08, 09, 10, 14, 15 | 8 |
| 18 | Admin operations and data-quality console | `src/app/admin/`, `src/app/api/admin/`, `src/lib/admin/`, `src/lib/nwsl/quality/` | 06, 12, 14 | 8 |
| 19 | Beta simulation, launch gate, and production verification | `e2e/`, `scripts/release/`, `docs/release/` | 02, 03, 08, 09, 10, 11, 13, 14, 15, 16, 17, 18 | 9 |

## Waves

- Wave 1: 01, 02, 03
- Wave 2: 04
- Wave 3: 05, 06
- Wave 4: 07
- Wave 5: 08, 09, 10, 11
- Wave 6: 12
- Wave 7: 13, 14, 15
- Wave 8: 16, 17, 18
- Wave 9: 19

## Release slices

1. **Trusted public hub:** packets 01 through 10. Ship canonical player, team, schedule, and match pages backed by automated current-season data.
2. **Fantasy that runs itself:** packets 11 through 13. Ship projections, automatic scoring, draft autopick, weekly lifecycle, and playoffs.
3. **Contest and engagement layer:** packets 14 through 16. Ship free-to-play contest lobbies, multiple entries, alerts, recaps, and shareable rewards.
4. **Premium launch:** packets 17 through 19. Ship PWA polish, performance, operations, full simulations, beta, and production verification.

## Explicit non-goals

- Real-money gaming, deposits, withdrawals, paid entry, cash prizes, wallets, tax reporting, or gambling compliance.
- A new authentication system.
- A new RLS or admin-role architecture.
- Native iOS or Android apps before the PWA proves retention.
- Unsupported player statistics, unlicensed photos, or implied official affiliation.
- Porting the preserved basketball motion lab wholesale into the NWSL production bundle.
