# Packet 11: dfs-availability-enforcement

## Objective
Real player availability/injury data already exists on every pool player (`availability: AvailabilityStatus`, sourced from the official roster API's `playerStatus` field) but is completely unused in DFS eligibility/UI — a genuinely "out" player can be rostered in a salary-cap lineup with no warning. Wire it in.

## Files
- Modify: `src/lib/fantasy-salary-cap.ts` (`isPlayerEligibleForSalaryCapSlot`)
- Modify: `src/components/lineup/salary-cap-entry-builder.tsx` (surface a badge/filter for questionable/out players)

## Context facts (verified)
- `AvailabilityStatus` values (check `src/types/fantasy.ts` for the exact union — discovery found `"available"`/`"questionable"`/`"out"`).
- `isPlayerEligibleForSalaryCapSlot` currently checks position only.
- Decide the product behavior (this is a judgment call, make it explicitly and document your choice in the final report — don't silently pick one): (a) hard-block `"out"` players from being added at all, warn-but-allow `"questionable"`; or (b) allow both but show a clear warning badge and require explicit confirmation before saving a lineup containing an out/questionable player. Recommended: (b) — DFS players sometimes deliberately roster a questionable player who ends up playing; a hard block removes legitimate strategy. Hard-blocking `"out"` only (not `"questionable"`) is a reasonable middle ground if you want one bright line.

## Steps
1. Failing tests first: `isPlayerEligibleForSalaryCapSlot` (or a new wrapper) reflects your chosen policy for each availability status.
2. Implement.
3. Add a visible badge (out/questionable) next to affected players in the builder's player list and in filled slots; add the confirmation step if you chose the warn-but-allow policy.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- salary-cap && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 11` / `DONE_WITH_CONCERNS: 11: <one line>` / `BLOCKED: 11: <one line>`.
