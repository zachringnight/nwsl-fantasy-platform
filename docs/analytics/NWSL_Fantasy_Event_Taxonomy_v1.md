# NWSL Fantasy Event Taxonomy v1

This is the source of truth for product-event names, properties, identity,
privacy constraints, and owner-facing KPI formulas. Keep it aligned with
`src/lib/analytics/events.ts` and `src/lib/analytics/kpis.ts`.

## Privacy boundary

Never send email, display name, league name, chat or message content, search
text, or other free text. Identity traits are limited to favorite club and
fantasy experience level.

The client enforces this boundary in three ways:

- event payloads use closed TypeScript property shapes;
- PostHog autocapture and session recording are disabled;
- the provider passes an allowlist of identity traits rather than a profile.

## Universal properties

Every configured PostHog event receives:

| Property | Source |
| --- | --- |
| `app_version` | `NEXT_PUBLIC_APP_VERSION`, or `development` |
| `route` | Current browser pathname |
| `session_id` | Per-tab anonymous identifier stored in `sessionStorage`, with a unique in-memory fallback |

PostHog supplies its own `distinct_id`. KPI queries use that identity field;
event call sites do not duplicate a `user_id` property.

## Event catalog

| Event | Properties | Current trigger |
| --- | --- | --- |
| `page_view` | `path`, optional `referrer_origin` | Successful route render/change; referrer path, query, and hash are discarded |
| `sign_up` | `method` | Successful email or guest account creation |
| `sign_in` | `method` | Successful email or guest sign-in |
| `onboarding_completed` | `next_step` | Successful first onboarding completion |
| `league_created` | `variant`, `build_mode` | Successful league creation |
| `league_joined` | `league_id` | Successful league join |
| `draft_pick` | `league_id`, `player_id`, `pick_number` | Successful manual pick |
| `draft_autopick` | `league_id`, `player_id`, `pick_number` | Successful automatic pick |
| `draft_completed` | `league_id`, `total_picks` | Draft status transitions to complete |
| `lineup_lock_viewed` | `league_id`, `is_locked` | Classic lineup state loads |
| `lineup_submitted` | `league_id` | Successful classic lineup save |
| `roster_saved` | `league_id` | Contract reserved for a future distinct roster-save action |
| `contest_viewed` | `contest_id` | Contract reserved until first-class contests exist |
| `entry_submitted` | `league_id`, `slate_key` | Successful salary-cap submission |
| `contest_entry_created` | `contest_id`, `slate_key` | Contract reserved until first-class contests exist |
| `match_center_opened` | `match_id` | User opens a match detail from the match center |
| `notification_opt_in` | `channel`, `preference_id` | Email or push preference changes from off to on |
| `waiver_claim` | `league_id`, `player_id` | Contract reserved; no call site in this PR |
| `player_watchlisted` | `player_id` | Contract reserved; no call site in this PR |
| `player_compared` | `left_id`, `right_id` | Contract reserved; no call site in this PR |
| `notification_clicked` | `notification_id` | Contract reserved until notifications have real destinations |
| `fantasy_score_event_viewed` | `match_id`, `player_id` | Contract reserved until score events expose a player interaction |
| `share_card_created` | `card_type` | Contract reserved until share-card creation exists |
| `data_freshness_warning_seen` | `surface` | Contract reserved until warning surfaces expose stable feed context |

Events fire only after the corresponding product action succeeds. Rendering a
list or submitting a failed mutation does not count as product engagement.

## Identity lifecycle

`ProductAnalyticsProvider` waits for fantasy auth hydration, then identifies
the Supabase user or local-mode profile by stable user ID. A change to favorite
club or experience level refreshes the allowlisted traits. Sign-out and direct
account switches reset the previous analytics identity.

Anonymous browsing remains anonymous because PostHog uses
`person_profiles: "identified_only"`. Analytics persistence is limited to
browser local storage rather than cookies.

## Provider behavior

`NEXT_PUBLIC_POSTHOG_KEY` is optional. Without it, the SDK is never imported
and every product tracking function is a silent no-op. When configured, the
SDK is dynamically imported on first use and initialized once.

`NEXT_PUBLIC_POSTHOG_HOST` defaults to the US PostHog Cloud endpoint. Configure
the correct regional or self-hosted endpoint explicitly when applicable.

Vercel Web Analytics and Speed Insights are dynamically mounted once at the
root only when `NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED=true`. They remain
separate from PostHog product events.

## KPI definitions

The typed definitions live in `PRODUCT_KPIS`.

- Activation: same-session signup-to-league create/join rate; target at least
  60%.
- Retention: distinct identified managers who submit a legal classic lineup
  before lock divided by the active-manager backend cohort for that scoring
  week; target at least 70%.
- Matchday: distinct identified managers who open a relevant match center
  divided by the affected-active-manager backend cohort; target at least 50%.
- Trust: freshness-warning exposure trends toward zero and draft autopicks
  trend toward zero.
- Performance: mobile p75 LCP below 2.5 seconds, INP below 200 milliseconds,
  and CLS below 0.1 from Vercel Speed Insights.

Active-manager, affected-roster, and legal-lineup denominators are backend
cohorts. Client events supply numerator behavior but do not replace those
authoritative cohorts.

## Change control

Adding or renaming an event requires:

1. updating the TypeScript event map;
2. updating this catalog and any KPI definition;
3. adding success and failure-path tests at the call site;
4. confirming the payload contains no direct personal identifiers or free
   text.
