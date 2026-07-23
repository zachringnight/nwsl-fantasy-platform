# Adversarial Review Notes (2026-07-22)

Four-lens review (contracts, wave/dependency correctness, feasibility, scope-safety) run against the manifest and 14 packets, cross-checked against the live codebase and the live Supabase project (`PrizmLounge`, `rnfvmqflktghriqefatc`). Workflow `wf_e90b6c53-f00`, 4 agents, ~584K tokens, 146 tool calls.

## Fixed

| # | Severity | Packet | Finding | Fix |
|---|----------|--------|---------|-----|
| 1 | critical | 02 | `fantasy_teams` join fix repointed the FK but kept selecting/reading `.name`, a column that doesn't exist on `fantasy_league_memberships` (real column is `team_name`) — would silently return `undefined` forever, not error, since `loadTradeProposals` swallows query errors into `[]` | Corrected to select and read `.team_name`; documented both required changes together |
| 2 | critical | 06, 09 | Both packets assumed a "matchup-settlement event" exists to hook achievement/streak awards into, but `loadLeagueStandings`/`loadLeagueMatchup` are pure reads invoked on every page view with no idempotency guard — wiring achievements there would double/triple-count | Packet 06 now produces a real idempotent `settleLeagueWeek(leagueId, week)` checkpoint; packet 09 hooks there instead |
| 3 | critical | 04 (consumed by 06/07/08) | The new scoring tables had no match-date column, but three downstream packets each needed one and had no path to add it themselves | Added `match_date_utc` to both new tables in packet 04; 06/07/08 now read it directly instead of guessing three different crosswalks |
| 4 | critical | 10 | Scheduled in the same wave as, needing to edit the same functions as, packets 06 and 08, with no dependency edge forcing the right order | Moved packet 10 to wave 3, added explicit dependency on 06 and 08 |
| 5 | major | 09 | Documented `awardAchievement`/`updateStreak` signatures didn't match the real functions (argument order swapped; a required `fantasyTeamId` parameter omitted entirely) | Corrected to the real signatures, with the membership-id convention already established for trades |
| 6 | major | 02 | `fantasy_streaks.fantasy_team_id` has the identical "fantasy_teams doesn't exist" problem trades got a full fix for, but streaks got no guidance | Added the same FK-to-`fantasy_league_memberships` fix |
| 7 | major | 05 | Notification call sites include two trade events, but the ported Prisma `NotificationType` enum has no trade-related value | Added `TRADE_PROPOSED`/`TRADE_RESPONDED` to the ported union |
| 8 | major | 06, 08 | The `is_approximated` honesty flag (mandated by manifest D2 if packet 01 lands on the approximation path) was created by packet 04 but never instructed to reach the UI — exactly the anti-fabrication failure this plan exists to prevent | Added explicit instructions to surface an "estimated" label whenever true |
| 9 | major | 11, 13 | Undeclared same-wave dependency: packet 13 must test packet 11's new logic and both create the same test file (`fantasy-salary-cap.test.ts`) with no ordering | Packet 13 moved to wave 3b (after 11); 13 now extends rather than creates that file |
| 10 | major | 01 | Two dead-code side effects: cited two CSV files that don't exist in the repo, and conditionally modified Python code (`official_api.py`) that packet 04's TS-first design would never call | Corrected file references to real, working sources; dropped the Python modification, keep the decision documentation-only |
| 11 | minor | 13 | "packet 07's tests" should say "packet 08's tests" (leaderboard tie-break is packet 08's deliverable) | Fixed |
| 12 | minor | manifest | Described `src/lib/jobs/` wholesale as "orphaned," contradicting packets 03/04/10 which correctly treat the registry+route plumbing as real (only the 4 pre-existing job bodies are Prisma-backed/incomplete) | Tightened wording to distinguish plumbing (real) from bodies (incomplete) |

## Explicitly not fixed (by direct user instruction, 2026-07-22: "don't worry about security or RLS concerns")

- **Packet 10, critical finding**: the new `fantasy_scoring_overrides` table had no DB-level write authorization specified beyond packet 03's client-side admin-email allowlist — as written, any authenticated user (not just an allowlisted admin) could plausibly write rows that change what real users see in shared standings/leaderboards, since this schema's only established RLS precedent is self-row-or-commissioner, not an admin role. Left as written per explicit instruction.
- **Packet 05, major finding**: several required notification call sites write a row for a DIFFERENT user than the one performing the action (e.g. notify a trade receiver), which this schema's existing RLS convention (self-row-only, or commissioner) does not support from a direct client-side insert — the packet's "match the existing convention" guidance doesn't actually resolve to a working pattern for this case. Left as written per explicit instruction.

If either of these ships as-is and doesn't work in practice (overrides silently rejected by RLS, or cross-user notifications silently never delivered), that will surface as a runtime/production issue rather than a build-time one — worth a follow-up pass if it becomes a real problem.

## Confirmed sound as originally written
Packets 03, 07 (once given the `match_date_utc` column directly), 11, 12, 14. Wave partitioning outside the packet-10 issue was confirmed clean.
