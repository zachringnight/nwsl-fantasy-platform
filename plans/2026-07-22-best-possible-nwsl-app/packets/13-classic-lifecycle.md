# Task 13: Classic league lifecycle, autopick, waivers, and playoffs

**Wave:** 7

**Depends on:** 06, 12

## Files

- Create: `supabase/migrations/20260724_classic_league_lifecycle.sql`
- Create: `supabase/functions/fantasy-draft-autopick/index.ts`
- Create: `supabase/functions/fantasy-week-advance/index.ts`
- Create: `src/lib/draft/submit-pick.ts`
- Create: `src/lib/draft/submit-pick.test.ts`
- Create: `src/lib/playoffs/generate-bracket.ts`
- Create: `src/lib/playoffs/generate-bracket.test.ts`
- Create: `scripts/test/simulate-season.ts`
- Modify: `src/lib/fantasy-draft.ts`
- Modify: `src/lib/fantasy-api.ts`
- Modify: `src/lib/fantasy-standings.ts`
- Modify: `src/lib/fantasy-achievements.ts`

## Interfaces

- Consumes: finalized point snapshots and tracked jobs from tasks 06 and 12.
- Produces:
  - `submitDraftPick(input: SubmitDraftPickInput): Promise<SubmitDraftPickResult>`
  - `runExpiredDraftPicks(now: string): Promise<AutopickRunResult>`
  - `advanceFantasyWeek(leagueId: string, weekKey: string): Promise<WeekAdvanceResult>`
  - `processScheduledWaivers(leagueId: string, runAt: string): Promise<WaiverRunResult>`
  - `generatePlayoffBracket(input: PlayoffBracketInput): PlayoffBracket`

## Rules

- One server-owned pick transaction handles manual, queue, autopick, and commissioner sources.
- Unique league and overall-pick constraint prevents duplicate picks.
- Autopick uses queue first, then highest projection among eligible players while satisfying roster need and club limit.
- Waivers run once per league/week with a persisted idempotency key.
- Four-team playoffs seed by existing standings tiebreak rules.

## Steps

- [ ] Add season calendar, league weeks, matchup schedule, playoff rounds, and operation idempotency keys.
- [ ] Move pick validation and roster insertion behind the server-owned transaction.
- [ ] Schedule expired-pick processing every minute.
- [ ] Generate weekly matchups before Week 1 and playoffs after the regular-season final.
- [ ] Schedule waivers and notify claim results.
- [ ] Award season champion and comeback achievements only from finalized bracket results.
- [ ] Simulate a 12-manager draft, 16-week season, waiver run, semifinal, and final.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/draft/submit-pick.test.ts src/lib/playoffs/generate-bracket.test.ts && pnpm exec tsx scripts/test/simulate-season.ts`

Expected: zero duplicate picks, every league week settles once, and the bracket produces one champion.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if the simulation requires no manual database mutation. `DONE_WITH_CONCERNS` if the official season calendar needs a commissioner override for postponed matches.
