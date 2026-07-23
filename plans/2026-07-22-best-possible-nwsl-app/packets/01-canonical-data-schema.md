# Task 01: Canonical NWSL data schema and contracts

**Wave:** 1

**Depends on:** none

## Files

- Create: `supabase/migrations/20260724_nwsl_public_data.sql`
- Create: `src/types/nwsl-data.ts`
- Create: `src/lib/nwsl/contracts.ts`
- Create: `src/lib/nwsl/contracts.test.ts`

## Interfaces

- Produces:
  - `NwslMatchStatus = "scheduled" | "live" | "final" | "postponed" | "canceled"`
  - `NwslProvider = "nwsl_official" | "espn"`
  - `NwslSourceStamp { provider, fetchedAt, sourceSeason, sourceUrl?, isFallback }`
  - `NwslPlayerRecord`, `NwslTeamRecord`, `NwslMatchRecord`, `NwslMatchEventRecord`
  - `parseNwslPlayerRow(row: unknown): NwslPlayerRecord`
  - `parseNwslMatchRow(row: unknown): NwslMatchRecord`

## Schema

Create additive tables:

- `nwsl_teams`: stable provider ID, unique slug, name, abbreviation, crest URL, colors, active flag, source fields, timestamps.
- `nwsl_players`: stable provider ID, unique slug, display name, team ID, position, jersey number, headshot URL, availability, source fields, timestamps.
- `nwsl_matches`: stable provider ID, season, kickoff timestamp, status, home/away IDs and scores, venue, broadcast JSON, source fields, timestamps.
- `nwsl_match_events`: stable event key, match ID, provider event ID, sequence, minute, stoppage minute, type, team ID, player ID, related player ID, payload JSON, source fields, timestamps.
- `nwsl_player_match_stats`: player ID plus match ID unique key, exact match statistics, approximation flags, source fields, timestamps.
- `nwsl_team_match_stats`: team ID plus match ID unique key, exact match statistics, source fields, timestamps.
- `nwsl_standings_snapshots`: season, captured timestamp, team ID, rank and table totals.

Every derived table stores `source_provider`, `source_fetched_at`, `source_season`, `is_fallback`, and `is_approximated` where applicable.

## Steps

- [ ] Write contract tests for valid rows, invalid status, missing stable ID, invalid timestamps, and slug uniqueness input.
- [ ] Write the migration with foreign keys and unique constraints on provider IDs, slugs, match events, and player/team match-stat grains.
- [ ] Add indexes for season and kickoff, match status and kickoff, team roster lookup, player slug, team slug, and event sequence.
- [ ] Implement Zod-backed parsers in `contracts.ts`. Do not accept unknown status strings.
- [ ] Run migration locally and generate TypeScript type evidence from representative rows.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `supabase db reset && pnpm test -- src/lib/nwsl/contracts.test.ts && pnpm typecheck`

Expected: local database resets cleanly, contract tests pass, and TypeScript reports zero errors.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` unless schema reset fails or stable provider IDs cannot be mapped without ambiguity. Use `DONE_WITH_CONCERNS` if an entity requires a documented fallback key.
