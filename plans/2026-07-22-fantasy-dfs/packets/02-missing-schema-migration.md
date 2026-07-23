# Packet 02: missing-schema-migration

## Objective
Create the six Supabase tables that real, UI-wired code already depends on but that don't exist anywhere (not in tracked migrations, not in the live database — confirmed via `list_tables` against project `rnfvmqflktghriqefatc` on 2026-07-22). Fix the `fantasy_teams` FK mismatch in trades. Without this, trades/chat/achievements 500 on first real use.

## Files
- Create: `supabase/migrations/2026xxxx_fantasy_social_tables.sql` (pick a timestamp prefix later than the existing 8 migration files; `ls supabase/migrations/` to see the naming convention and pick the next one)
- Modify: `src/lib/fantasy-trades.ts` (the `fantasy_teams!fantasy_trade_proposals_proposer_team_id_fkey` join alias references a table that was never modeled; fix the join to use `fantasy_league_memberships`, which is how the rest of the app models "team")

## REVISED (post-review, 2026-07-22): the join fix needs a column rename too, and streaks has the identical FK gap

Adversarial review verified the live `fantasy_league_memberships` schema directly: its columns are `id, league_id, user_id, role, display_name, team_name, joined_at, draft_slot, waiver_priority` — **there is no `name` column, only `team_name`.** `fantasy-trades.ts` currently selects `fantasy_teams!...( name )` and reads `.name` off the joined row (2 call sites in `loadTradeProposals`). Simply repointing the FK/alias at `fantasy_league_memberships` without also changing `( name )` → `( team_name )` in the select AND the two `.name` reads to `.team_name` will not error — `pnpm typecheck` cannot catch it, since the join is a Postgrest string template, not a typed query — it will just silently return `undefined` for every team name forever, and `loadTradeProposals` has `if (error) return []`, so a broken query there fails silent-empty too. Both changes are required together. Same pattern everywhere else in the app reads a membership's label via `.team_name` (grep confirms 15+ call sites) — `team_name` is the established convention.

Also: `fantasy_streaks` has the IDENTICAL "fantasy_teams doesn't exist" problem the trades fix below resolves, but it's easy to miss since it's not phrased as a join alias — `StreakRecord` in `src/types/fantasy.ts` requires a non-optional `fantasy_team_id: string`, and `fantasy-achievements.ts`'s real `loadStreaks`/`updateStreak` select and upsert that column. Point `fantasy_streaks.fantasy_team_id` at `fantasy_league_memberships(id)` for the same reason as the trades tables.

## Context facts (verified against source and the live database)
- Confirmed absent live: `fantasy_trade_proposals`, `fantasy_trade_assets`, `fantasy_trade_votes`, `fantasy_chat_messages`, `fantasy_achievements`, `fantasy_streaks`, `fantasy_teams`.
- `src/types/fantasy.ts` has the TS shapes these tables need to match: `TradeProposalRecord`, `TradeProposalStatus` ('pending'|'accepted'|'rejected'|'vetoed'|'canceled'|'expired'), `ChatMessageRecord`, `AchievementKey`, plus whatever streak/trade-asset/trade-vote shapes exist near them — read this file fully before writing DDL, the columns must match exactly what `fantasy-trades.ts`/`fantasy-chat.ts`/`fantasy-achievements.ts` actually select/insert.
- `src/lib/fantasy-trades.ts` functions to match columns against: `loadTradeProposals` (joins `fantasy_teams!fantasy_trade_proposals_proposer_team_id_fkey ( name )` at two call sites — THIS ALIAS AND SELECTED COLUMN MUST CHANGE to `fantasy_league_memberships!fantasy_trade_proposals_proposer_team_id_fkey ( team_name )`, and the two `.name` property reads on the joined row must become `.team_name`, per the REVISED section above), `createTradeProposal` (inserts `fantasy_trade_proposals` with review_period_ends_at, veto_threshold; inserts `fantasy_trade_assets` rows for both sides), `respondToTrade` (conditional UPDATE WHERE status='pending'), `voteOnTrade` (upserts `fantasy_trade_votes` on `(trade_proposal_id, fantasy_team_id)` — keep the column NAME `fantasy_team_id`, just have it actually FK to `fantasy_league_memberships.id`), `cancelTrade`.
- `src/lib/fantasy-chat.ts`: `loadChatMessages` selects from `fantasy_chat_messages` joined to `fantasy_profiles` for `display_name`, paginated via a `before` cursor; `sendChatMessage` validates length <=500, inserts, fetches sender's display_name separately.
- `src/lib/fantasy-achievements.ts`: `ACHIEVEMENT_CATALOG` (14 keys — read the file for the exact list), `loadMyAchievements`/`loadLeagueAchievements` read `fantasy_achievements`, `awardAchievement` upserts on `(user_id, league_id, key)` — idempotent, `loadStreaks`/`updateStreak` read/write `fantasy_streaks` keyed `(league_id, user_id, streak_type)`.
- Existing RLS pattern to mirror: read `supabase/migrations/20260312_phase2_draft_system.sql` (or the roster-slots migration) for how membership-scoped RLS policies are written in this schema (policies keyed off `fantasy_league_memberships` ownership) — reuse that exact pattern for the new tables' policies (a user can read/write rows for leagues they're a member of; chat/achievements/streaks are league-scoped the same way trades are).

