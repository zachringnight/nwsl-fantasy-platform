# Packet 04: real-scoring-ingest

## Objective
Build the real, persisted fantasy-scoring pipeline: ingest per-match player performance, compute fantasy points with the existing real scoring engine, persist per-player-per-match snapshots in Supabase. This is the single biggest gap found across the entire discovery pass — nothing today writes a real fantasy-points number anywhere the UI reads.

## Files
- Create: `supabase/migrations/2026xxxx_fantasy_scoring_tables.sql` (next timestamp after packet 02's migration)
- Create: `src/lib/scoring/match-stat-ingest.ts` (or the name packet 01 recommends)
- Create: a runnable entry point — either a new `src/lib/jobs/` addition (the REAL job system, not `src/jobs/`) exposed via the existing `/api/jobs` route, OR a standalone `scripts/*.ts` script run via `pnpm tsx`, whichever fits the codebase's existing convention better (the real job registry pattern in `src/lib/jobs/registry.ts` is the more consistent choice — prefer it)
- Create: `src/lib/scoring/match-stat-ingest.test.ts`

## FIRST: read `plans/2026-07-22-fantasy-dfs/DATA_SOURCE_DECISION.md` (packet 01's output) in full before writing any code

That file tells you which of the two designs below to build. It also documents the exact event-type strings / stats field names to parse — that documentation is sufficient; do NOT call into any Python code `official_api.py` gained during packet 01's spike (there is no TS-to-Python bridge anywhere in this repo — grep confirms zero `child_process`/`spawn`/`execSync` usage in `scripts/` or `src/`). Implement the parsing natively in TypeScript per the "PREFER pure TS" instruction below; packet 01's Python addition, if any, is reference documentation only, not a dependency of this packet.

## REVISED (post-review, 2026-07-22): match date is a hard requirement, not optional

Adversarial review found that packets 06, 07, and 08 all independently need to map a `match_id` to its real calendar date (to bucket points into scoring weeks, determine lineup-lock timing, and determine which matches fall in a DFS slate window) — and this packet's original schema had no such column, leaving all three downstream packets to guess or invent inconsistent crosswalks. Fixed below: this packet now persists the date once, at the one point it's cheapest to capture (you're already fetching the per-match/season payload that contains it).

## Context facts (verified)
- `src/lib/scoring/scoring-engine.ts::calculateFantasyScore(input: StatLineInput, rules?: FantasyScoringRules) -> FantasyScoreResult` is the real, tested scoring math — reuse it exactly, do not reimplement. `StatLineInput`'s exact shape is in that file; your ingest must map whatever raw provider data you get into that shape.
- `src/lib/scoring/scoring-rules.ts::launchScoringRules` is the ruleset (goals/assists/cards/saves/etc. by position) — pass it explicitly or rely on the function's default, whichever `scoring-engine.ts` prefers.
- `prisma/schema.prisma` already models `FantasyPointSnapshot` (unique on `leagueId+leagueWeekId+fixtureId+playerId`, `breakdown Json`, `isFinal`) — that's a good REFERENCE for the shape you want, but do NOT write to it (Prisma is orphaned per the manifest's D1). Build the equivalent as a new Supabase table instead.
- The real player pool (`src/lib/generated/fantasy-player-pool.generated.ts`) already has real player_id values sourced from the same official NWSL API — your ingest's player_id must match that same id space so a join against the pool (and against roster/lineup slots, which also use pool player_ids) works without a crosswalk.
- Matches/fixtures: `nwsl-model/data/raw/matches.csv` (completed) and `upcoming.csv` (scheduled) are ESPN-keyed and refreshed by the OTHER plan in this session (`plans/2026-07-22-model-lab/`); they are NOT the same id space as the official NWSL API's `match_id`/`season_id` this packet's ingest uses. Do not try to join against them directly — this ingest is self-contained against the official API's own match/season ids (the same ones `scripts/sync-official-nwsl-player-pool.ts` and `nwsl-model/scripts/fetch_official_player_appearances.py` already use).

## Design

### Table: `fantasy_player_match_stats` (raw ingested facts, one row per player per match)
Columns matching whatever fields your Decision-A-or-B path produces (minutes, goals, assists, shots, shots_on_target, tackles_won, saves, cards, etc., or a smaller set with an `is_approximated` flag for Decision B), plus `player_id`, `match_id` (official API id), `season`, `team_id`, **`match_date_utc` (timestamptz, REQUIRED — the match's real kickoff/date, read straight off the season-matches payload's `matchDateUtc` field, the same field `fetch_official_player_appearances.py` already reads for the identical purpose)**, `fetched_at`. RLS: public read (this is not user-owned data — anyone can see match stats), write restricted to service-role only (this is populated by a trusted job, not user action) — mirror how other read-only reference data in this schema is scoped, or default to service-role-only write + authenticated-read if no existing precedent fits.

### Table: `fantasy_point_snapshots` (computed, one row per player per match, per scoring ruleset version if you want future-proofing — keep it simple: one row per player+match is enough for this round)
Columns: `player_id`, `match_id`, `season`, `match_date_utc` (timestamptz, copied from the stats row so downstream readers never need to join back to `fantasy_player_match_stats` just to bucket by week/slate), `points` (numeric, the `calculateFantasyScore` total), `breakdown` (jsonb, the per-category result), `is_approximated` (bool), `computed_at`. Same RLS posture as above.

**`match_date_utc` is a hard requirement, not optional.** Packets 06, 07, and 08 all read this column directly to bucket points into scoring weeks (06), determine classic-lineup lock timing (07), and determine which matches fall inside a DFS slate window (08) — none of them have any other path to a real match date, and none of them are given migration permission to add this column themselves. If you skip it, three downstream packets fail or silently diverge.

### Ingest function
`ingestMatchStats(matchId: string, seasonId: string) -> { statsWritten: number, snapshotsComputed: number }`:
1. Fetch raw data in pure TypeScript, hitting `api-sdp.nwslsoccer.com` directly with `fetch()`, mirroring `scripts/sync-official-nwsl-player-pool.ts`'s existing fetch pattern (same host, same no-auth convention). Parse per the event-type strings / stats field names `DATA_SOURCE_DECISION.md` documented. Also fetch (or reuse if already fetched in the same call) the season-matches list response to read this match's `matchDateUtc`.
2. Upsert `fantasy_player_match_stats` rows, including `match_date_utc`.
3. For each row, map to `StatLineInput`, call `calculateFantasyScore`, upsert `fantasy_point_snapshots`, including `match_date_utc`.
4. Idempotent: safe to re-run for the same match (e.g. stats get corrected after review) — upsert on `(player_id, match_id)`, don't append duplicates.

### Trigger
Register as a real job in `src/lib/jobs/registry.ts` (the LIVE registry `/api/jobs` already calls) — do not touch `src/jobs/` (deleted/quarantined by packet 03). Accept a `matchId`/`seasonId` param via the job's existing invocation contract (read `src/app/api/jobs/route.ts` for exactly how jobs receive params — extend the contract minimally if it currently takes none). No cron exists in this repo (confirmed by discovery) — that's fine, this round's trigger is the same manual authenticated POST every other job uses; a real scheduler is out of scope per the manifest.

## Steps
1. Read `DATA_SOURCE_DECISION.md`.
2. Write the migration (mirror packet 02's RLS-policy style).
3. Write failing tests first in `match-stat-ingest.test.ts`: given a mocked/fixture raw API response (do not hit the network in tests), `ingestMatchStats` produces the expected `fantasy_point_snapshots` rows with correct `calculateFantasyScore` totals for at least 2 players (one who scored/assisted, one who was carded) — hand-compute the expected point totals against `launchScoringRules` in the test itself so the assertion is a real check, not a snapshot.
4. Implement.
5. Wire into `src/lib/jobs/registry.ts`.
6. Apply the migration to the live Supabase project (additive, RLS-on, same discipline as packet 02).

## Interface contract (produced)
- `fantasy_player_match_stats` and `fantasy_point_snapshots` tables, both carrying `match_date_utc`, populated on-demand via `/api/jobs`. Consumers: packet 06 (standings/matchups — reads `match_date_utc` to bucket by week), packet 07 (lineup lock — reads `match_date_utc` for kickoff timing), packet 08 (DFS leaderboard — reads `match_date_utc` to determine slate membership), packet 09 (achievement triggers read match results indirectly through packet 06's settlement checkpoint, not through this table directly).

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test src/lib/scoring/match-stat-ingest.test.ts && pnpm typecheck
```
Expected: 0 failures. Then confirm the live migration applied (list_tables shows both new tables, RLS on).

## Done-signal
End with exactly one line: `DONE: 04` / `DONE_WITH_CONCERNS: 04: <one line>` / `BLOCKED: 04: <one line>`.
