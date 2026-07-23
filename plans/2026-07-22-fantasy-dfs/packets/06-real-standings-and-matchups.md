# Packet 06: real-standings-and-matchups

## Objective
Replace `fantasy-season-sim.ts`'s hash-based fake scores with real standings and matchups computed from `fantasy_point_snapshots` (packet 04). This is the core of "the fantasy product is real now."

## Files
- Delete: `src/lib/fantasy-season-sim.ts`
- Modify: `src/lib/fantasy-standings.ts` (currently just re-exports `buildSimulatedStandings` — replace with real implementation)
- Modify: `src/lib/fantasy-api.ts` — `loadLeagueStandings`, `loadLeagueMatchup` (real queries against roster/lineup + `fantasy_point_snapshots`, not the simulator)
- Rewrite: `src/app/matchup-center/page.tsx` (currently a fully static marketing page with hardcoded copy — needs to become (or link to) a real per-league view; the actual per-league matchup UI logic may already partially exist elsewhere — check `src/components/matchup/league-matchup-client.tsx`, which is the REAL per-league matchup route component, before assuming this page needs a full rebuild)

## REVISED (post-review, 2026-07-22)
Two fixes from adversarial review:
1. **Week/match mapping is no longer a guess.** Packet 04 now persists `match_date_utc` directly on `fantasy_point_snapshots` — use that column to bucket by week, not a speculative `fantasy_leagues.current_week` field (review confirmed `FantasyLeagueRecord` has no such field) or a fresh crosswalk. Packets 07 and 08 both read the SAME column for their own week/slate bucketing — this is now the one shared source of truth, don't invent a second mapping.
2. **`is_approximated` must reach the UI.** If packet 01 landed on Decision B (season-rate approximation instead of true per-match box scores), `fantasy_point_snapshots.is_approximated` is `true` for those rows. Thread it through: when ANY snapshot contributing to a displayed total has `is_approximated=true`, surface a visible "estimated" label on that total in `FantasyStandingsState`/`FantasyLeagueMatchupState` (add a boolean field for this — this is exactly the "field literally cannot be filled from the existing shape" case the original guidance below allows for). Shipping a number that looks final without this label is the exact anti-fabrication failure this whole plan exists to fix — read `plans/2026-07-22-fantasy-dfs/DATA_SOURCE_DECISION.md` before starting so you know which case you're in.
3. **Provide a real settlement checkpoint for packet 09.** `loadLeagueStandings`/`loadLeagueMatchup` are pure read/compute functions invoked on every page view — they cannot be the hook point for awarding achievements or incrementing win streaks (calling `updateStreak` from inside a read path would increment the streak once per page view, not once per actual result, since `updateStreak` has no idempotency guard). Add a small, separate, idempotent function — e.g. `settleLeagueWeek(leagueId, week) -> { alreadySettled: boolean, results: ... }` — that checks (via a simple marker, such as a `fantasy_league_memberships`-scoped settled-weeks table or a `settled_weeks` jsonb column on `fantasy_leagues`, your call on the simplest real mechanism) whether this league+week was already settled, and if not, computes the real results once and marks it settled. This does NOT need a scheduler/cron — packet 09 will call it lazily (e.g. the first time any user views standings/matchup for a week whose matches have all finished), same "lazy transition on read" pattern packet 09 already uses for trade expiry. Name this function explicitly in your final report so packet 09 (if not yet landed) knows exactly what to call.

## Context facts (verified)
- `loadLeagueStandings()` and `loadLeagueMatchup()` in `fantasy-api.ts` already pull REAL memberships/rosters from Supabase — only the point totals are fake (handed off to `buildSimulatedStandings`/`buildSimulatedMatchup`). You are replacing the scoring input, not the surrounding real query logic. Read both functions fully before changing them.
- Types to preserve the shape of (so downstream components don't need changes beyond what's necessary): `FantasyStandingsState`, `FantasyLeagueMatchupState` (in `src/types/fantasy.ts`) — prefer filling them with real data over redesigning them, unless a field literally cannot be computed for real (e.g. a fabricated "event feed" narrative string, or the new `is_approximated` label above) — in that case, replace it with either the real available data (actual scoring breakdown per player) or an honest empty/absent state, not a fake one.
- Classic league lineups have starters/bench from `fantasy_roster_slots` (real). A team's weekly score = sum of `fantasy_point_snapshots.points` for that team's STARTING lineup's players, for matches whose `match_date_utc` falls in that scoring week. Derive week boundaries from `fantasy-slate-engine.ts`'s weekly windows if that concept fits; do not invent a second, inconsistent week-boundary source — packets 07/08 need to agree with whatever you pick, so state your exact boundary logic in your final report.
- No match has been played yet for many leagues/weeks — real standings/matchups MUST handle "no snapshots exist yet for this week" as a real, honest state (0-0, "not yet played" / "pending"), not by falling back to fake numbers. This was explicitly flagged as a risk by discovery: don't just delete the simulator, replace it with a real function that degrades gracefully.
- `playoff_cutoff: Math.min(4, memberships.length)` — keep this number, no bracket logic needed this round (out of scope per manifest).

## Steps
1. Failing tests first: given a league with real memberships/rosters and a handful of `fantasy_point_snapshots` rows (mocked Supabase responses), the new standings function computes correct wins/losses/points_for/points_against by actually summing snapshot points for each team's starters — hand-compute the expected numbers in the test.
2. A second test: a week with ZERO snapshots for any player produces a "not yet scored" state per matchup, not a crash and not a fake number.
3. Implement real `loadLeagueStandings`/`loadLeagueMatchup` in `fantasy-api.ts`, delete `fantasy-season-sim.ts`, update `fantasy-standings.ts`'s re-export.
4. Check `league-matchup-client.tsx` and `matchup-center/page.tsx` for what they actually need from the new real data shape; update only what's necessary to remove any remaining fabricated-narrative rendering (e.g. `liveMoments` hardcoded copy strings) — replace with real per-player point breakdowns from the snapshot `breakdown` jsonb, or omit if genuinely not derivable.
5. Confirm `league-standings-client.tsx` still renders correctly against the real data shape (read it, adjust only if the shape changed).

## Interface contract (produced)
- `loadLeagueStandings`/`loadLeagueMatchup` return real data, sourced from `fantasy_point_snapshots`, bucketed by `match_date_utc`, with an honesty label when `is_approximated` is present. A new `settleLeagueWeek(leagueId, week)` idempotent checkpoint function. Consumers: standings/matchup UI, packet 07 (reuses the same week/match-date bucketing logic — name it explicitly, e.g. export a small `getMatchWeek(matchDateUtc)` helper if that's cleaner than duplicating the boundary logic), packet 08 (same, for slate bucketing), packet 09 (calls `settleLeagueWeek` as its real achievement/streak trigger point, not the read functions).

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- standings matchup && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 06` / `DONE_WITH_CONCERNS: 06: <one line>` / `BLOCKED: 06: <one line>`.
