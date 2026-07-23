# Packet 13: test-coverage-critical-paths

## Objective
The largest, most business-critical files in the fantasy/DFS product have ZERO test coverage: `fantasy-salary-cap.ts` (376 lines), `fantasy-slate-engine.ts` (263 lines), `fantasy-modes.ts`, `scoring-rules.ts`, `fantasy-api.ts` (2366 lines, ~30 functions), plus every new module this plan added (packets 04/06/07/08). Given real money-adjacent DFS logic now has real scoring behind it (packet 04), this is no longer optional polish.

## Files
- Create: `src/lib/fantasy-salary-cap.test.ts`
- Create: `src/lib/fantasy-slate-engine.test.ts`
- Create: `src/lib/fantasy-modes.test.ts`
- Create: `src/lib/scoring/scoring-rules.test.ts`
- Extend/verify: whatever test files packets 04/06/07/08 already created for their own new code (this packet's job is to catch anything THOSE packets under-tested, not duplicate their work — read what tests already exist before writing new ones for the same files)

## Context facts (verified)
- Zero MSW/global fixtures beyond `jest-dom` matchers — tests mock the Supabase client directly per-test, following whatever pattern `fantasy-data-provider.test.tsx` (the one existing test that touches this layer) already uses.
- `fantasy-salary-cap.ts` key functions needing coverage: `buildSalaryCapEntrySummary`, `isSalaryCapEntryLocked`, `buildSalaryCapEntryWindowState`, `buildSalaryCapAutofillSelections` (brute-force combination builder — test it actually respects the cap and produces a legal lineup), `getRecommendedSalaryCapSlot`, plus packet 11's new availability-eligibility logic.
- `fantasy-slate-engine.ts`: `getFantasySlateWindows`, `getFantasyTargetSlate`, `getFantasyDefaultLockAt`, `getFantasySlateStatus` — test the lock-window boundary math precisely (off-by-one at exactly `lock_at` matters for real money-adjacent DFS).
- `fantasy-modes.ts`: `getFantasyModeConfig`/`getFantasyModeOptions` for all 4 `FantasyGameVariant` values — untested today despite being the single source of truth for classic-vs-DFS branching everywhere in the app.
- Prioritize breadth over exhaustiveness given time: cover the core happy path plus the sharpest edge case per function (e.g. exactly-at-lock-time, exactly-at-cap, empty pool) rather than chasing 100% branch coverage everywhere.

## Steps
1. For each target file, write tests covering: the documented happy path, the one or two edge cases called out above, and any bug class discovery flagged (e.g. lock-time boundary).
2. For packets 04/06/07/08's own new modules: read their existing test files, identify any gap versus what THIS packet's broader pass would want covered (e.g. did packet 08's tests cover the leaderboard ranking tie-break rule?), add targeted tests only for real gaps, don't rewrite what's already covered.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test && pnpm typecheck
```
Expected: full suite green, meaningfully more test files than the 37 that existed before this plan started.

## Done-signal
End with exactly one line: `DONE: 13` / `DONE_WITH_CONCERNS: 13: <one line>` / `BLOCKED: 13: <one line>`.
