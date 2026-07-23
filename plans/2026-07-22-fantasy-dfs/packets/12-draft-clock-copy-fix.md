# Packet 12: draft-clock-copy-fix

## Objective
`FirstPickGuide`'s onboarding copy tells first-time drafters "If time runs out, autopick selects the best available player for you." This is false — no such automatic trigger exists anywhere; "Autopick current turn" is a manual button only the on-the-clock manager or commissioner can click. Fix the lie; document the real fix as a scoped follow-on rather than building it now (it needs a Supabase Edge Function + cron, which this repo has no precedent for).

## Files
- Modify: `src/components/draft/first-pick-guide.tsx`
- Create: `plans/2026-07-22-fantasy-dfs/AUTOPICK_FOLLOWUP.md`

## Context facts (verified)
- The on-screen draft clock (75s per pick, 60s from round 9 on) is purely a client-side countdown display computed from `draft.current_pick_started_at` — there is no server-side timeout mechanism anywhere.
- `autopickCurrentDraftTurn` (real, in `fantasy-api.ts`) exists and works correctly when manually invoked — the gap is only that nothing invokes it automatically.

## Steps
1. Fix `FirstPickGuide`'s copy to accurately describe the manual behavior (e.g. "If time runs out, use the Autopick button to select the best available player" — accurate to what actually happens) — do not just delete the guidance, correct it so users still know what to do.
2. Write `AUTOPICK_FOLLOWUP.md`: a short, concrete spec for the real fix — a Supabase Edge Function on a schedule (or `pg_cron` + `pg_net` calling a webhook) that checks for drafts where `now() > current_pick_started_at + timer_seconds` and calls the same autopick logic `autopickCurrentDraftTurn` already implements. Note this needs Supabase project-level cron/Edge Function setup that doesn't exist in this repo today — scope it as a follow-on, not build it in this packet.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main && pnpm typecheck
```
Expected: passes (copy-only change, no logic).

## Done-signal
End with exactly one line: `DONE: 12` / `DONE_WITH_CONCERNS: 12: <one line>` / `BLOCKED: 12: <one line>`.
