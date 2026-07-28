# NWSL Fantasy Event Taxonomy v1

Source of truth for product analytics event names, properties, identity
handling, and KPI formulas. Code lives in `src/lib/analytics/events.ts`
(event contract + PostHog adapter) and `src/lib/analytics/kpis.ts`
(`PRODUCT_KPIS`). Keep this document, `events.ts`, and `kpis.ts` in sync
when any of the three changes.

Packet: `plans/2026-07-22-best-possible-nwsl-app/packets/02-product-analytics.md`.

## 1. PII rule (non-negotiable)

**Never include email, message content, or free-text league chat** in any
event property, identify trait, or KPI cut. `ProductEventProperties` in
`events.ts` is a closed, per-event TypeScript shape specifically so that
adding a field like `email` or `chat_message` to an event call fails
`pnpm typecheck` (excess-property check on the object literal) rather than
silently shipping. See `events.test.ts` for the compile-time proof
(`rejects event calls carrying extra/sensitive fields...`).

This is also why the PostHog client is initialized with `autocapture: false`
and `disable_session_recording: true` (see section 5) -- both features
record raw DOM/session content by default, which is incompatible with this
rule regardless of what the typed event contract enforces.

## 2. Universal properties

Every event automatically carries these three properties. Call sites never
pass them -- `trackProductEvent` injects them:

| Property | Source | Notes |
|---|---|---|
| `app_version` | `NEXT_PUBLIC_APP_VERSION` env var, falls back to `"0.0.0"` | Set this in Vercel project env vars (e.g. release tag or commit SHA) to distinguish deploys in PostHog. Unset locally by default. |
| `route` | `window.location.pathname` at the moment the event fires | Always the current pathname, independent of any event-specific `path`-like property. |
| `session_id` | Anonymous, per-browser-tab id generated on first use and cached in `sessionStorage` | Not PostHog's own session concept -- a separate, dependency-free id so enrichment behaves identically whether or not PostHog is configured. Cleared when the tab closes. |

Authenticated events may additionally carry a user ID, league ID, contest
ID, player ID, match ID, or slate key, per the event contract below.

## 3. Event catalog

All 23 events PostHog receives. "Existing" events kept their exact names
and shapes from the pre-packet-02 `events.ts`; "New" events were added by
this packet.

