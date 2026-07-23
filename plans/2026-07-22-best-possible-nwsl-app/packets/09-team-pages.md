# Task 09: Best-in-class team and league pages

**Wave:** 5

**Depends on:** 05, 07

## Files

- Create: `src/app/teams/page.tsx`
- Create: `src/app/teams/[teamSlug]/page.tsx`
- Create: `src/app/standings/page.tsx`
- Create: `src/components/team/team-card.tsx`
- Create: `src/features/team/team-roster.tsx`
- Create: `src/features/team/team-form.tsx`
- Create: `src/features/team/team-leaders.tsx`
- Create: `src/features/team/team-fixtures.tsx`
- Create: `src/features/team/team-page.test.tsx`

## Interfaces

- Consumes:
  - `getPublicTeamBySlug`
  - `listPublicTeams`
  - `getPublicStandings`.
- Produces:
  - canonical team directory, team detail, and standings pages.

## Page content

- Team directory: 16 active clubs, crest or abbreviation fallback, standings position, form, next match, fantasy leader.
- Team detail: identity, current roster, availability, standings, home/away form, fixtures, results, team stats, fantasy leaders, model rating with source.
- Standings: season selector, played, wins, draws, losses, goals, difference, points, form, and qualification context when officially known.

## Steps

- [ ] Build server-rendered team directory and detail pages from task 05 read models.
- [ ] Separate official table facts from derived team ratings.
- [ ] Link player, opponent, and match rows to canonical public routes.
- [ ] Render unknown crest, broadcast, or qualification data honestly.
- [ ] Add mobile-first table compression with an accessible full table.
- [ ] Test an active team, expansion team, empty roster, postponed match, and season selector.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/features/team/team-page.test.tsx && pnpm build`

Expected: all active teams have 200 detail pages and standings render real seeded totals without zero-filled unavailable fields.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if all 16 active teams resolve. `DONE_WITH_CONCERNS` if a crest or roster field needs rights or provider confirmation.
