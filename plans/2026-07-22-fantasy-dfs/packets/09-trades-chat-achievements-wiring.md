# Packet 09: trades-chat-achievements-wiring

## Objective
Now that packet 02 created the missing schema (and fixed the `fantasy_teams` FK), make achievements/streaks actually earnable (today `awardAchievement`/`updateStreak` have zero callers — nothing in the app ever awards a badge) and give trades a real expiry transition (the `'expired'` status exists in the type union but nothing ever sets it).

## Files
- Modify: `src/lib/fantasy-api.ts` (add achievement/streak hooks at real event points)
- Modify: `src/lib/fantasy-trades.ts` (add expiry check)
- Modify: `src/lib/fantasy-achievements.ts` (if any catalog logic needs adjusting to be triggerable — check first, may need no changes)

## REVISED (post-review, 2026-07-22): wrong signatures, and no idempotent hook point existed

Adversarial review found two real bugs in the original packet: (1) the documented `awardAchievement`/`updateStreak` signatures didn't match the real functions — read the corrected signatures below, taken directly from `fantasy-achievements.ts`; (2) there was no actual idempotent event to hook `updateStreak`/weekly-threshold achievements into — `loadLeagueStandings`/`loadLeagueMatchup` are pure reads invoked on every page view, and `updateStreak` has no "already counted this week" guard, so wiring it into a read path would increment a streak once per page view. **Fixed: packet 06 now provides `settleLeagueWeek(leagueId, week)`, a real idempotent checkpoint — call that, not the read functions, for every weekly/streak-based achievement below.**

## Context facts (verified)
- `ACHIEVEMENT_CATALOG` (14 keys, in `fantasy-achievements.ts`): `FIRST_DRAFT_PICK`, `WIN_STREAK_3/5/7`, `POINTS_100_WEEK`, `POINTS_150_WEEK`, `PERFECT_LINEUP`, `WAIVER_WIRE_HERO`, `COMEBACK_WIN`, `SEASON_CHAMPION`, `CLEAN_SWEEP`, `TOP_SCORER_WEEK`, `TRADE_PARTNER`, `CHAT_STARTER`.
- **Corrected real signatures** (verified directly against `fantasy-achievements.ts`, do not use any other version of these signatures): `awardAchievement(userId: string, key: AchievementKey, leagueId?: string, metadata?: Record<string, unknown>)` — note the ARGUMENT ORDER: `key` is the second parameter, `leagueId` is third and optional, NOT `(userId, leagueId, key)`. `updateStreak(userId: string, leagueId: string, fantasyTeamId: string, streakType: string, won: boolean)` — note the REQUIRED `fantasyTeamId` parameter (third), with no default; pass the acting manager's `fantasy_league_memberships.id` for this, the same membership-id-as-team-id convention packet 02 already established for trades. `updateStreak` upserts and auto-awards `WIN_STREAK_3/5/7` internally when thresholds are hit — you just need to CALL it at the right (idempotent) point.
- Real event points to wire (none currently call these — confirmed by grep, zero external callers of `awardAchievement`/`updateStreak`/`sendNotification` outside their own files):
  - `FIRST_DRAFT_PICK`: in the draft-pick flow (`fantasy-api.ts::makeDraftPick`/`recordDraftPick`) — award on a manager's first-ever pick in a league. This one IS a real one-time mutation event (a draft pick is written once), so it's safe to hook directly, unlike the weekly achievements below.
  - `WIN_STREAK_3/5/7`, `POINTS_100_WEEK`/`POINTS_150_WEEK`/`TOP_SCORER_WEEK`: call `updateStreak(...)`/`awardAchievement(...)` from INSIDE packet 06's `settleLeagueWeek(leagueId, week)` function (or immediately after calling it, gated on `!alreadySettled` — i.e. only on the run that actually performs settlement, never on a run that finds it already settled), not from any read path. If packet 06 hasn't landed when you start (both are wave 2, depending only on 04, not on each other), implement against the documented interface `settleLeagueWeek(leagueId, week) -> { alreadySettled: boolean, results: ... }` and adjust field access once 06's real return shape is available — do not wire against `loadLeagueMatchup`/`loadLeagueStandings` even temporarily, since that reintroduces the double-counting bug this revision exists to prevent.
  - `POINTS_100_WEEK`/`POINTS_150_WEEK`/`TOP_SCORER_WEEK`: same dependency — check a team's weekly point total against the thresholds once real weekly totals exist (packet 06).
  - `PERFECT_LINEUP`: every scoring player in the starting lineup outscored their bench alternative at each slot — this is also a weekly aggregate check, so hook it inside `settleLeagueWeek` alongside the streak/points achievements above, not a read path.
  - `WAIVER_WIRE_HERO`: award when a waiver-added player has a big scoring week (define a simple threshold, e.g. top-3 scorer that week among all rostered players) — also weekly-aggregate, hook inside `settleLeagueWeek`. (The waiver CLAIM itself, in `processWaiverClaims`, is a one-time event but doesn't yet know the player's eventual weekly score — that's only known once the week settles.)
  - `COMEBACK_WIN`: matchup where a team was behind at some checkpoint and won — if no in-progress/checkpoint concept exists after packet 06's real (batch, not live-ticking) scoring, this achievement may not be computable this round; if so, document why and skip it explicitly rather than faking a checkpoint.
  - `SEASON_CHAMPION`/`CLEAN_SWEEP`: end-of-season logic — likely out of scope if no season-end event exists yet; document and skip if so, don't invent an incomplete trigger.
  - `TRADE_PARTNER`: on a completed (accepted) trade — `respondToTrade`.
  - `CHAT_STARTER`: on a league's first-ever chat message — `sendChatMessage`.
- Trade expiry: `TradeProposalRecord` has `review_period_ends_at`; nothing ever transitions status to `'expired'`. Simplest real fix without adding a new cron/job: check-and-transition lazily on read — `loadTradeProposals` (or wherever a pending trade is displayed) checks `now() > review_period_ends_at` and updates status to `'expired'` before returning it (same lazy-transition pattern is common and avoids needing a scheduler, which doesn't exist in this repo per discovery).

## Steps
1. Failing tests first: `updateStreak`/`awardAchievement` get called with correct args at each real event point you wire (mock the Supabase client, assert the call happened with the right league/user/key).
2. Wire the achievable subset above. Explicitly SKIP and document (in your final report, not silently) any achievement that has no real trigger available yet (likely `COMEBACK_WIN`, `SEASON_CHAMPION`, `CLEAN_SWEEP`) — do not fake a trigger to make the count look complete.
3. Add the lazy trade-expiry check to `loadTradeProposals` (or `fantasy-trades.ts`'s equivalent read path).
4. Wire `sendNotification` calls for achievement-earned events if packet 05 landed first (nice-to-have, not blocking — check if `notification-service.ts` is already real; if packet 05 hasn't landed yet, skip this sub-step and note it).

## Interface contract (produced)
- At least 6-8 of the 14 achievements become genuinely earnable. Trade proposals past their review period show as `'expired'` on next read.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- achievements trades && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 09` / `DONE_WITH_CONCERNS: 09: <one line>` / `BLOCKED: 09: <one line>`.
