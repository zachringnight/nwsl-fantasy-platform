# Packet 10: admin-real-wiring

## Objective
`/admin` today is entirely fake: `mockOverrides`/`mockFeedJobs`/`mockSupportCases` hardcoded arrays, a "submit correction" form that only sets a local success-looking string with zero persistence, a search input with state nobody reads. Make the Scoring and Data-feeds tabs real; leave Support as a documented, honestly-scoped follow-on if a real ticketing backend isn't warranted this round.

## Files
- Modify: `src/app/admin/page.tsx`
- Create: `supabase/migrations/2026xxxx_fantasy_scoring_overrides.sql` (a Supabase equivalent of Prisma's `ScoringOverride`/`AuditLog` models — don't write to Prisma, per manifest D1)
- Modify: `src/lib/fantasy-api.ts` (add scoring-override read/write functions) OR a new `src/lib/fantasy-admin.ts` if that's a cleaner separation matching this codebase's existing per-domain file convention (look at how `fantasy-trades.ts`/`fantasy-achievements.ts` are separated from `fantasy-api.ts` for precedent)
- Modify: `loadLeagueStandings`/`loadLeagueMatchup` (packet 06, `fantasy-api.ts`) and the leaderboard query (packet 08, `fantasy-api.ts`) — add the override-check line inside each

## REVISED (post-review, 2026-07-22)
This packet moved from wave 2 to wave 3 (now depends on 06 and 08, not just 02/03). Review found the original wave-2 placement put this packet in the same wave as, needing to edit the exact same functions as, packets 06 and 08 — with no ordering guarantee. Now that it runs strictly after 06/08 land, you can safely add the override-check line inside their already-finished `loadLeagueStandings`/`loadLeagueMatchup`/leaderboard-query functions directly, per the Interface Contract below — this is no longer a same-wave file conflict.

## Context facts (verified)
- Packet 03 already added the admin-role gate (`ADMIN_USER_EMAILS` allowlist) — this packet builds the actual admin FUNCTIONALITY behind that gate, don't redo the gating.
- `prisma/schema.prisma`'s `ScoringOverride` and `AuditLog` models (reference only, don't write to Prisma) show the shape the admin UI was originally meant to support: a correction to a specific player's computed points for a specific match/week, with an audit trail of who changed what.
- The real `/api/jobs` endpoint (`src/lib/jobs/registry.ts`, wired for real) already reports real job status for `fixture-sync`/`stat-line-sync`/`fantasy-scoring`/`availability-sync` — plus whatever job packet 04 registered for match-stat ingest. The admin "Data feeds" tab should call this real endpoint instead of rendering `mockFeedJobs`.
- Overrides need to actually take effect: once a `fantasy_scoring_overrides` row exists for a `(player_id, match_id)`, the real scoring read path (packet 06's standings/matchups, packet 08's leaderboard) should apply it — either by having those queries check for an override and use it instead of the raw `fantasy_point_snapshots.points`, or by having the override write directly update the snapshot with an `overridden_by`/`overridden_at` audit trail. Prefer the override-table-checked-at-read-time approach (non-destructive, auditable, matches the Prisma reference schema's intent) over mutating snapshots in place.

## Steps
1. Failing tests first: submitting a scoring override persists a real row and is retrievable; the real (already-landed) leaderboard/standings queries from packets 06/08 reflect the override when present.
2. Write the migration.
3. Implement the override read/write functions.
4. Rewrite the admin Scoring tab: real submit (persists, shows real confirmation), real list of existing overrides (not `mockOverrides`).
5. Rewrite the admin Data-feeds tab: real job list + last-run status from `/api/jobs` GET, and a real "run now" button that POSTs to it (already bearer-token-protected — the admin page will need the `JOBS_API_SECRET` available server-side or a proxy route; do not expose the secret to the browser — add a thin server route if needed rather than putting the secret in client code).
6. Support tab: either wire the search input to actually filter `mockSupportCases` → real data if a trivial real source exists (e.g. real notification/error logs), or leave it as a clearly-labeled "coming soon" state rather than a fake-looking functional search — do not ship a search box that silently does nothing.

## Interface contract (produced)
- Real, auditable scoring corrections that actually affect what users see. Real job-status visibility for whoever operates this.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- admin && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 10` / `DONE_WITH_CONCERNS: 10: <one line>` / `BLOCKED: 10: <one line>`.
