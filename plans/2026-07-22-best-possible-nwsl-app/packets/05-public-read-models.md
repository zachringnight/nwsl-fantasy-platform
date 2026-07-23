# Task 05: Cached public read models

**Wave:** 3

**Depends on:** 01, 04

## Files

- Create: `src/lib/nwsl/read-models/players.ts`
- Create: `src/lib/nwsl/read-models/teams.ts`
- Create: `src/lib/nwsl/read-models/matches.ts`
- Create: `src/lib/nwsl/read-models/standings.ts`
- Create: `src/lib/nwsl/read-models/index.ts`
- Create: `src/lib/nwsl/cache.ts`
- Create: `src/lib/nwsl/read-models/read-models.test.ts`
- Modify: `src/lib/analytics/analytics-data.ts`
- Modify: `src/lib/fantasy-player-pool.ts`

## Interfaces

- Consumes: normalized Supabase tables from task 01 populated by task 04.
- Produces:
  - `getPublicPlayerBySlug(slug: string): Promise<PublicPlayerPage | null>`
  - `listPublicPlayers(query: PublicPlayerQuery): Promise<PublicPlayerSummary[]>`
  - `getPublicTeamBySlug(slug: string): Promise<PublicTeamPage | null>`
  - `listPublicTeams(season: number): Promise<PublicTeamSummary[]>`
  - `getPublicMatch(matchId: string): Promise<PublicMatchPage | null>`
  - `listPublicMatches(query: PublicMatchQuery): Promise<PublicMatchSummary[]>`
  - `getPublicStandings(season: number): Promise<PublicStandingRow[]>`
  - `revalidateNwslEntity(tags: string[]): Promise<void>`

## Rules

- Public reads are server-only.
- Pages render source season, last updated time, and approximation labels.
- Current-season data comes from Supabase. Bundled JSON remains an emergency read-only fallback for one release slice and logs fallback use.
- Cache tags use `nwsl:players`, `nwsl:player:<id>`, `nwsl:teams`, `nwsl:team:<id>`, `nwsl:matches`, and `nwsl:match:<id>`.

## Steps

- [ ] Write read-model tests for current player stats, match log, recent form, team roster, schedule filters, and match event ordering.
- [ ] Implement bounded Supabase queries with explicit selected columns.
- [ ] Build match logs and form from normalized match and stat records.
- [ ] Add cache wrappers and source-specific revalidation tags.
- [ ] Replace empty player match-log and form functions.
- [ ] Keep compatibility adapters for existing analytics components until packet 07 redirects canonical routes.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/nwsl/read-models/read-models.test.ts src/lib/analytics/analytics-real-data.test.ts && pnpm typecheck`

Expected: real match logs and form are non-empty for a seeded player, and existing analytics tests remain green.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if all public read models resolve current-season seeded data. `DONE_WITH_CONCERNS` if a field remains fallback-only and is surfaced as such.
