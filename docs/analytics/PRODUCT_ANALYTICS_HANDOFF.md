# Product Analytics Handoff

## What ships

- Typed, privacy-restricted product events delivered through a lazy PostHog
  adapter.
- Supabase and local-mode identity synchronization with sign-out reset.
- Vercel Web Analytics and Speed Insights mounted once after hydration.
- Successful-action instrumentation for the launch funnel, draft, lineup,
  salary-cap entry, match center, and notification opt-in.
- Typed KPI definitions and tests for disabled/configured analytics behavior.

## Deployment configuration

PostHog is opt-in at deployment time:

```text
NEXT_PUBLIC_APP_VERSION=<release tag or commit SHA>
NEXT_PUBLIC_POSTHOG_KEY=<public project key>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED=true
```

Do not add a secret PostHog personal key. The browser uses only the public
project key.

Before enabling the key in production, the product owner should confirm:

- the project region and retention policy;
- the privacy notice and consent approach for the intended audience;
- autocapture and session recording remain disabled in project settings as
  defense in depth;
- browser persistence remains local-storage-only;
- access to identified analytics is limited to the operating team.

Vercel Web Analytics and Speed Insights require both the explicit public flag
above and enablement in the Vercel project dashboard. They need no application
secret.

## Release verification

Run under the repository-pinned Node version:

```bash
pnpm exec vitest run \
  src/lib/analytics/events.test.ts \
  src/components/providers/analytics-provider.test.tsx \
  src/components/providers/product-analytics-provider.test.tsx
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Then smoke-test two deployment configurations:

1. Without `NEXT_PUBLIC_POSTHOG_KEY`, confirm there are no PostHog network
   requests and the product flows still succeed.
2. With a non-production PostHog project key, confirm page view, identity,
   successful league/lineup actions, and sign-out reset appear once in Live
   Events.

Inspect captured properties to ensure there is no email, display name, league
name, message content, or free text.

## Ownership boundary

Product analytics describes user behavior; it is not the source of truth for
draft uniqueness, scoring settlement, active-manager cohorts, or data
freshness. Those remain database, publisher, and model-pipeline concerns.

Reserved event contracts in the taxonomy should be wired only when their real
product surfaces exist. Do not synthesize an event from a nearby interaction
just to populate a dashboard.
