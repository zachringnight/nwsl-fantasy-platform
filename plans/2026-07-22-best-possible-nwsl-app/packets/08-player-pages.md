# Task 08: Best-in-class player pages

**Wave:** 5

**Depends on:** 05, 07

## Files

- Modify: `src/app/players/page.tsx`
- Modify: `src/app/players/[playerId]/page.tsx`
- Modify: `src/components/player/player-card.tsx`
- Modify: `src/components/player/player-spotlight-card.tsx`
- Create: `src/features/player/player-season-summary.tsx`
- Create: `src/features/player/player-match-log.tsx`
- Create: `src/features/player/player-form-chart.tsx`
- Create: `src/features/player/player-fantasy-outlook.tsx`
- Create: `src/features/player/player-page.test.tsx`

## Interfaces

- Consumes:
  - `getPublicPlayerBySlug`
  - projection output from task 11 when available.
- Produces:
  - `PlayerSeasonSummary`
  - `PlayerMatchLog`
  - `PlayerFantasyOutlook`
  - URL-stable compare and watchlist actions.

## Page content

- Identity: current club, position, number, headshot when licensed, availability, source and freshness.
- Current season: appearances, starts, minutes, goals, assists, discipline, goalkeeper stats, and exact available volume stats.
- Form: last five appearances and fantasy points.
- Match log: opponent, date, minutes, core stats, fantasy points, approximation label.
- Fantasy: salary, floor, median, ceiling, expected minutes, matchup, ownership state, and explanation drivers.
- Actions: compare, watchlist, open team, add in league context, and use in eligible contest.

## Steps

- [ ] Replace UUID-first internal linking with slug-first links while retaining UUID redirects.
- [ ] Render current-season data before historical data.
- [ ] Add source labels and never render zero as a substitute for unavailable data.
- [ ] Use the existing foil card only once per detail page. Keep the 410-player grid lightweight with `content-visibility`.
- [ ] Add table and chart accessible alternatives.
- [ ] Add an honest no-photo fallback and do not scrape unlicensed headshots.
- [ ] Test field players, goalkeepers, transferred players, unavailable fields, and not-found slugs.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/features/player/player-page.test.tsx src/components/player/player-spotlight-card.test.tsx && pnpm build`

Expected: representative FWD and GK pages render current stats, match log, fantasy outlook, source labels, and canonical metadata.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE` if the page is complete without invented fields. `DONE_WITH_CONCERNS` if image rights or a provider gap blocks a media or stat field.
