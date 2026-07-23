# Fantasy + DFS Build-Out (2026-07-22)

## Goal

Turn the fantasy/DFS product from "looks complete, mostly fake underneath" into a real product: real per-match scoring feeding real standings, real matchups, and a real DFS leaderboard; fix the six Supabase tables that don't exist so trades/chat/achievements stop 500ing; close the classic-lineup lock exploit; wire notifications end to end; give admin real teeth; clean up the dead/orphaned backend. Grounded in a 7-lens discovery pass (`wf_47d50fb7-eed`, ~980K tokens) that read the actual code and cross-checked the live Supabase project (`PrizmLounge`, `rnfvmqflktghriqefatc`).

Done means:
1. Real per-match player stat lines land in Supabase and drive real fantasy points (no more `fantasy-season-sim.ts` hash-based fabrication).
2. Classic-league standings and weekly matchups read real scores. DFS leaderboard reads real scores. Both gracefully show "not yet played" / "no data" states, not fake numbers, when data is genuinely absent.
3. The six missing tables (`fantasy_trade_proposals`, `fantasy_trade_assets`, `fantasy_trade_votes`, `fantasy_chat_messages`, `fantasy_achievements`, `fantasy_streaks`) exist via a real migration; the `fantasy_teams` FK mismatch in trades is fixed; achievements/streaks actually get awarded from real events (draft complete, matchup win, waiver win, chat sent).
4. Classic weekly lineups lock at kickoff like DFS entries already do.
5. Notifications have a real producer (trade/draft/waiver/lock events call `sendNotification`), delivered through the existing-but-unused `fantasy_notifications` Supabase table (migrating off the orphaned Prisma/NextAuth backend, not adding to it).
6. `/admin` persists real `ScoringOverride`/`AuditLog` rows and shows real job status; gated behind an actual admin check (there is none today).
7. Dead code removed: `demo-data.ts`, the orphaned `src/jobs/` scaffold, the NextAuth Credentials provider's password-bypass bug (fixed or the whole unreachable path removed — decided in packet 03).
8. Full verification green: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, from repo root.

