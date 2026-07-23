# Packet 07: classic-lineup-lock-enforcement

## Objective
Close the exploit that real scoring (packet 04/06) makes dangerous: a classic-league manager can edit their weekly lineup at ANY time, including after kickoff or after seeing live results, because `writeLineupAssignments` has no lock check — unlike the DFS/salary-cap path, which already enforces `isSalaryCapEntryLocked`.

## Files
- Modify: `src/lib/fantasy-api.ts` (`writeLineupAssignments`, `saveRosterLineup`, `autofillRosterLineup`)
- Modify: `src/components/lineup/team-client.tsx`, `src/features/classic/components/classic-team-manager.tsx` (surface lock state in the UI — disable Save/Autofill, show a "locked" label, mirroring how `salary-cap-entry-builder.tsx` already does it)
- Create: a small shared lock-window helper if one doesn't already fit — check `src/lib/fantasy-salary-cap.ts::isSalaryCapEntryLocked`/`buildSalaryCapEntryWindowState` first; if the concept generalizes cleanly, extract a shared helper both classic and DFS use, otherwise write a classic-specific equivalent next to `fantasy-draft.ts` or in a new `src/lib/fantasy-lineup-lock.ts`

## Context facts (verified)
- `isSalaryCapEntryLocked(slate) = Date.now() >= new Date(slate.lock_at)`, called via `assertSalaryCapEntryUnlocked()` before every DFS mutation. This is the exact pattern to replicate for classic.
- Classic lineups don't have a single "slate" concept — a weekly lineup covers however many of a manager's players play across however many matches fall in that scoring week. The correct lock semantics: once ANY of a manager's starting players' matches has kicked off for the current week, that manager can no longer swap players into/out of already-started matches, but MAY still edit slots for players whose matches haven't started yet (this is standard fantasy-sports behavior — per-player lock, not per-lineup lock). If that per-player granularity is too large a scope change for this packet, the simpler, still-correct, more conservative alternative is a single lock at the EARLIEST kickoff among the week's matches (locks the whole lineup once the week's first match starts) — pick this simpler version if per-player locking would require a larger data-model change than fits this packet; document which you chose.
- You need the week's match kickoff times. **Packet 04 persists `match_date_utc` directly on `fantasy_point_snapshots` (and `fantasy_player_match_stats`) — read kickoff times straight from that column, do not invent a separate crosswalk.** For week boundaries specifically (which matches belong to "this week"), reuse whatever boundary logic packet 06 settled on (it will report its exact boundary logic and may export a shared helper, e.g. `getMatchWeek(matchDateUtc)` — check for one before writing your own). If packet 06 hasn't landed yet when you start (both are wave 2, depending only on 04, not on each other), use `fantasy-slate-engine.ts`'s weekly windows directly against `match_date_utc` — the SAME data source packet 06 is told to use — so the two implementations converge even if written independently.

## Steps
1. Failing tests first: `writeLineupAssignments` (or its lock-check wrapper) rejects an edit attempt for a player whose match has already started/finished, with a clear error, and allows edits for not-yet-started players/weeks.
2. Implement the lock helper and wire it into `saveRosterLineup`/`autofillRosterLineup`/`writeLineupAssignments`.
3. Surface lock state in `team-client.tsx`/`classic-team-manager.tsx`: disable Save/Autofill controls and show a locked indicator once the relevant lock condition is met, matching the existing DFS builder's UX pattern (read `salary-cap-entry-builder.tsx` for the exact visual/interaction convention to mirror).

## Interface contract (produced)
- Classic lineup edits are rejected server-side (not just UI-disabled) once locked. Consumers: none downstream in this plan, but this MUST land before or alongside packet 06 going live in production use (both are wave 2; note in your final report if you land before 06 has merged, since the exploit window is real once real scoring exists).

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- lineup && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 07` / `DONE_WITH_CONCERNS: 07: <one line>` / `BLOCKED: 07: <one line>`.
