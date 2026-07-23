# Task 17: Mobile PWA, accessibility, and performance

**Wave:** 8

**Depends on:** 07, 08, 09, 10, 14, 15

## Files

- Create: `src/app/manifest.ts`
- Modify: `public/sw.js`
- Modify: `src/components/providers/service-worker-provider.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `next.config.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/players/page.tsx`
- Modify: `src/components/common/site-header.tsx`
- Modify: `src/components/common/app-shell.tsx`
- Modify: `src/components/draft/draft-room-client.tsx`
- Modify: `src/components/lineup/salary-cap-entry-builder.tsx`
- Modify: `src/components/matchup/league-matchup-client.tsx`
- Create: `e2e/accessibility.spec.ts`
- Create: `e2e/mobile-core-flows.spec.ts`
- Create: `scripts/performance/check-budgets.mjs`
- Modify: `package.json`

## Interfaces

- Produces:
  - installable web manifest and service worker.
  - npm scripts `test:a11y` and `test:performance`.
  - performance budgets enforced in CI.

## PWA scope

- Cache app shell, rules/help, last-read public entity pages, upcoming schedule, and the user's last confirmed lineup view.
- Do not cache writes as successful while offline.
- Queue no draft pick, lineup submit, waiver, trade, or contest-entry mutation.
- Offline pages show cached timestamp and reconnect action.

## Budgets

- Mobile p75 LCP below 2.5 seconds.
- INP below 200 milliseconds.
- CLS below 0.1.
- Initial JavaScript below 220 KB compressed on public entity routes.
- Route-specific chart and motion code loads only on routes that render it.

## Steps

- [ ] Add manifest, icons, theme colors, standalone display, and service-worker registration.
- [ ] Add safe read-only caching and explicit offline states.
- [ ] Use `content-visibility` or virtualization for the 410-player directory.
- [ ] Dynamically load heavy charts and contest modules.
- [ ] Audit focus order, visible focus, labels, live regions, color contrast, reduced motion, and keyboard-only operation.
- [ ] Run mobile flows at 390 by 844 and desktop at 1440 by 900.
- [ ] Add automated accessibility checks for all P0 pages and Lighthouse-style budget checks.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test:a11y && pnpm test:performance && pnpm build`

Expected: zero serious accessibility violations, all budgets pass, and offline reads show timestamped cached content without pretending writes succeeded.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE_WITH_CONCERNS` until install, push permission, and offline behavior are checked on one real iPhone and one Android device. Otherwise report `DONE`.