## Steps
1. `ls supabase/migrations/` and read the 2 most recent files to confirm the exact SQL style (naming, RLS policy phrasing, `created_at`/`updated_at` conventions, whether `gen_random_uuid()` or `uuid_generate_v4()` is used) this codebase already uses — match it exactly, don't introduce a new style.
2. Write DDL for `fantasy_chat_messages`, `fantasy_achievements`, `fantasy_streaks`, `fantasy_trade_proposals`, `fantasy_trade_assets`, `fantasy_trade_votes` with columns matching exactly what the TS types and the data-access functions in step-above need — do not add speculative columns beyond what's actually read/written today.
3. Enable RLS on every new table in the SAME migration file, with policies scoped to league membership (a user can read/write rows for leagues where they have a `fantasy_league_memberships` row). Copy the exact policy-writing pattern from the existing migrations.
4. Fix `fantasy-trades.ts`'s `fantasy_teams!fantasy_trade_proposals_proposer_team_id_fkey` join: point the FK the new `fantasy_trade_proposals.proposer_team_id` (and `receiver_team_id`) columns at `fantasy_league_memberships(id)` in the DDL (name the constraint explicitly so the Supabase-js alias is predictable — `CONSTRAINT fantasy_trade_proposals_proposer_team_id_fkey FOREIGN KEY (proposer_team_id) REFERENCES fantasy_league_memberships(id)`), update the join alias string in `fantasy-trades.ts` from `fantasy_teams!...` to `fantasy_league_memberships!...`, change the selected column from `( name )` to `( team_name )` in BOTH join sites, and change the two `.name` property reads on the joined row to `.team_name`. Also point `fantasy_streaks.fantasy_team_id` at `fantasy_league_memberships(id)` with the same reasoning.
5. Apply the migration to the live project (this is the shared production database — additive only, no destructive statements): use the Supabase MCP `apply_migration` tool if available in this session, or `supabase db push` if the CLI is configured; confirm success by re-running `list_tables` and seeing all six new tables present with RLS enabled.
6. Do not touch any table not listed above. Do not modify any existing migration file — only add a new one.

## Interface contract (produced)
- Six new tables live in Supabase, RLS-on, matching what `fantasy-trades.ts`/`fantasy-chat.ts`/`fantasy-achievements.ts` already expect (modulo the `fantasy_teams` → `fantasy_league_memberships` fix). Consumers: packet 09 (wires real award/expiry logic on top of this schema), packet 14 (verifies end to end).

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm typecheck
```
Expected: no new type errors from the `fantasy-trades.ts` join-alias change. Then confirm live schema (requires Supabase MCP access in this session):
list_tables on project `rnfvmqflktghriqefatc` shows `fantasy_chat_messages`, `fantasy_achievements`, `fantasy_streaks`, `fantasy_trade_proposals`, `fantasy_trade_assets`, `fantasy_trade_votes` all present with `rls_enabled: true`.

## Done-signal
End with exactly one line: `DONE: 02` / `DONE_WITH_CONCERNS: 02: <one line>` / `BLOCKED: 02: <one line>`.
