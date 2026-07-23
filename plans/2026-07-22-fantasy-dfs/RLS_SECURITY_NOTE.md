# Security note: RLS disabled on 33 tables (out of scope, surfaced for awareness)

Discovered while verifying the fantasy schema against the live Supabase project (`PrizmLounge`, project id `rnfvmqflktghriqefatc`) on 2026-07-22. Not part of the fantasy/DFS build; flagged because it is a real, live exposure.

## What

33 tables in the shared production project have Row Level Security disabled, meaning the `anon` key (public, shipped in every client bundle) can read and write them directly. None are fantasy-related. They belong to other apps in this same Supabase project: `vh_survivor_*` (9 tables), `wc_tour_stops`/`wc_matches`/`wc_walmart_locations`/`wc_dicks_locations`/`wc_coke_bottlers`, `leaguel_*` (12 tables — a separate contest/league platform), `athlete_outreach`, `ig_post_analytics`, and two staging tables (`_b64_stage`, `_ugc_fresh_*_raw`).

## Why this plan doesn't touch it

This plan is scoped to the NWSL fantasy/DFS product. Enabling RLS on tables belonging to unrelated apps without adding matching policies would break those apps outright (the advisory explicitly warns: "enabling RLS without policies will block all access"). That decision belongs to whoever owns each of those tables, not this build.

## If you want it fixed

Each table needs RLS enabled AND at least one policy matching how that app actually reads/writes it (public read, owner-only write, service-role-only, etc.) — enabling RLS alone with no policy makes the table inaccessible to everyone except service-role. Recommend a separate, focused pass per app rather than a blanket enable. The raw `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` statements are available on request but are not sufficient by themselves.
