# Task 04: Provider adapters and normalized ingest

**Wave:** 2

**Depends on:** 01

## Files

- Create: `src/lib/nwsl/providers/types.ts`
- Create: `src/lib/nwsl/providers/official.ts`
- Create: `src/lib/nwsl/providers/espn.ts`
- Create: `src/lib/nwsl/ingest/normalize.ts`
- Create: `src/lib/nwsl/ingest/sync.ts`
- Create: `src/lib/nwsl/ingest/quality.ts`
- Create: `src/lib/nwsl/ingest/sync.test.ts`
- Create: `scripts/sync-nwsl-data.ts`
- Modify: `package.json`

## Interfaces

- Consumes: canonical records and parsers from task 01.
- Produces:
  - `NwslProviderAdapter`
  - `OfficialNwslProvider implements NwslProviderAdapter`
  - `EspnFallbackProvider implements NwslProviderAdapter`
  - `syncNwslData(input: { season: number; mode: "full" | "incremental"; matchIds?: string[] }): Promise<NwslSyncResult>`
  - `validateNwslSync(result: NwslSyncResult): NwslQualityReport`
  - npm scripts `nwsl:sync`, `nwsl:sync:incremental`.

`NwslProviderAdapter` exposes `fetchTeams`, `fetchPlayers`, `fetchMatches`, `fetchLineups`, `fetchEvents`, `fetchPlayerStats`, and `fetchTeamStats`. Unsupported methods return a typed unavailable result, not invented values.

## Source priority

- Official NWSL API: team and player identity, rosters, availability when published, lineups, events, and player match statistics.
- ESPN: schedule, score, venue, broadcast, and standings fallback.
- A fallback record sets `is_fallback = true` and preserves both provider IDs when matched.

## Steps

- [ ] Save representative provider payloads as bounded test fixtures with no secrets.
- [ ] Write adapter contract tests before normalization.
- [ ] Normalize timestamps to UTC and player/team IDs to the stable ID contract.
- [ ] Match fallback entities by provider ID mapping first, then exact normalized club/name and season. Never fuzzy-match a player silently.
- [ ] Upsert in dependency order: teams, players, matches, events, team stats, player stats, standings.
- [ ] Reject a publish when IDs collide, event sequence regresses, a final match loses a score, or more than 5 percent of active players become unmapped.
- [ ] Emit a machine-readable quality report and human summary.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/nwsl/ingest/sync.test.ts && pnpm nwsl:sync -- --season 2026 --mode incremental --dry-run`

Expected: tests pass and dry run produces a quality report with zero critical errors and no database writes.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE_WITH_CONCERNS` when provider fields are unavailable but honestly typed. `BLOCKED` when the official provider cannot produce stable team, player, and match identifiers.
