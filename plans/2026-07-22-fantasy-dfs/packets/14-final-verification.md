# Packet 14: final-verification

## Objective
Confirm the whole fantasy/DFS build works together: full test/typecheck/lint/build green, a real dev-server smoke pass through the core loops (create league → draft → set lineup → see real standings; create DFS entry → see real leaderboard), and an honest summary of what's real now versus what's still explicitly out of scope.

## Files
- Run-only. Output: `plans/2026-07-22-fantasy-dfs/VERIFICATION_SUMMARY.md`

## Steps
1. `cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm install && pnpm test && pnpm typecheck && pnpm lint && pnpm build`
2. If `pnpm build` succeeds, start the dev server (`pnpm dev`, background) and, using the browser tools available to you, smoke-test:
   - Sign up / log in (real Supabase auth or local-mode fallback if Supabase env vars aren't configured in this environment — note which mode you're actually in).
   - Create a classic league, verify draft room loads.
   - Create a salary-cap (DFS) league, verify the entry builder loads with real player pool data and the availability badges from packet 11 are visible.
   - If any real match snapshots exist (from packet 04's ingest having been run against a real completed match), verify standings/leaderboard show real, non-fabricated numbers — otherwise verify they show an honest "not yet scored" state, not a fake one.
   - Visit `/admin` as a non-allowlisted user (should be blocked) and, if you can configure `ADMIN_USER_EMAILS` for a test session, as an allowlisted user (should show real, empty-but-functional Scoring/Data-feeds tabs).
3. Write `VERIFICATION_SUMMARY.md`: {test: pass/fail counts, typecheck: pass/fail, lint: pass/fail, build: pass/fail, smoke_test_notes: what you actually clicked through and what you saw, real_vs_still_mock: an honest final list of what's now real (standings, matchups, leaderboard, notifications, trades/chat/achievements schema, admin) versus what's explicitly still out of scope per the manifest (multi-entry DFS, live in-game ticker, server-enforced autopick, playoff brackets, full RBAC) — this is the section Zach will actually read}.

## Failure policy
A red test, failed build, or broken smoke-test step is reported honestly with output inline — DONE_WITH_CONCERNS (or BLOCKED if verification cannot run at all). Never edit code to force a check to pass silently; that's the next session's work.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && cat plans/2026-07-22-fantasy-dfs/VERIFICATION_SUMMARY.md
```
Expected: file exists, non-empty, all four commands' pass/fail states are stated explicitly (not implied).

## Done-signal
End with exactly one line: `DONE: 14` / `DONE_WITH_CONCERNS: 14: <one line>` / `BLOCKED: 14: <one line>`.
