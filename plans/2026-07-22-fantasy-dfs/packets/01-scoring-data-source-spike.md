# Packet 01: scoring-data-source-spike

## Objective
Decide, with live evidence not guesswork, whether real per-match player fantasy scoring can be built from the official NWSL API's existing per-match lineup endpoint, or whether an honest approximation is needed this round. This gates packet 04's entire design.

## Files
- Create: `plans/2026-07-22-fantasy-dfs/DATA_SOURCE_DECISION.md`

## REVISED (post-review, 2026-07-22): don't touch official_api.py
The original version of this packet conditionally modified `nwsl-model/src/data/official_api.py` (Python) to add an event parser when Decision A holds. Review found this is dead-code effort: packet 04's ingest is explicitly pure TypeScript, hitting the same JSON API directly with `fetch()` — there is no TS-to-Python bridge anywhere in this repo (confirmed: zero `child_process`/`spawn`/`execSync` usage), so a Python parser addition would never be called by anything in this plan. Just document the exact event-type strings / field names in `DATA_SOURCE_DECISION.md` — that's sufficient for packet 04 to implement the same parsing natively in TS. Do not modify `official_api.py` in this packet.

## Context facts (verified)
- `nwsl-model/src/data/official_api.py::fetch_match_lineup(*, season_id, match_id) -> dict` hits `https://api-sdp.nwslsoccer.com/v1/nwsl/football/seasons/{season_id}/matches/{match_id}/lineups?locale=en-US`, no auth.
- `flatten_match_lineup` currently parses each player's `events` list looking ONLY for `event.get("type") in {"substitution-in", "substitution-out"}`. It is UNVERIFIED whether that same `events` array also contains other type values like `"goal"`, `"yellow-card"`, `"red-card"`, `"assist"`, `"own-goal"`, `"penalty-goal"`, etc. — nobody has printed a raw, unfiltered payload.
- **REVISED (post-review): the two file paths in the original version of this note (`nwsl_official_seasons.csv`, `nwsl_2026_official_matches.csv`) do not exist in the repo — confirmed via `ls nwsl-model/data/nwsl-official/`, which shows only `nwsl_2025_official_player_match_logs.csv` and `nwsl_2026_official_player_match_logs.csv`. Do not chase those two filenames.** Real, working sources for a season_id + match_id pair: `nwsl-model/scripts/fetch_official_player_appearances.py::resolve_season_ids()` is a real, working live-API call that resolves season_id for 2025/2026 — read and reuse it directly. For a real match_id, read `nwsl-model/data/raw/matches.csv`'s `match_id` column for any 2026 completed row — for the current 2026 season this id space is verified identical to the official API's own match ids (confirmed: match_id `401854039` appears verbatim in both `matches.csv` and the official-API-derived `nwsl_2026_official_player_match_logs.csv`). Pick any real completed 2026 match_id from that column.
- Fantasy scoring categories that matter (`src/lib/scoring/scoring-rules.ts`): goal, assist, shot, shotOnTarget, chanceCreated, successfulPass, successfulCross, foulWon, foulCommitted, tackleWon, interception, block, cleanSheet, save, goalsConceded, yellowCard, redCard, penaltySave, penaltyMiss, penaltyConceded, ownGoal, goalkeeperWin/Draw, appearance, minutes60Plus.
- The season-aggregate endpoint (`fetch_paginated_stats(*, season_id, category, entity)` → `/seasons/{id}/stats/{entity}?category=...`) DOES return most of these categories, confirmed by `scripts/sync-official-nwsl-player-pool.ts` already consuming it for `average_points`. That endpoint is season-level only — no match_id.

## Steps
1. Live-fetch ONE real, completed 2026 NWSL match's lineup payload:
   ```bash
   cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -c "
   import json
   from src.data.official_api import fetch_match_lineup
   # season_id: resolve via fetch_official_player_appearances.resolve_season_ids()
   # match_id: any real 2026 completed row's match_id from data/raw/matches.csv
   payload = fetch_match_lineup(season_id='<real 2026 season_id>', match_id='<real completed match id>')
   print(json.dumps(payload, indent=2)[:8000])
   "
   ```
2. Inspect the FULL, unfiltered `events` array for at least 3 players who scored/were carded in that match (cross-reference against the match's actual final score / any known events if available, or just inspect broadly). Look for event `type` values beyond substitution. Also check whether player objects carry any OTHER stats block (not just `events`) — e.g. a per-match `stats` array parallel to the season endpoint's `stats` array — by dumping full player keys (`list(player.keys())`).
3. Also try the season-stats endpoint's `category` parameter values (read what categories `scripts/sync-official-nwsl-player-pool.ts` actually requests) to confirm exactly which raw field names map to which scoring categories — you'll need this mapping either way.
4. Write `DATA_SOURCE_DECISION.md` with:
   - The raw evidence (a trimmed but real excerpt of the payload, not paraphrased).
   - **Decision A** (if goal/card/assist event types ARE present in per-match `events`, or a per-match `stats` block exists): "Real per-match scoring is buildable from `api-sdp.nwslsoccer.com` match lineups." Document the exact event-type strings and/or stats field names, with real examples from the actual payload you fetched, precisely enough that packet 04 can implement the equivalent parser natively in TypeScript with no further live exploration.
   - **Decision B** (if not): "Per-match box scores are not available from this API; use season-rate approximation." Document the exact approximation formula packet 04 should use (e.g., `weekly_points ≈ season_average_points_per_90 * (minutes_played_this_match / 90)`, with an explicit `is_approximated: true` flag persisted alongside every snapshot so the UI can label it honestly — "estimated" not "final" — until a richer provider is added).
   - Either way: the decision must be actionable by an isolated agent reading only this file, with no further live exploration needed. No code changes to `official_api.py` in either case (see REVISED note above).

## Verification
`ls plans/2026-07-22-fantasy-dfs/DATA_SOURCE_DECISION.md` from repo root succeeds, the file is non-empty, and it states unambiguously which decision was made plus the exact fields/formula packet 04 needs.

## Done-signal
End with exactly one line: `DONE: 01` / `DONE_WITH_CONCERNS: 01: <one line>` / `BLOCKED: 01: <one line>`.
