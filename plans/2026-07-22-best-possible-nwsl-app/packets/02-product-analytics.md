# Task 02: Product analytics and KPI instrumentation

**Wave:** 1

**Depends on:** none

## Files

- Modify: `package.json`
- Modify: `src/lib/analytics/events.ts`
- Modify: `src/components/providers/analytics-provider.tsx`
- Create: `src/lib/analytics/kpis.ts`
- Create: `src/lib/analytics/events.test.ts`
- Create: `src/components/providers/product-analytics-provider.tsx`
- Modify: `src/app/layout.tsx`
- Create: `docs/analytics/NWSL_Fantasy_Event_Taxonomy_v1.md`

## Interfaces

- Produces:
  - `ProductEventName`
  - `ProductEventProperties`
  - `trackProductEvent<T extends ProductEventName>(name: T, properties: ProductEventProperties[T]): void`
  - `identifyFantasyUser(userId: string, traits: { favoriteClub?: string; experienceLevel?: string }): void`
  - `resetFantasyIdentity(): void`
  - `PRODUCT_KPIS` with activation, retention, matchday, trust, and performance definitions.

## Event contract

Keep existing event names and add:

- `onboarding_completed`
- `lineup_lock_viewed`
- `lineup_submitted`
- `match_center_opened`
- `fantasy_score_event_viewed`
- `contest_viewed`
- `contest_entry_created`
- `draft_autopick`
- `notification_opt_in`
- `share_card_created`
- `data_freshness_warning_seen`

Every event includes `app_version`, `route`, and anonymous session ID. Authenticated events may include user ID, league ID, contest ID, player ID, match ID, or slate key. Never include email, message content, or free-text league chat.

## Steps

- [x] Add `posthog-js`, `@vercel/analytics`, and `@vercel/speed-insights`.
- [x] Replace the production event-discard behavior with a PostHog adapter. Keep a no-op path when the public key is absent.
- [x] Keep events typed. Add compile-time tests that reject missing required properties and extra sensitive fields.
- [x] Track page views, signup, onboarding completion, league create/join, draft completion, lineup submission, contest entry, matchday open, and notification opt-in.
- [x] Add Vercel Web Analytics and Speed Insights once in root layout.
- [x] Document exact KPI formulas and owner-facing dashboard cuts.
- [x] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/analytics/events.test.ts && pnpm typecheck && pnpm build`

Expected: typed event tests pass, no production console fallback is required, and build succeeds.

## Report

`DONE_WITH_CONCERNS`

Implementation and local verification are complete. The PostHog key is
intentionally absent from local source control, so a configured preview Live
Events smoke test remains a deployment-owner step. See
`docs/analytics/PRODUCT_ANALYTICS_HANDOFF.md`.

Evidence:

- focused analytics/provider tests pass;
- the full Vitest suite, typecheck, lint, and production build pass;
- no-key builds keep PostHog in a separately loaded chunk;
- privacy-sensitive properties are rejected by compile-time tests.

`DONE` if events dispatch only when configured and no direct personal identifiers are present. `DONE_WITH_CONCERNS` if provider keys are unavailable for preview verification.
