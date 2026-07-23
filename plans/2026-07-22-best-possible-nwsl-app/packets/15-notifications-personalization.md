# Task 15: Personalization, alerts, email, and web push

**Wave:** 7

**Depends on:** 02, 06, 10, 12

## Files

- Create: `supabase/migrations/20260724_notification_preferences_push.sql`
- Modify: `src/lib/notifications/notification-service.ts`
- Modify: `src/lib/notifications/email.ts`
- Create: `src/lib/notifications/push.ts`
- Create: `src/lib/notifications/dedupe.ts`
- Create: `src/lib/notifications/notification-service.test.ts`
- Modify: `src/app/notifications/page.tsx`
- Modify: `src/app/settings/page.tsx`
- Create: `src/components/notifications/notification-preferences.tsx`
- Create: `public/sw.js`
- Create: `src/components/providers/service-worker-provider.tsx`

## Interfaces

- Consumes: tracked match, scoring, draft, waiver, contest, and data-freshness events.
- Produces:
  - `NotificationPreference`
  - `PushSubscriptionRecord`
  - `sendNotification(payload: NotificationPayload): Promise<NotificationDeliveryResult>`
  - `sendPushNotification(notification: UserNotification): Promise<ChannelDeliveryResult>`
  - `notificationDedupeKey(payload: NotificationPayload): string`

## Notification classes

- Draft turn and autopick.
- Lineup and contest lock reminders.
- Rostered or watchlisted player status change.
- Rostered or watchlisted goal, assist, card, and final fantasy total.
- Matchup lead change and final result.
- Waiver and trade result.
- Contest rank milestone and final.
- Data delay only when it affects a user-visible fantasy result.

## Steps

- [ ] Add persisted channel and notification-class preferences.
- [ ] Add web-push subscription storage and service-worker handlers.
- [ ] Deduplicate by user, notification class, entity, and source event key.
- [ ] Batch noisy live events into a maximum one push per match per player every five minutes, except goals and final.
- [ ] Keep in-app delivery authoritative; email and push failures do not erase the row.
- [ ] Sync signed-in watchlists from local storage into `user_lists` once and then use server state.
- [ ] Track opt-in, delivery, open, and unsubscribe events through task 02 taxonomy.
- [ ] Test preference, deduplication, retry, revoked subscription, and multi-device delivery.
- [ ] Report status. Do not commit unless explicitly authorized.

## Done-check

Run: `pnpm test -- src/lib/notifications/notification-service.test.ts && pnpm build`

Expected: duplicate source event creates one user notification, disabled channels do not send, and in-app state remains correct when push fails.

## Report

Report one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`, with evidence and the concrete concern, blocker, or missing context.

`DONE_WITH_CONCERNS` until preview and production web-push permissions are manually verified on a real device. Otherwise report `DONE`.
