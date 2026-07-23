# Task 18: Admin operations and data-quality console

**Wave:** 8

**Depends on:** 06, 12, 14

## Files

- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/api/admin/jobs/route.ts`
- Modify: `src/app/api/admin/overrides/route.ts`
- Create: `src/app/api/admin/data-quality/route.ts`
- Create: `src/app/api/admin/matches/[matchId]/retry/route.ts`
- Create: `src/lib/admin/data-quality.ts`
- Create: `src/lib/admin/match-operations.ts`
- Create: `src/lib/admin/data-quality.test.ts`
- Create: `src/components/admin/freshness-board.tsx`
- Create: `src/components/admin/match-recovery-panel.tsx`
- Create: `src/components/admin/contest-settlement-panel.tsx`

## Interfaces

- Consumes: job history and freshness from task 06, scoring reconciliation from task 12, contest status from task 14.
- Produces:
  - `getAdminDataQuality(): Promise<AdminDataQualityState>`
  - `retryMatchPipeline(matchId: string, fromStage: MatchPipelineStage): Promise<TrackedJobResult>`
  - `previewScoringOverride(input: ScoringOverrideInput): Promise<ScoringOverridePreview>`
  - `settleContest(contestId: string): Promise<ContestSettlementResult>`

## Console sections

- Feed freshness and provider watermarks.
- Failed or retrying jobs.
- Unmapped players and teams.
- Match event and final-stat reconciliation.
- Scoring override preview and audit history.
- Contest lock and settlement state.
- Support panel connected to real feedback rows or omitted. Do not ship fake cases.

## Steps

- [ ] Replace any remaining placeholder admin state with live read models.
- [ ] Add one-click retry from a known pipeline stage using task 06 idempotency keys.
- [ ] Show the exact rows and fantasy totals affected before an override is applied.
- [ ] Keep audit history immutable.
- [ ] Add freshness thresholds and clear P0, P1, and warning severity.
- [ ] Add tests for retry, preview, override application, stale feed, and settlement idempotency.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/admin/data-quality.test.ts src/lib/fantasy-scoring-overrides.test.ts && pnpm build`

Expected: seeded stale and failed states appear in admin, retry is idempotent, and override preview equals the post-apply fantasy delta.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if a commissioner or operator can diagnose and rerun a failed match without SQL. `DONE_WITH_CONCERNS` if a real support backend remains intentionally excluded.
