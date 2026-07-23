# Packet 05: notifications-producer-wiring

## Objective
Notifications today have a real read side (Prisma-backed API + polling UI) but zero producer — `sendNotification()` has no callers anywhere, and the one job meant to drive it is a stub that always returns "skipped." Migrate the whole notification system onto the existing-but-unused Supabase `fantasy_notifications` table (consistent with the manifest's D1/D4: consolidate on Supabase, stop building on the orphaned Prisma backend) and wire real events to it.

## Files
- Rewrite: `src/lib/notifications/notification-service.ts` (Supabase-backed instead of Prisma-backed)
- Modify: `src/app/api/notifications/route.ts` (query `fantasy_notifications` instead of Prisma)
- Modify: `src/app/notifications/page.tsx` (preferences panel — make it persist for real, or explicitly punt with a clear comment if `fantasy_notifications` doesn't model preferences; check the table's actual columns via `list_tables` verbose or by reading whatever migration created it, since discovery found it exists but never inspected its schema)
- Modify: `src/lib/fantasy-trades.ts`, `src/lib/fantasy-chat.ts`, `src/lib/fantasy-api.ts` (add `sendNotification` calls at the real event points below)
- Keep: `src/lib/notifications/email.ts` (the 4 HTML templates are real and reusable — wire at least one, `buildDraftTurnEmail` or `buildEntryLockEmail`, to prove the path end to end; leave the rest ready-but-optional)

## Context facts (verified)
- Live Supabase project already has a `fantasy_notifications` table (0 rows, RLS enabled) that NO code currently reads or writes — confirmed via `list_tables` on project `rnfvmqflktghriqefatc`, 2026-07-22. Its exact column schema was not inspected by discovery; read it directly (verbose `list_tables` or the relevant migration if one exists — if none created it, it may have been created manually outside migrations, same pattern as the trades/chat gap packet 02 fixed; if so, this packet should ALSO write a migration that matches its actual live columns, so a fresh environment can reproduce it).
- `src/lib/notifications/notification-service.ts` current real functions to preserve the SHAPE of (same names/signatures where reasonable, so `src/app/api/notifications/route.ts` and `src/app/notifications/page.tsx` need minimal changes): `sendNotification(payload)`, `getUserNotifications`, `markNotificationRead`, `markAllNotificationsRead`.
- `NotificationPayload` type and `NotificationType`/`NotificationChannel` enums currently live in `prisma/schema.prisma` — port the enum VALUES (not the Prisma types) into a plain TS union in `src/types/fantasy.ts` or a new `src/types/notifications.ts`. **The Prisma `NotificationType` enum is `{DRAFT_STARTING, LINEUP_LOCK, WAIVER_PROCESSED, MATCHUP_RESULT, COMMISSIONER_ANNOUNCEMENT}` — it has NO trade-related value, but two of this packet's own required call sites (`createTradeProposal`, `respondToTrade`) are trade events. Add `TRADE_PROPOSED` and `TRADE_RESPONDED` to the ported union; don't port the Prisma enum verbatim and then have no value to tag those two notifications with.**
- Real event points to wire (grep confirms these currently never call `sendNotification`):
  - `src/lib/fantasy-trades.ts::createTradeProposal` → notify the receiver.
  - `src/lib/fantasy-trades.ts::respondToTrade` → notify the proposer of accept/reject.
  - `src/lib/fantasy-api.ts::makeDraftPick` / the turn-advance logic → notify the manager now on the clock (this is `buildDraftTurnEmail`'s natural trigger).
  - `src/lib/fantasy-api.ts::submitSalaryCapEntry` lock approaching, OR the DFS entry-lock helper from packet 07 — notify near lock time if that's cheap to add here, otherwise leave a clear TODO comment citing this packet number for a follow-on.
  - Waiver processing (`processWaiverClaims` in `fantasy-api.ts`) → notify claim result.
- `push` delivery is explicitly unimplemented (`sendPushNotification` only writes a row, no Web Push subscription plumbing exists) — leave it exactly that stubbed for `channel: 'push'`, don't build Web Push in this packet, just make sure the in_app/email channels are real.

## Steps
1. Inspect `fantasy_notifications`'s real columns (see Context facts) before writing any code.
2. If no migration created it, write one now matching its live schema exactly (do not alter the live table to match a design you prefer — match what's already there, since other tooling/dashboards may already assume it).
3. Rewrite `notification-service.ts` against Supabase (service-role client for writes from server-side call sites, or the pattern the rest of `fantasy-api.ts` uses if these calls originate client-side — match the existing codebase convention rather than inventing a new one).
4. Update `/api/notifications/route.ts` and the notifications page to read from the new service.
5. Add the 4-5 real call sites listed above. Each is a one-or-two-line `sendNotification({...})` addition at an existing real state-transition point — do not restructure the surrounding functions.
6. Wire ONE email template end to end (pick the highest-value one: draft-turn or entry-lock) through `sendEmail` — confirm `AUTH_EMAIL_SERVER`/SMTP config exists or gate gracefully (log + skip) if not configured in this environment, don't crash the caller if email sending fails.
7. Write/update tests for the rewritten `notification-service.ts` (mock the Supabase client, don't hit the network).

## Interface contract (produced)
- `fantasy_notifications` becomes the live, real notification store; `/api/notifications` and the notifications page work end to end; at least 4 real app events produce a real notification a user can see.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm test -- notification && pnpm typecheck
```
Expected: 0 failures.

## Done-signal
End with exactly one line: `DONE: 05` / `DONE_WITH_CONCERNS: 05: <one line>` / `BLOCKED: 05: <one line>`.
