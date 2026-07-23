# Task 11: Player projection engine and explanations

**Wave:** 5

**Depends on:** 04, 05

## Files

- Create: `supabase/migrations/20260724_fantasy_player_projections.sql`
- Create: `src/lib/projections/types.ts`
- Create: `src/lib/projections/features.ts`
- Create: `src/lib/projections/project-player.ts`
- Create: `src/lib/projections/materialize.ts`
- Create: `src/lib/projections/backtest.ts`
- Create: `src/lib/projections/project-player.test.ts`
- Create: `scripts/materialize-player-projections.ts`
- Create: `src/components/projections/projection-range.tsx`
- Create: `src/components/projections/projection-drivers.tsx`

## Interfaces

- Consumes: canonical current player, team, match, availability, and historical stat records from tasks 04 and 05.
- Produces:
  - `PlayerProjectionInput`
  - `PlayerProjection { playerId, matchId, slateKey, expectedMinutes, floor, median, ceiling, availabilityAdjustment, drivers, modelVersion, generatedAt }`
  - `projectPlayer(input: PlayerProjectionInput): PlayerProjection`
  - `materializeSlateProjections(slateKey: string): Promise<ProjectionMaterializationResult>`
  - `backtestPlayerProjections(season: number): Promise<PlayerProjectionBacktest>`

## Model contract

- Baseline uses expected minutes, recent exact match rates, season rates, position, opponent strength, home/away, rest, and availability.
- Floor, median, and ceiling are empirical quantiles or calibrated residual intervals. They are not arbitrary multipliers.
- Drivers name only features used by the model.
- A projection does not publish when expected minutes cannot be estimated responsibly.
- Every row stores model version, input watermark, scoring version, and generated timestamp.

## Steps

- [ ] Add `fantasy_player_projections` unique on player, match, model version, and scoring version.
- [ ] Build chronological training and validation splits. Do not leak future matches into features.
- [ ] Establish a simple recent-rate baseline before adding model complexity.
- [ ] Measure MAE, calibration coverage for floor/ceiling, and position-level bias.
- [ ] Promote only if the candidate improves the baseline without materially worsening a position group.
- [ ] Materialize upcoming-slate projections idempotently.
- [ ] Render explanations and freshness without presenting them as certainty.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/projections/project-player.test.ts && pnpm exec tsx scripts/materialize-player-projections.ts --slate test-slate --dry-run`

Expected: tests pass, every projection obeys `floor <= median <= ceiling`, and dry run reports model/scoring versions and no writes.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` only with a documented baseline and chronological result. `DONE_WITH_CONCERNS` if the model is useful for display but not reliably calibrated for contest decisions.
