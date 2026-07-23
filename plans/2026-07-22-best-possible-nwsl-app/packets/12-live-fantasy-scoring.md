# Task 12: Incremental live fantasy scoring

**Wave:** 6

**Depends on:** 06, 10, 11

## Files

- Create: `supabase/migrations/20260724_incremental_fantasy_scoring.sql`
- Modify: `src/lib/scoring/match-stat-ingest.ts`
- Create: `src/lib/scoring/incremental-scoring.ts`
- Create: `src/lib/scoring/incremental-scoring.test.ts`
- Modify: `src/lib/fantasy-standings.ts`
- Modify: `src/lib/fantasy-leaderboard.ts`
- Modify: `src/components/matchup/league-matchup-client.tsx`
- Modify: `src/features/matchup/components/classic-matchup-storyboard.tsx`

## Interfaces

- Consumes: normalized stable match events from task 10 and projection records from task 11.
- Produces:
  - `applyFantasyEvent(event: NwslMatchEventRecord, context: ScoringContext): Promise<FantasyScoreDeltaResult>`
  - `rebuildMatchFantasyScores(matchId: string): Promise<FantasyScoreRebuildResult>`
  - `finalizeFantasyMatch(matchId: string): Promise<FantasyMatchFinalization>`
  - `FantasyScoreEvent { eventKey, playerId, matchId, pointsDelta, breakdownDelta, scoringVersion, appliedAt }`

## Integrity rules

- Stable event key plus scoring version is unique.
- Repeated provider events do not double score.
- Event correction reverses the prior delta before applying the corrected event.
- Final rebuild from normalized stats must equal the sum of event deltas or create a visible reconciliation record.
- Standings and leaderboards read the latest scoring override after raw score.

## Steps

- [ ] Add append-only `fantasy_score_events` and `fantasy_score_reconciliations`.
- [ ] Map goal, assist, appearance, minute threshold, card, clean sheet, save, conceded goal, penalty, and own-goal changes to the current scoring engine.
- [ ] Keep volume statistics pending or estimated until exact match stats publish.
- [ ] Update point snapshots transactionally after each event.
- [ ] Recompute classic matchup and contest leaderboard reads from the same snapshot grain.
- [ ] Finalize from official match stats and record any event-sum difference.
- [ ] Test duplicate, correction, out-of-order, restart, and full-rebuild parity.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/scoring/incremental-scoring.test.ts src/lib/fantasy-standings.test.ts src/lib/fantasy-leaderboard.test.ts`

Expected: duplicate and out-of-order event tests pass, rebuild equals final snapshot, and no score crosses match or scoring version.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if event and final rebuild paths reconcile. `BLOCKED` if the provider cannot supply stable event identity or correction semantics.
