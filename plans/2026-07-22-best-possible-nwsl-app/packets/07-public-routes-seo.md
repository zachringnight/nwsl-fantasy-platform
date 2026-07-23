# Task 07: Canonical public routes, SEO, and navigation

**Wave:** 4

**Depends on:** 05

## Files

- Modify: `src/app/players/page.tsx`
- Modify: `src/app/players/[playerId]/page.tsx`
- Create: `src/app/teams/page.tsx`
- Create: `src/app/teams/[teamSlug]/page.tsx`
- Create: `src/app/schedule/page.tsx`
- Create: `src/app/matches/[matchId]/page.tsx`
- Create: `src/app/standings/page.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/common/site-header.tsx`
- Modify: `src/components/common/site-footer.tsx`
- Modify: `next.config.ts`
- Create: `src/lib/nwsl/seo.ts`
- Create: `src/lib/nwsl/seo.test.ts`

## Interfaces

- Consumes: public read models from task 05.
- Produces:
  - `buildPlayerMetadata(player: PublicPlayerPage): Metadata`
  - `buildTeamMetadata(team: PublicTeamPage): Metadata`
  - `buildMatchMetadata(match: PublicMatchPage): Metadata`
  - `buildSportsStructuredData(entity: PublicPlayerPage | PublicTeamPage | PublicMatchPage): object`

## Route contract

- `/players/[slug]`
- `/teams/[slug]`
- `/schedule?season=2026&status=upcoming`
- `/matches/[providerMatchId]`
- `/standings?season=2026`

Legacy UUID player URLs and `/analytics/players`, `/analytics/teams`, and `/analytics/matches` routes redirect permanently to canonical public equivalents when the entity can be resolved.

## Steps

- [ ] Add unique slug lookup and permanent redirects without breaking existing shared links.
- [ ] Set `metadataBase` from the canonical application URL.
- [ ] Add per-entity title, description, canonical, Open Graph, Twitter, and JSON-LD.
- [ ] Generate sitemap entries for every active player, team, current and recent match, schedule, and standings page.
- [ ] Add Teams, Schedule, and Standings to public navigation.
- [ ] Keep analytics model pages under `/analytics`; move league facts to canonical public routes.
- [ ] Add route tests for 200, 404, canonical metadata, and redirect behavior.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/nwsl/seo.test.ts && pnpm build`

Expected: build includes canonical routes, dynamic pages resolve seeded entities, and generated metadata uses the production base URL.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if every public entity has one canonical URL. `DONE_WITH_CONCERNS` if an old route cannot redirect without losing a supported query state.
