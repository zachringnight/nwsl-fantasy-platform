# Task 19: Beta simulation, launch gate, and production verification

**Wave:** 9

**Depends on:** 02, 03, 08, 09, 10, 11, 13, 14, 15, 16, 17, 18

## Files

- Create: `scripts/release/simulate-draft.ts`
- Create: `scripts/release/simulate-matchweek.ts`
- Create: `scripts/release/simulate-contest.ts`
- Create: `scripts/release/verify-production.mjs`
- Create: `docs/release/NWSL_Fantasy_Beta_Runbook_v1.md`
- Create: `docs/release/NWSL_Fantasy_Data_Incident_Runbook_v1.md`
- Create: `docs/release/NWSL_Fantasy_Launch_Checklist_v1.md`
- Create: `docs/release/NWSL_Fantasy_Launch_Report_v1.md`
- Modify: `package.json`

## Interfaces

- Consumes: all prior packet outputs.
- Produces:
  - npm scripts `simulate:draft`, `simulate:matchweek`, `simulate:contest`, `verify:production`.
  - one launch report with test, data, product, performance, accessibility, preview, deployment, and production truth.

## Simulations

- Draft: 12 managers, mixed manual/queue/autopick, pause/resume, disconnect, and final roster validation.
- Matchweek: 8 matches, lineup locks, live events, event correction, postponed match, final stats, settlement, standings, waivers, and alerts.
- Contest: 1,000 entries across two contests sharing a slate, late swaps, live scoring, rank ties, and final settlement.
- Provider incident: official feed unavailable, ESPN schedule fallback, no unsupported player-stat fallback, visible freshness warning.

## Steps

- [ ] Run the full local gate from task 03.
- [ ] Run all three simulations twice and prove idempotent output.
- [ ] Run data incident drills for duplicate event, delayed final, schema change, and provider outage.
- [ ] Conduct a closed beta with 4 to 8 leagues across two consecutive matchweeks.
- [ ] Record activation, lineup submission, matchday open, error, correction, and freshness metrics.
- [ ] Resolve every P0 and P1 beta issue.
- [ ] Open a PR, wait for Vercel preview Ready, and perform browser QA on public, classic, DFS, notification, and admin flows.
- [ ] Merge only after all required checks pass.
- [ ] Wait for production Ready and verify the canonical domain, public data freshness, APIs, draft, lineup, scoring, leaderboard, and notifications.
- [ ] Write the launch report. Do not call local build or preview verification a launch.

## Done-check

Run: `pnpm ci:release && pnpm simulate:draft && pnpm simulate:matchweek && pnpm simulate:contest && pnpm verify:production`

Expected: every command passes, production deployment is Ready, canonical public pages and APIs return 200, and live data meets freshness targets.

## Eyeball list

- Rights to names, photos, marks, and official-affiliation language.
- Free-to-play contest language.
- Provider operating cost at minute-level cadence.
- Push and email consent copy.
- Any `DONE_WITH_CONCERNS` item from earlier packets.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` only after two consecutive beta matchweeks and canonical production verification. Report `BLOCKED` when rights, provider access, or production infrastructure prevents launch.
