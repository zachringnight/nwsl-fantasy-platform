# Task 06: Automated jobs, freshness, and failure recovery

**Wave:** 3

**Depends on:** 01, 04

## Files

- Create: `supabase/migrations/20260724_nwsl_job_schedule.sql`
- Create: `supabase/functions/nwsl-sync/index.ts`
- Create: `src/lib/jobs/nwsl-schedule-sync.ts`
- Create: `src/lib/jobs/nwsl-live-sync.ts`
- Create: `src/lib/jobs/nwsl-finalize-match.ts`
- Create: `src/lib/jobs/job-runner.ts`
- Create: `src/lib/jobs/job-runner.test.ts`
- Modify: `src/lib/jobs/registry.ts`
- Modify: `src/app/api/jobs/route.ts`
- Modify: `src/app/api/admin/jobs/route.ts`

## Interfaces

- Consumes: `syncNwslData` and `NwslQualityReport` from task 04.
- Produces:
  - `runTrackedJob(input: TrackedJobInput): Promise<TrackedJobResult>`
  - jobs `nwsl-schedule-sync`, `nwsl-live-sync`, `nwsl-finalize-match`
  - `getDataFreshness(): Promise<DataFreshnessStatus[]>`
  - Edge Function request `{ jobId, season, matchIds?, requestedAt }`.

## Schedule

- Schedule and standings: every 6 hours.
- Roster and availability: daily at 09:00 UTC and after explicit admin request.
- Live sync: every minute only when at least one match is inside the window from 30 minutes before kickoff through 30 minutes after final.
- Finalize match: at official final, then retries at 5, 15, and 60 minutes.
- Weekly settlement starts only after all matches in the fantasy window are final or explicitly postponed outside the window.

## Steps

- [ ] Extend `fantasy_job_runs` with attempt, idempotency key, scheduled time, source watermark, error class, and retry timestamp.
- [ ] Implement one job runner that records start, success, skipped, retryable failure, and terminal failure.
- [ ] Use deterministic idempotency keys per job, season, match, and source watermark.
- [ ] Register schedules with Supabase Cron and call the Edge Function through an internal database-owned request.
- [ ] Revalidate public cache tags after successful writes.
- [ ] Add freshness status for schedule, roster, live events, final stats, standings, and projections.
- [ ] Test duplicate invocation, retry, partial provider outage, and quality-gate rejection.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/jobs/job-runner.test.ts && pnpm typecheck`

Expected: job tests pass, the typed Edge Function contract compiles, and the second identical seeded call is idempotently skipped.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` when schedules and retries are reproducible locally. `DONE_WITH_CONCERNS` if live polling cadence needs a paid hosting plan decision.
