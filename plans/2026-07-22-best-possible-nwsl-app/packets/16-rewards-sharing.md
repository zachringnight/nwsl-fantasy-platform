# Task 16: Achievements, recaps, and shareable cards

**Wave:** 8

**Depends on:** 12, 13, 14

## Files

- Modify: `src/lib/fantasy-achievements.ts`
- Create: `src/lib/fantasy-achievements.test.ts`
- Create: `src/lib/recaps/build-weekly-recap.ts`
- Create: `src/lib/recaps/build-weekly-recap.test.ts`
- Create: `src/app/share/player/[playerId]/opengraph-image.tsx`
- Create: `src/app/share/matchup/[matchupId]/opengraph-image.tsx`
- Create: `src/app/share/achievement/[achievementId]/opengraph-image.tsx`
- Create: `src/components/rewards/achievement-card.tsx`
- Create: `src/components/rewards/weekly-recap.tsx`
- Create: `src/components/rewards/reward-motion.module.css`

## Interfaces

- Consumes: finalized matchups, standings, playoff results, contest results, and point snapshots.
- Produces:
  - `buildWeeklyRecap(input: WeeklyRecapInput): WeeklyRecap`
  - `awardFinalizedAchievements(input: FinalizedCompetitionInput): Promise<AchievementAwardResult>`
  - shareable Open Graph images for player, matchup, and achievement.

## Rules

- Perfect lineup requires the highest legal lineup score among the user roster for that week, computed after final.
- Waiver hero requires a waiver acquisition whose finalized weekly points clear the documented threshold and lead the added-player pool.
- Comeback win compares pre-match projection and finalized result.
- Season champion comes only from the finalized playoff bracket.
- Clean sweep requires every starter to record a positive finalized score.
- Cards use team and player names, stats, and app-owned motion. Do not add unlicensed marks or photos.

## Steps

- [ ] Implement missing achievement triggers only from finalized, reproducible events.
- [ ] Generate deterministic weekly recap facts: result, top player, biggest swing, rank change, and next action.
- [ ] Add share images that render without authentication and expose no private league invite code.
- [ ] Adapt the preserved sports-card motion language into small soccer-specific reward modules.
- [ ] Respect reduced motion and avoid loading the full basketball motion library.
- [ ] Test achievement idempotency and deterministic recap output.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/recaps/build-weekly-recap.test.ts src/lib/fantasy-achievements.test.ts && pnpm build`

Expected: the same finalized input awards each achievement once and produces a stable recap.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if all award facts are reproducible. `DONE_WITH_CONCERNS` if any share design needs rights approval.
