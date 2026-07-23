# Packet 03: dead-code-and-security-cleanup

## Objective
Remove the confirmed-dead code and the orphaned parallel backend's most confusing/risky pieces so future work (and future AI coders) don't build on top of them by mistake. Add a minimal admin-role gate (today `/admin` is reachable by any signed-in user).

## Files
- Delete: `src/lib/demo-data.ts`
- Delete or quarantine (decide in step 1): `src/jobs/` (the whole directory — `index.ts`, `recompute-fantasy-points-job.ts`, `sync-fixtures-job.ts`, `sync-player-stats-job.ts`, `process-waivers-job.ts`, `generate-weekly-matchups-job.ts`, `send-notifications-job.ts`)
- Modify: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` (decide in step 2)
- Modify: `src/features/shared/components/fantasy-auth-gate.tsx` (add an optional role check) or a new small `requireAdmin` helper
- Modify: `src/app/admin/page.tsx` (gate only — full rewrite of the tabs' data is packet 10)
- Modify: `src/types/fantasy.ts` (loose `DemoLeague`/`DemoPlayer`/`DemoMatchup` type names, if you rename them — optional, low priority, do not let it block the packet)

## Context facts (verified)
- `src/lib/demo-data.ts` has zero importers anywhere in `src/` (confirmed by grep across 7 independent discovery passes). Its TYPE names (`DemoLeague` etc., declared in `src/types/fantasy.ts`, NOT in demo-data.ts) are still used as loose prop-type unions on real components (e.g. `LeagueCard`), always fed real data at runtime — deleting `demo-data.ts` itself does not affect those types since they live in a different file.
- `src/jobs/` (note: NOT `src/lib/jobs/`, which is the real one) is a separate, older scaffold: `backgroundJobs` array not imported by `src/app/api/jobs/route.ts` or anywhere else. Every job in it returns `status: "skipped"` and does zero real work. `src/lib/jobs/` (registry.ts, fixture-sync.ts, stat-line-sync.ts, fantasy-scoring.ts, availability-sync.ts) is the REAL, wired-to-the-API-route system — do not touch it, do not confuse the two.
- `src/lib/auth.ts`'s NextAuth `Credentials` provider `authorize()` looks up `prisma.user.findUnique` by email and returns the user WITHOUT checking any password — a live authentication-bypass bug in code that happens to be unreachable today (no UI ever calls `next-auth/react`'s `signIn()`). `src/app/api/auth/[...nextauth]/route.ts` wires it as the only way in.
- No admin-role field exists anywhere (`FantasyProfile`/`User` have no `is_admin` column in either backend). `src/features/shared/components/fantasy-auth-gate.tsx` gates on `hasHydrated`/`profile`/`onboarding_complete` only.

## Steps
1. **Decide src/jobs/ fate.** Recommended: delete the whole directory — it is unreachable dead code duplicating what `src/lib/jobs/` already does for real. If you find any import of `src/jobs/` from live code during a final grep pass (double-check before deleting; discovery found none), quarantine instead (move to `src/jobs/_deprecated/` with a one-line comment) rather than deleting.
2. **Decide NextAuth's fate.** Recommended: delete `src/app/api/auth/[...nextauth]/route.ts` and `src/lib/auth.ts` entirely — Supabase auth is the real, only-reachable auth path (confirmed: no `signIn()` call anywhere in `src/app`). If `PrismaAdapter`/`next-auth` packages become unused after this, that's fine, don't remove them from `package.json` in this packet (a separate dependency-cleanup pass, out of scope here — leave `next-auth`/`@auth/prisma-adapter` installed even if now unused by app code, to avoid an unrelated lockfile diff in this packet).
3. Delete `src/lib/demo-data.ts`. Grep the whole repo one more time for `demo-data` / `demoLeagues` / `demoPlayers` / `demoMatchups` / `demoDraftQueue` / `demoDraftBoard` to confirm zero remaining references before deleting (belt-and-suspenders — discovery already confirmed this across 3 independent passes, but verify fresh since the tree may have changed).
4. Add a minimal admin gate: a hardcoded allowlist is acceptable for this round (e.g. an env var `ADMIN_USER_EMAILS` — comma-separated — checked against the authenticated user's email; document in a comment that this is a stopgap, not a real RBAC system). Wire it into `/admin/page.tsx` so a non-allowlisted signed-in user sees a clear "not authorized" state instead of the admin tools. Do not build a database-backed role system in this packet — that's explicitly out of scope per the manifest.
5. Run `pnpm typecheck` and `pnpm build` after each deletion to catch any import you missed.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm typecheck && pnpm build
```
Expected: both succeed with the deletions in place (no dangling imports).
```bash
grep -rn "demo-data\|src/jobs/" src --include='*.ts*' | grep -v 'src/lib/jobs'
```
Expected: no results (or only results inside a `_deprecated/` quarantine directory if you chose that path).

## Done-signal
End with exactly one line: `DONE: 03` / `DONE_WITH_CONCERNS: 03: <one line>` / `BLOCKED: 03: <one line>`.