## What this explicitly does NOT build (out of scope, name it so nobody assumes it's covered)
- Multi-entry / open-field / prize-pool DFS contests (today's DFS is single-entry inside a coded private league — that architecture is not changed).
- A real-time live-scoring ticker during matches (this round lands post-match/batch scoring; live in-game updates are a follow-on).
- Server-enforced draft-clock autopick (needs a Supabase Edge Function + cron; this round fixes the misleading UI copy and documents the real fix as a follow-on, see packet 12).
- Playoff bracket generation for classic leagues.
- A public admin-role system beyond a single hardcoded allowlist check (real RBAC is a follow-on).

## Architecture facts every packet inherits (verified against source + the live Supabase project)

- **Two backends coexist; only one is real.** Supabase (via `src/lib/fantasy-api.ts`, called directly from browser client components, secured by Postgres RLS) is the live, load-bearing backend for everything: auth, leagues, drafts, rosters, lineups, waivers, salary-cap entries. Prisma + NextAuth is a fully parallel, orphaned system: NextAuth is unreachable from any UI code and its Credentials provider never checks passwords. **Distinguish the job PLUMBING from the job BODIES**: `src/lib/jobs/registry.ts` + `src/app/api/jobs/route.ts` are real, live-wired code (the route genuinely imports and calls the registry) — packets 03/04/10 correctly treat this plumbing as real and build on it. Only the 4 pre-existing job IMPLEMENTATIONS (`fixture-sync`, `stat-line-sync`, `fantasy-scoring`, `availability-sync`) are Prisma-backed and functionally incomplete (no scheduler, and `fantasy-scoring` computes but never persists its result) — those bodies are what's orphaned, not the registry/route mechanism itself. **New work in this plan is Supabase-native and may register new jobs into the real `src/lib/jobs/registry.ts`. Do not add new Prisma-backed job bodies.**
- **The live Supabase project is shared** across many of Zach's other apps (Panini, NBA/NCAA props, World Cup, UGC pipelines, etc.) — dozens of unrelated tables live in the same `public` schema. All new tables MUST use the `fantasy_` prefix (matching the existing 12 tables), MUST be created via a proper `supabase/migrations/*.sql` file (never a manual dashboard change — that's exactly how the 6 missing tables became a problem), and MUST have RLS enabled from creation with real policies (never ship a new table with RLS off).
- **Confirmed live schema** (`list_tables` against project `rnfvmqflktghriqefatc`, 2026-07-22): `fantasy_profiles`, `fantasy_leagues`, `fantasy_league_memberships`, `fantasy_drafts`, `fantasy_draft_picks`, `fantasy_draft_queue_items`, `fantasy_roster_slots`, `fantasy_waiver_claims`, `fantasy_transactions`, `fantasy_salary_cap_entries`, `fantasy_salary_cap_entry_slots`, `user_lists`, and — not found by static discovery — `fantasy_notifications` (0 rows, RLS on, unused by any current code). Confirmed **absent**: `fantasy_trade_proposals`, `fantasy_trade_assets`, `fantasy_trade_votes`, `fantasy_chat_messages`, `fantasy_achievements`, `fantasy_streaks`, `fantasy_teams`.
- **The real fantasy points math already exists and is tested**: `src/lib/scoring/scoring-engine.ts` (`calculateFantasyScore`, `calculateAggregateFantasyScore`) against `src/lib/scoring/scoring-rules.ts` (`launchScoringRules`). Reuse it; do not reinvent scoring math.
- **The real player pool is a static, real-data snapshot**: `src/lib/generated/fantasy-player-pool.generated.ts` (14.8k lines, real 2025 NWSL season stats, generated 2026-03-13 by `pnpm players:sync` / `scripts/sync-official-nwsl-player-pool.ts` against `api-sdp.nwslsoccer.com`). Not touched by this plan except where a packet explicitly says so.
- **`demo-data.ts` is confirmed dead code** (zero importers). **`local-mode-store.ts` is a real, live-wired offline fallback** (not demo data) — do not delete it; it's what the app degrades to when Supabase env vars are absent.
- **The official NWSL API** (`api-sdp.nwslsoccer.com`, no auth) exposes season-aggregate player stats (`/seasons/{id}/stats/{entity}?category=...` — goals, assists, shots, tackles, saves, cards, etc.) and per-match lineups with substitution events (`/seasons/{id}/matches/{id}/lineups`), but the current code (`nwsl-model/src/data/official_api.py::flatten_match_lineup`) only parses `substitution-in`/`substitution-out` event types from that per-match payload — it is UNKNOWN whether the same `events` array also carries goal/card event types, because nobody has inspected a raw payload for anything beyond substitutions. **Packet 01 verifies this live before any scoring-ingest work is designed against it.**
- Test/build commands (repo root): `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test` (vitest), `pnpm typecheck` (tsc --noEmit), `pnpm lint` (eslint), `pnpm prisma:generate`/`prisma:validate`/`db:push`, `pnpm players:sync`. Vitest config: jsdom, `src/**/*.test.{ts,tsx}`, no MSW/global fixtures beyond jest-dom matchers.
- Commit messages: no em dashes, conventional prefixes. Additive-only database changes. Never touch a table without a `fantasy_` (or explicitly named) prefix that isn't listed as this plan's own.

## Decision record (standing authorization: Zach, 2026-07-22, "yes I want the fantasy and DFS side built out too" + "finish the full build ... without waiting for me")

- D1 Backend: consolidate on Supabase. Prisma/NextAuth become explicitly deprecated (packet 03 decides delete-vs-quarantine); no new feature adds a Prisma table.
- D2 Scoring data source: decided live by packet 01's spike, not guessed here. Two acceptable outcomes: (a) official API's per-match events include goal/card/assist event types — build true per-match scoring; (b) they don't — build a documented, clearly-labeled approximation from season-rate stats until a richer provider is added, and say so honestly in the UI (same fail-honest spirit as the betting-model side of this repo).
- D3 Migration safety: every new table gets RLS + policies in the same migration file that creates it, mirroring the existing `fantasy_league_memberships`-style ownership pattern already proven in this schema.
- D4 Notifications: migrate onto the existing unused `fantasy_notifications` Supabase table rather than fixing the Prisma path, consistent with D1.
- D5 Scope discipline: the "explicitly NOT built" list above stands; do not let any packet quietly expand into it.

## Status protocol (orchestrator-enforced, same convention as the model-lab plan)
Each packet's agent ends with exactly one line: `DONE: <packet-id>`, `DONE_WITH_CONCERNS: <packet-id>: <one line>`, or `BLOCKED: <packet-id>: <one line>`.

## Task index

