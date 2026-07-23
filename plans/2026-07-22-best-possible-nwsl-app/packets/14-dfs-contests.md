# Task 14: Free-to-play DFS contest model

**Wave:** 7

**Depends on:** 01, 11, 12

## Files

- Create: `supabase/migrations/20260724_fantasy_contests.sql`
- Create: `src/lib/contests/types.ts`
- Create: `src/lib/contests/contest-service.ts`
- Create: `src/lib/contests/contest-service.test.ts`
- Create: `src/lib/contests/leaderboard.ts`
- Create: `src/lib/contests/leaderboard.test.ts`
- Create: `scripts/test/load-contest.ts`
- Create: `src/app/contests/page.tsx`
- Create: `src/app/contests/[contestSlug]/page.tsx`
- Create: `src/app/contests/[contestSlug]/entries/[entryId]/page.tsx`
- Modify: `src/components/lineup/salary-cap-entry-builder.tsx`
- Modify: `src/features/salary-cap/components/salary-cap-league-brief.tsx`
- Modify: `src/features/matchup/components/salary-cap-leaderboard.tsx`

## Interfaces

- Consumes: projection rows from task 11 and live/final snapshots from task 12.
- Produces:
  - `FantasyContest`, `FantasyContestEntry`, `FantasyContestEntrySlot`
  - `listOpenContests(query: ContestQuery): Promise<FantasyContest[]>`
  - `createContestEntry(input: CreateContestEntryInput): Promise<FantasyContestEntry>`
  - `submitContestEntry(entryId: string, now: string): Promise<FantasyContestEntry>`
  - `buildContestLeaderboard(contestId: string): Promise<ContestLeaderboard>`

## Contest contract

- Every contest has a unique ID and slug, slate key, start, lock, end, salary cap, roster template, scoring version, maximum entries per user, and status.
- Every entry and entry slot stores exact `contest_id`.
- Existing league-shaped salary-cap entries get a compatibility migration to a generated contest only when their league and slate are unambiguous.
- Contests are free-to-play with points and badges only.

## Steps

- [ ] Add first-class contest, entry, and entry-slot tables and exact-contest unique constraints.
- [ ] Build lobby filters for upcoming, live, final, slate, and entry state.
- [ ] Support multiple named entries up to contest limit.
- [ ] Enforce salary, roster, availability, duplicate player, and lock rules from the contest rule snapshot.
- [ ] Define late swap explicitly. Default: unlocked players may be changed until their individual match starts.
- [ ] Build live and final leaderboard from exact-contest entries only.
- [ ] Add duplicate-lineup count and projection-versus-actual views.
- [ ] Load test 1,000 entries and verify stable rank tiebreaks.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/contests/contest-service.test.ts src/lib/contests/leaderboard.test.ts && pnpm exec tsx scripts/test/load-contest.ts --entries 1000`

Expected: no cross-contest rows, rules reject invalid entries, and 1,000-entry ranking finishes within 2 seconds locally.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if exact contest scoping is proven. `BLOCKED` if a first-class `contest_id` cannot be added without ambiguous legacy migration; keep legacy rows isolated instead of guessing.