| Event | Status | Properties | When it fires |
|---|---|---|---|
| `page_view` | Existing | `{ path: string; referrer?: string }` | Every route change (`AnalyticsProvider`). |
| `sign_up` | Existing | `{ method: "email" \| "guest" }` | Account creation completes. |
| `sign_in` | Existing | `{ method: "email" \| "guest" }` | Authentication completes. |
| `league_created` | Existing | `{ variant: string; build_mode: string }` | A manager creates a league. |
| `league_joined` | Existing | `{ league_id: string }` | A manager joins a league. |
| `draft_pick` | Existing | `{ league_id: string; player_id: string; pick_number: number }` | A manager makes a manual draft pick. |
| `roster_saved` | Existing | `{ league_id: string }` | A classic-league roster is saved outside matchday lock. |
| `entry_submitted` | Existing | `{ league_id: string; slate_key: string }` | A salary-cap entry is submitted for a slate. |
| `waiver_claim` | Existing | `{ league_id: string; player_id: string }` | A manager files a waiver claim. |
| `player_watchlisted` | Existing | `{ player_id: string }` | A manager watchlists a player. |
| `player_compared` | Existing | `{ left_id: string; right_id: string }` | A manager compares two players. |
| `notification_clicked` | Existing | `{ notification_id: string }` | A manager clicks a delivered notification. |
| `onboarding_completed` | New | `{ user_id: string }` | A new user finishes onboarding. |
| `lineup_lock_viewed` | New | `{ league_id: string }` | A manager views the lineup lock screen/deadline for a league. |
| `lineup_submitted` | New | `{ league_id: string }` | A manager submits (or confirms) their weekly classic-league lineup before lock. |
| `match_center_opened` | New | `{ match_id: string }` | A manager opens the live match center for a match. |
| `fantasy_score_event_viewed` | New | `{ match_id: string; player_id: string }` | A manager views a specific scoring event tied to one of their fantasy players (the "traceable to real NWSL events" feature). |
| `contest_viewed` | New | `{ contest_id: string }` | A manager views a free-to-play salary-cap contest's lobby/detail. |
| `contest_entry_created` | New | `{ contest_id: string; slate_key: string }` | A manager creates a contest entry. |
| `draft_autopick` | New | `{ league_id: string; player_id: string; pick_number: number }` | The system autopicks for a manager (mirrors `draft_pick`'s shape). |
| `notification_opt_in` | New | `{ channel: "email" \| "push" }` | A manager opts into a notification channel. |
| `share_card_created` | New | `{ card_type: string }` | A manager generates a shareable recap/achievement card. |
| `data_freshness_warning_seen` | New | `{ surface: string }` | A manager sees a data-freshness/staleness warning (e.g. `"match_center"`, `"standings"`, `"player_page"`, `"matchup"`). |

`ProductEventName` is the exact union of the 23 names above;
`events.test.ts` asserts this bidirectionally at compile time (every listed
name is real, and every real name is listed) so a future rename or typo
fails `pnpm typecheck` instead of silently drifting.

### Call-site instrumentation status

This packet builds and type-checks the full library end to end and wires
the one call site already in this packet's file scope: `page_view` via
`AnalyticsProvider` in the root layout. Actually calling
`trackProductEvent` for the other events above (signup, onboarding,
league create/join, draft, lineup, contest, matchday, notification opt-in)
happens at each feature's real UI call site, owned by the packets that
build or already own that UI (e.g. draft/lineup/contest/notification UI is
outside this packet's declared file list per
`plans/2026-07-22-best-possible-nwsl-app/manifest.md`'s task index, to
avoid cross-packet file collisions in a parallel-execution plan). Those
packets should import `trackProductEvent` from `src/lib/analytics/events.ts`
and use the exact event names and shapes in the table above.

## 4. Identity

- `identifyFantasyUser(userId, { favoriteClub?, experienceLevel? })` --
  associates subsequent events with a known manager. Traits map to PostHog
  person properties `favorite_club` and `experience_level` (snake_case, for
  consistency with every other event property in this taxonomy). Never
  pass email or any free-text trait.
- `resetFantasyIdentity()` -- clears the current PostHog identity. Call on
  sign-out so the next anonymous session doesn't inherit the previous
  manager's identity.
- Wired in `ProductAnalyticsProvider` (`src/components/providers/product-analytics-provider.tsx`):
  identifies once `useFantasyAuth()`'s session resolves to a user, resets
  when it resolves to no user. Both functions are no-ops when PostHog isn't
  configured, same as `trackProductEvent`.
- PostHog is initialized with `person_profiles: "identified_only"` -- an
  anonymous browsing session never creates a full PostHog "person" profile
  until `identifyFantasyUser` actually fires.

## 5. Provider configuration

### PostHog (product events)

| Env var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | Public/project API key. Absent = every tracking function in `events.ts` is a silent no-op (never throws, never warns). |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | Defaults to `https://us.i.posthog.com` (PostHog Cloud, US region). Override for an EU-hosted or self-hosted project. |

`posthog.init` is called with:

- `capture_pageview: false`, `capture_pageleave: false` -- this app sends
  an explicit typed `page_view` event itself; PostHog's automatic
  pageview/pageleave capture would duplicate it under a different name.
- `autocapture: false` -- autocapture records raw DOM interactions and, in
  some configurations, form field values. Disabled to guarantee the PII
  rule in section 1 holds regardless of dashboard-level project settings.
- `disable_session_recording: true` -- defense in depth against the same
  PII risk; this client never starts session replay.
- `person_profiles: "identified_only"` -- see section 4.

### Vercel Web Analytics + Speed Insights (traffic and Web Vitals)

Mounted once in `ProductAnalyticsProvider`, rendered at the app root
(`src/app/layout.tsx`). Both `<Analytics />` (`@vercel/analytics/next`) and
`<SpeedInsights />` (`@vercel/speed-insights/next`) are safe no-ops until
the corresponding feature is turned on for this project in the Vercel
dashboard -- no additional app code or env var is required to gate them.
These are separate from, and do not send data to, PostHog.

## 6. KPI definitions (`PRODUCT_KPIS`)

Targets are lifted directly from the plan's success measures
(`plans/2026-07-22-best-possible-nwsl-app/manifest.md`). Every `events`
list below is typed against `ProductEventName` in code, so a renamed event
fails `pnpm typecheck` instead of silently breaking a KPI.

### Activation

**Signup-to-league activation rate**
- Formula: `count(distinct session_id where sign_up occurred AND (league_created OR league_joined) occurred in that same session_id) / count(distinct session_id where sign_up occurred)`
- Target: >= 60%, same session
- Events: `sign_up`, `league_created`, `league_joined`
- Dashboard cuts: by signup method (email vs guest), by day/week, by onboarding completion (join with `onboarding_completed`).

### Retention

**Weekly legal-lineup submission rate**
- Formula: `count(distinct user_id with lineup_submitted before lock, current scoring week) / count(distinct user_id who are active-league managers, current scoring week)`
- Target: >= 70% of managers in active leagues, per scoring week
- Events: `lineup_lock_viewed`, `lineup_submitted`, `roster_saved`
- Dashboard cuts: by league age (weeks since creation), by league size, by manager `experience_level` (identify trait), by `lineup_lock_viewed`-to-`lineup_submitted` conversion.

### Matchday

**Matchday live engagement rate**
- Formula: `count(distinct user_id with match_center_opened OR fantasy_score_event_viewed during a live scoring window) / count(distinct user_id who are active managers with a live match affecting their roster that window)`
- Target: >= 50% of active managers per scoring window
- Events: `match_center_opened`, `fantasy_score_event_viewed`
- Dashboard cuts: by kickoff window/day-of-week, by `favoriteClub` (identify trait), by route (match center vs matchup), by device class.

### Trust

**Data freshness warning exposure rate**
- Formula: `count(session_id with data_freshness_warning_seen) / count(session_id with match_center_opened OR fantasy_score_event_viewed)`
- Target: trending toward 0%; investigate any scoring week above 5%
- Events: `data_freshness_warning_seen`, `match_center_opened`, `fantasy_score_event_viewed`
- Dashboard cuts: by `surface` property (`match_center`, `standings`, `player_page`, `matchup`), by `match_id` where available.

**Draft autopick incidence rate**
- Formula: `count(draft_autopick) / count(draft_autopick OR draft_pick)`
- Target: trending toward 0%; investigate any draft above 10%
- Events: `draft_pick`, `draft_autopick`
- Dashboard cuts: by `league_id`, by draft pick round/slot, by scheduled draft time-of-day.

> Hard reliability invariants from the plan's success measures -- zero
> duplicate draft picks, zero cross-contest score leakage, scoring
> correction rate below 0.1% -- are database/backend correctness
> guarantees (unique constraints, audit jobs), not client-event-derived
> KPIs. They are enforced and audited at the data layer in the packets that
> own drafting, scoring, and contests, and in the admin data-quality
> console (packets 12-14 and 18 in the roadmap), not in `PRODUCT_KPIS`.

### Performance

Sourced from Vercel Speed Insights (Web Vitals), not from PostHog product
events -- `events` is empty for all three.

- **Mobile p75 Largest Contentful Paint** -- target `< 2.5s`.
- **Mobile p75 Interaction to Next Paint** -- target `< 200ms`.
- **Mobile p75 Cumulative Layout Shift** -- target `< 0.1`.
- Dashboard cuts (all three): by route template (player, team, schedule, match center, matchup).

## 7. Change log

- **v1** (packet 02, 2026-07-23): initial taxonomy. 12 existing events kept
  as-is, 11 new events added. PostHog adapter replaces the prior
  production event-discard behavior. Vercel Web Analytics and Speed
  Insights added once at the app root. `identifyFantasyUser` /
  `resetFantasyIdentity` wired to the fantasy auth session lifecycle.
