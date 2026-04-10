# Current-Era Projection System

This repo now treats the `2025 + 2026-to-date` projection stack as one shared system instead of separate public-board and fantasy paths.

## Canonical flow

1. `src/lib/analytics/predictive.ts`
   - builds matchup-level and player-level stat expectations
   - is the source stat kernel for public research surfaces
2. `src/lib/projections/materialize.ts`
   - filters that kernel to a fantasy slate
   - resolves model metadata from `nwsl-model/data/processed/models`
   - materializes scoring outputs for `site_launch_v1` and `dfs_soccer_v1`
3. `src/app/api/fantasy-projections/route.ts`
   - exposes the canonical slate output as JSON or CSV
4. `src/lib/fantasy-api/scoring.ts`
   - loads the materialized slate pool for salary-cap flows
5. `src/lib/jobs/sync-player-projections.ts`
   - persists Prisma `PlayerProjection` rows from the same canonical slate service

Compatibility routes remain separate:

- `src/app/api/player-projections/route.ts`
  - persisted Prisma projection rows for existing consumers
- `src/app/api/predictions/upcoming/route.ts`
  - persisted Prisma matchup prediction rows for existing consumers
- `src/app/api/fantasy-projections/route.ts`
  - canonical materialized projection payload for new projection consumers

## Model resolution

- Preferred: promoted `champion_pure`
- Fallback: strongest non-market baseline from the latest artifact bundle
- Current fallback behavior is implemented in:
  - `nwsl-model/src/utils/artifacts.py`
  - `nwsl-model/src/models/baseline.py`

That means API and CLI consumers no longer fail when no pure champion is promoted.

## Public scoring schemas

- `site_launch_v1`
  - compatibility schema for the current in-product fantasy experience
- `dfs_soccer_v1`
  - external-first DFS-style schema driven by the same underlying stat projection

Both schemas share the same player stat kernel. Only the scoring adapter changes.

## Current limitations

- Prisma `PlayerProjection` persistence still stores the legacy narrow field set.
- The app now uses canonical materialized projections in practice, but the database schema has not yet been expanded to persist full stat payloads or schema-keyed rows.
- `nwsl-model` still remains research-first unless a pure model clears promotion gates.