| id | name | files touched (create*, modify, run-only) | depends | wave |
|----|------|---------------------------------------------|---------|------|
| 01 | scoring-data-source-spike | *plans/2026-07-22-fantasy-dfs/DATA_SOURCE_DECISION.md (research/decision only, may touch nwsl-model/src/data/official_api.py to add a parser if events confirm goal/card types) | - | 0 |
| 02 | missing-schema-migration | *supabase/migrations/2026xxxx_fantasy_social_tables.sql, src/lib/fantasy-trades.ts (fantasy_teams join fix) | - | 0 |
| 03 | dead-code-and-security-cleanup | src/lib/demo-data.ts (delete), src/jobs/ (delete or quarantine), src/lib/auth.ts, src/app/api/auth/[...nextauth]/route.ts, src/features/shared/components/fantasy-auth-gate.tsx, src/app/admin/page.tsx (role gate only, not full rewrite) | - | 0 |
| 04 | real-scoring-ingest | *src/lib/scoring/match-stat-ingest.ts (or equivalent, per packet 01's decision), *supabase/migrations for fantasy_player_match_stats + fantasy_point_snapshots, wiring into a real Supabase-native job/script | 01, 02 | 1 |
| 05 | notifications-producer-wiring | src/lib/notifications/ (rewritten onto Supabase fantasy_notifications), src/app/api/notifications/route.ts, src/lib/fantasy-trades.ts, src/lib/fantasy-chat.ts, src/lib/fantasy-api.ts (call sites) | 02 | 1 |
| 06 | real-standings-and-matchups | src/lib/fantasy-standings.ts, src/lib/fantasy-season-sim.ts (removed/replaced), src/lib/fantasy-api.ts (loadLeagueStandings/loadLeagueMatchup), src/app/matchup-center/page.tsx | 04 | 2 |
| 07 | classic-lineup-lock-enforcement | src/lib/fantasy-api.ts (writeLineupAssignments), src/lib/fantasy-draft.ts or a new lock-helper mirroring fantasy-salary-cap.ts's isSalaryCapEntryLocked, src/components/lineup/team-client.tsx, src/features/classic/components/classic-team-manager.tsx | 04 | 2 |
| 08 | dfs-real-leaderboard | src/features/matchup/components/salary-cap-matchup-placeholder.tsx (rebuilt, not patched), src/lib/fantasy-api.ts (new leaderboard query), src/components/matchup/league-matchup-client.tsx | 04 | 2 |
| 09 | trades-chat-achievements-wiring | src/lib/fantasy-achievements.ts (call sites), src/lib/fantasy-trades.ts (expiry), integration points in fantasy-api.ts (calls packet 06's settleLeagueWeek, draft completion, waiver win) | 02, 06 | 2 |
| 10 | admin-real-wiring | src/app/admin/page.tsx (Scoring + Data feeds tabs made real), a small server route or direct Supabase call for ScoringOverride-equivalent persistence, override-check lines inside packet 06's loadLeagueStandings/loadLeagueMatchup and packet 08's leaderboard query | 02, 03, 06, 08 | 3 |
| 11 | dfs-availability-enforcement | src/lib/fantasy-salary-cap.ts (isPlayerEligibleForSalaryCapSlot), src/components/lineup/salary-cap-entry-builder.tsx, src/lib/fantasy-salary-cap.test.ts (creates) | - | 3 |
| 12 | draft-clock-copy-fix | src/components/draft/first-pick-guide.tsx, *plans/2026-07-22-fantasy-dfs/AUTOPICK_FOLLOWUP.md | - | 3 |
| 13 | test-coverage-critical-paths | *src/lib/fantasy-slate-engine.test.ts, *src/lib/fantasy-modes.test.ts, *src/lib/scoring/scoring-rules.test.ts, extends src/lib/fantasy-salary-cap.test.ts (packet 11 creates it), tests for packets 04/06/07/08's new code | 04, 06, 07, 08, 11 | 3b |
| 14 | final-verification | run-only: pnpm test/typecheck/lint/build, dev-server smoke, *plans/2026-07-22-fantasy-dfs/VERIFICATION_SUMMARY.md | 09, 10, 11, 12, 13 | 4 |

Wave conflict rule: `src/lib/fantasy-api.ts` is large (2366 lines, ~30 functions) and touched by packets 05, 06, 07, 08, 09, 10 across waves 1-3 — each packet edits only its own named functions within the file; packets in the SAME wave that both need it (none do, by design: 05 is wave 1 alone touching fantasy-api.ts, 06/07/08/09 are wave 2 but touch disjoint functions; 10 was moved to wave 3, AFTER 06/08 land, specifically because its interface contract requires editing functions 06 and 08 own — dispatching it same-wave as them was the review's critical wave-conflict finding). `src/lib/fantasy-season-sim.ts` is deleted by packet 06 only. Packet 11 creates `fantasy-salary-cap.test.ts`; packet 13 (now wave 3b, after 11) extends that same file rather than creating it — check it exists before writing, exactly as packet 13 already does for packets 04/06/07/08's test files.
