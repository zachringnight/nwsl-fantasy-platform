# Automatic draft-pick follow-up

The draft timer is currently a client display. Expiration does not trigger a
server action; the active manager or commissioner must press **Autopick**.

## Production implementation

1. Add a Supabase Edge Function that queries live drafts whose
   `current_pick_started_at + timer_seconds` is in the past.
2. Move the legal-player selection and pick transaction behind a server-owned
   function so the Edge Function and the existing manual button share the same
   idempotent implementation.
3. Schedule the Edge Function every minute using Supabase Cron (or `pg_cron`
   plus `pg_net`).
4. Lock each pick by league and overall-pick number so a manual selection racing
   the scheduler cannot create duplicate picks.
5. Record automatic picks in `fantasy_draft_picks.source = 'autopick'` and
   notify the next manager.

This needs project-level Edge Function and scheduling setup that is not present
in this repository, so it remains a deployment follow-up rather than a hidden
client timer promise.
