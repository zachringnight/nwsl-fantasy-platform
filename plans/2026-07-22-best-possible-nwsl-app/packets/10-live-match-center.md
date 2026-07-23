# Task 10: Schedule and live match center

**Wave:** 5

**Depends on:** 05, 06, 07

## Files

- Create: `src/app/schedule/page.tsx`
- Create: `src/app/matches/[matchId]/page.tsx`
- Create: `src/features/match-center/match-header.tsx`
- Create: `src/features/match-center/match-timeline.tsx`
- Create: `src/features/match-center/match-lineups.tsx`
- Create: `src/features/match-center/match-stats.tsx`
- Create: `src/features/match-center/fantasy-scorers.tsx`
- Create: `src/features/match-center/use-live-match.ts`
- Create: `src/features/match-center/match-center.test.tsx`

## Interfaces

- Consumes:
  - `listPublicMatches`
  - `getPublicMatch`
  - freshness state from task 06.
- Produces:
  - `useLiveMatch(matchId: string, initial: PublicMatchPage): LiveMatchState`
  - soccer-specific schedule and match-center components.

## States

- Scheduled: kickoff, venue, broadcast, projected lineups when explicitly available.
- Live: score, clock, event timeline, confirmed lineups, team stats, fantasy scorers, freshness.
- Final: final score, box score, fantasy totals, projection versus result, correction state.
- Postponed or canceled: official status and rescheduling details only when published.

## Steps

- [ ] Build server-rendered initial state and subscribe to normalized match, event, stat, and fantasy snapshot changes through Supabase Realtime.
- [ ] Order events by provider sequence, then minute and event ID.
- [ ] Deduplicate repeated Realtime payloads by stable event key.
- [ ] Show reconnecting and stale states without hiding the last confirmed data.
- [ ] Add schedule filters for season, club, date range, status, and broadcast.
- [ ] Add accessible live-region announcements only for goals, cards, final, and fantasy lead changes.
- [ ] Test live update, duplicate event, reconnect, postponed match, and final correction.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/features/match-center/match-center.test.tsx && pnpm build`

Expected: a seeded goal updates the timeline once, score once, and fantasy scorer panel once; duplicate payload causes no extra change.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` when live and stale states are traceable. `DONE_WITH_CONCERNS` if provider polling cannot meet the 90-second freshness target.
