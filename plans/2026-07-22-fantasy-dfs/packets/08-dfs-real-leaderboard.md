# Packet 08: dfs-real-leaderboard

## Objective
Replace `SalaryCapMatchupPlaceholder` — a component literally named "Placeholder," rendering hardcoded fake leaderboard entries and fake score drivers with zero real data props — with a real leaderboard that scores every submitted entry for a slate against `fantasy_point_snapshots` and ranks them.

## Files
- Rewrite: `src/features/matchup/components/salary-cap-matchup-placeholder.tsx` (rename to drop "placeholder" from the name once real, e.g. `salary-cap-leaderboard.tsx`, and update its one import site)
- Modify: `src/components/matchup/league-matchup-client.tsx` (currently passes ZERO real props into the placeholder — must now pass leagueId/slate/entries)
- Modify: `src/lib/fantasy-api.ts` (new function: leaderboard query for a slate)

## Context facts (verified)
- `SalaryCapMatchupPlaceholder`'s current props are only `modeDescription`/`onSwitchSlate`/`playersHref`/`teamHref` — no data. `league-matchup-client.tsx` renders it with `modeConfig.usesSalaryCap` true and passes nothing real.
- Real data already exists to build this from: `fantasy_salary_cap_entries`/`fantasy_salary_cap_entry_slots` (submitted lineups, real, Supabase-wired) joined against `fantasy_point_snapshots` (packet 04) for the slate's matches.
- A "slate" today is a `fantasy-slate-engine.ts` static window (start/end/lock timestamps, no real fixture list) — for leaderboard scoring purposes you need to know which official-API `match_id`s fall inside a slate's date window. **Packet 04 persists `match_date_utc` directly on `fantasy_point_snapshots` — filter snapshots where `match_date_utc` falls between the slate's `startsAt`/`endsAt`, no separate crosswalk needed.**
- **`is_approximated` honesty label.** If `plans/2026-07-22-fantasy-dfs/DATA_SOURCE_DECISION.md` says Decision B (season-rate approximation) was chosen, some snapshots carry `is_approximated=true`. When any entry's total includes an approximated snapshot, label that entry's total "estimated" in the leaderboard, distinct from the existing pre-lock "projected" label (projected = no real data landed yet; estimated = real snapshot exists but is itself an approximation, not a true per-match box score). Do not silently present an approximated total as a final, exact number.
- Single-entry-per-user-per-slate today (confirmed architecture) — the leaderboard is "rank every league member's one entry for this slate," not an open-field contest (that's explicitly out of scope, see manifest).
- No `actual_points`/live score field exists on `FantasySalaryCapEntryRecord`/`Slot` types today — this packet computes it on read (sum snapshot points for the entry's 9 rostered players), it doesn't need to be persisted onto the entry row itself unless that's clearly simpler; prefer computing on read to avoid another write path to keep in sync.

## Steps
1. Failing tests first: given a slate with 3 submitted entries and real snapshot points for the relevant players, the new leaderboard query returns entries ranked by total points descending, with correct per-entry totals (hand-computed in the test).
2. Implement the leaderboard query in `fantasy-api.ts`.
3. Rewrite the component: real leaderboard table (rank, manager, total points, maybe top scorer), real "score drivers" (top-N players by points across all entries in the slate, computed from real snapshots, not hardcoded names). Handle the "slate hasn't started / no snapshots yet" state honestly (show projected points from `average_points`, clearly labeled "projected" vs "final" once real snapshots exist — don't silently blend the two).
4. Wire real props through `league-matchup-client.tsx`.

## Interface contract (produced)
- A real, data-driven DFS leaderboard component and its backing query. No downstream consumers in this plan.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- leaderboard salary-cap-matchup && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 08` / `DONE_WITH_CONCERNS: 08: <one line>` / `BLOCKED: 08: <one line>`.
