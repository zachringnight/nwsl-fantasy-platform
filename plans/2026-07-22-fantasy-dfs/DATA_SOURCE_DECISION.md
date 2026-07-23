# Packet 01: Scoring Data Source Decision

Live-verified 2026-07-22 against `https://api-sdp.nwslsoccer.com` (no auth, real HTTP calls made
during this spike, no mocked data). No changes made to `official_api.py` (per the REVISED note in
the packet).

## Correction to the packet's own context note (read this first)

The packet states: "the current 2026 season this id space is verified identical to the official
API's own match ids (confirmed: match_id `401854039` appears verbatim in both `matches.csv` and
the official-API-derived `nwsl_2026_official_player_match_logs.csv`)." **This is not true for the
`/lineups` endpoint.** The numeric id `401854039` (as used in `matches.csv` and in
`nwsl_2026_official_player_match_logs.csv`'s `match_id` column) is a value produced by
`fetch_official_player_appearances.py::build_match_crosswalk()` — it is `matches.csv`'s own id,
selected by joining on `(date, home, away)`. It is **not** the raw API `matchId`.

Calling `fetch_match_lineup(season_id=..., match_id='401854039')` returns an **empty envelope**
(`{"home": null, "away": null, ...}`, HTTP 200, no error) — confirmed live, tried against 5
different 2026 numeric match ids, all empty. The real API `matchId` is a UUID-style string, e.g.
`"nwsl::Football_Match::994672fd04fd4515a2f76e7596129efe"`, obtained from
`fetch_season_matches(season_id=...)`'s `matches[].matchId` field (each match record there also
carries `matchDateUtc`, `home.officialName`, `away.officialName` for crosswalking back to
`matches.csv` rows the same way `build_match_crosswalk()` already does).

**Actionable for packet 04**: to call `/seasons/{season_id}/matches/{match_id}/lineups`, first
call `/seasons/{season_id}/matches` (already wrapped by `fetch_season_matches` in Python; packet 04
is TS hitting the same JSON endpoint with `fetch()`), find the match by `(matchDateUtc, home
officialName, away officialName)` or store the API's own `matchId` string when ingesting matches,
and use that UUID-style string as the `match_id` path segment — never the `matches.csv` /
`fantasy_*` numeric id.

## Live evidence

- Season id resolved live via `resolve_season_ids()`: 2026 → `nwsl::Football_Season::0b6761e4701749f593690c0f338da74c`.
- Verified match: `matches.csv` id `401854039` = Boston Legacy FC 0-1 Gotham FC, 2026-03-14.
  Real API `matchId` (found by matching date+teams in `fetch_season_matches`):
  `nwsl::Football_Match::994672fd04fd4515a2f76e7596129efe`.
- Fetched `fetch_match_lineup(season_id=<2026 id>, match_id='nwsl::Football_Match::994672fd04fd4515a2f76e7596129efe')`
  → real, populated payload. Top-level keys: `providerId, matchId, pitchSizeX, pitchSizeY, home,
  away, apiCallRequestTime`. Each of `home`/`away` has: `providerId, teamId, shortName,
  officialName, acronymName, acronymNameLocalized, mediaName, mediaShortName, tacticalFormation,
  playerShirtMainColor, playerShirtSecondaryColor, playerShirtNumberColor, fielded, benched, staff,
  imagery`.
- Each player object under `fielded`/`benched` has keys: `providerId, playerId, bibNumber,
  roleLabel, role, mediaFirstName, mediaLastName, shirtName, shortName, displayName, nationality,
  nationalityIsoCode, isCaptain, isGoalkeeper, events, tacticalXPosition, tacticalYPosition,
  averageXPosition, averageYPosition, imagery`. **There is no per-match `stats` block** parallel to
  the season endpoint's `stats` array — confirmed by dumping full key lists on real player objects
  across multiple matches. Per-match data is available only via the `events` array (discrete
  in-match events) plus derived minutes (start/sub-in/sub-out timing, already parsed by
  `flatten_match_lineup`).

### Real excerpt (trimmed, from the live payload)

```json
{
  "playerId": "nwsl::Football_Player::572ca1acdb37419a843dafa8e828be66",
  "roleLabel": "Goalkeeper",
  "isGoalkeeper": true,
  "events": []
}
```

```json
{"type": "yellow-card", "label": "Yellow Card", "time": 88, "additionalTime": 0, "relatedPlayerId": null, "phase": "SECOND_HALF"}
{"type": "second-yellow-card", "label": "Second Yellow Card", "time": 77, "additionalTime": 0, "relatedPlayerId": null, "phase": "SECOND_HALF"}
{"type": "goal", "label": "Goal", "time": 55, "additionalTime": 0, "relatedPlayerId": "nwsl::Football_Player::1ad05e5cc82942c983a5df60f70d9757", "phase": "SECOND_HALF"}
{"type": "penalty-goal", "label": "Penalty Goal", "time": 39, "additionalTime": 0, "relatedPlayerId": "nwsl::Football_Player::558ed3939fd04ab4b40e4b87d5155fa7", "phase": "FIRST_HALF"}
{"type": "own-goal", "label": "Own Goal", "time": 57, "additionalTime": 0, "relatedPlayerId": "nwsl::Football_Player::58f8a57679474b84a87195f4d8f81871", "phase": "SECOND_HALF"}
{"type": "red-card", "label": "Red Card", "time": 27, "additionalTime": 0, "relatedPlayerId": null, "phase": "FIRST_HALF"}
{"type": "substitution-out", "label": "Substitution Out", "time": 82, "additionalTime": 0, "relatedPlayerId": "nwsl::Football_Player::d554da063af949d9b11787c4c83bf7fc", "phase": "SECOND_HALF"}
{"type": "substitution-in", "label": "Substitution In", "time": 82, "additionalTime": 0, "relatedPlayerId": "nwsl::Football_Player::38925931e59c4bb6ac8e7965e81ab06d", "phase": "SECOND_HALF"}
```

### Full event-type sweep

Ran all 8 event-type discovery calls live (not sampled from docs). First swept 1 match, then 20
matches, then **all 119 `status === "FINISHED"` matches of the live-resolved 2026 season** (threaded,
`ThreadPoolExecutor(max_workers=8)`, real HTTP against `api-sdp.nwslsoccer.com` for every one).

**Every `events[].type` value observed across all 119 finished 2026 matches:**

```
goal, penalty-goal, own-goal, yellow-card, second-yellow-card, red-card,
substitution-in, substitution-out
```

No `assist`, `penalty-miss`, `penalty-save`, `shot`, `tackle`, `interception`, `save`, `block`,
`foul`, `cross`, or `pass` event types appeared anywhere in the 119-match sweep. There is no
separate "assist" event — a `goal`/`penalty-goal` event carries a `relatedPlayerId` field that
sometimes resolves to a real teammate's `playerId` in the same lineup (looks like an assist
provider) and sometimes does not resolve to anyone in either team's roster at all (verified: one
`penalty-goal`/`goal` pair in the 4-3 Houston/Louisville match had `relatedPlayerId` values that
did not match any `playerId` in that match's `home`/`away` `fielded`/`benched` lists — a genuine
API data-quality gap, not a parsing bug on our side). **By contrast, `relatedPlayerId` on
`substitution-in`/`substitution-out` events is reliable** — cross-checked every sub pair in a
7-goal match and every `relatedPlayerId` correctly points to the paired player's own `playerId`.
**Packet 04 should not treat `goal.relatedPlayerId` as a trustworthy assist signal without a
fallback** (e.g., only credit an assist when the id resolves to a real roster player; otherwise
skip assist credit for that goal rather than crediting the wrong player or crashing).

## Decision: A, but scoped — real per-match data covers only some scoring categories

Goal/card event types ARE present in per-match `events` (Decision A's trigger condition), so this
is **Decision A**: real per-match scoring is buildable, for the categories the API actually
exposes. But be precise about scope — do not build 04 assuming full box-score coverage, because
there is no per-match `stats` block, only discrete events plus derived minutes.

### Categories buildable from real per-match data (this endpoint, no approximation)

| Scoring category (`scoring-rules.ts`) | Source |
|---|---|
| `appearance` | player present in `fielded` or in `benched` with a `substitution-in` event |
| `minutes60Plus` | derived minutes (existing `flatten_match_lineup` logic: start=0 unless benched, end = `substitution-out` time or 90) ≥ 60 |
| `goal` | count of `events[].type === "goal"` + `"penalty-goal"` for that player |
| `ownGoal` | count of `events[].type === "own-goal"` (scored against the player's own team — note: an own-goal event belongs to the player who committed it, and it counts against their team's score, not their own goal tally) |
| `yellowCard` | count of `events[].type === "yellow-card"` (a `second-yellow-card` is also a sending-off; treat it as both a yellow AND the red-card/dismissal outcome — do not double count as two separate yellow cards) |
| `redCard` | count of `events[].type === "red-card"` OR `"second-yellow-card"` |
| `assist` | **conditionally real**: `goal`/`penalty-goal` event's `relatedPlayerId`, only when it resolves to a real player in that match's lineup; otherwise omit (do not fabricate) |
| `cleanSheet` (GK/DEF) | derivable, but not from `events` — from the season-matches feed's `homeScorePush`/`awayScorePush` (already fetched per match) compared against which side the player played for, gated on the player having played ≥1 minute for that team in that match |
| `goalsConceded` (GK/DEF) | same source as `cleanSheet` — the opposing team's final score for that match |
| `penaltyMiss` | **not observed in the 119-match sweep** — no missed-penalty event type exists in this data (a missed penalty simply produces no `goal` event); this category cannot be scored from this endpoint at all this season. Treat as always 0 from this source, not as "unknown/approximate." |

### Categories NOT available per-match from this endpoint (approximate per Decision B for these specific fields only)

`shot`, `shotOnTarget`, `chanceCreated`, `successfulPass`, `successfulCross`, `foulWon`,
`foulCommitted`, `tackleWon`, `interception`, `block`, `save`, `penaltySave`, `penaltyConceded`,
`goalkeeperWin`, `goalkeeperDraw` — none of these have a corresponding per-match event type or a
per-match stats block anywhere in the `/lineups` payload. `goalkeeperWin`/`goalkeeperDraw` can
actually be derived exactly the same way as `cleanSheet` (compare the match result to the player's
team, gated on the player being the GK who played), so move those two into the "buildable" table
above if packet 04 wants full coverage — they don't need approximation, they were just missed in
this category split because they're conceptually "goalkeeping" stats. Re-classify:

- **Also buildable from real per-match team-score data** (add to the real table): `goalkeeperWin`,
  `goalkeeperDraw` (same match-result comparison as `cleanSheet`/`goalsConceded`, filtered to the
  starting/finishing goalkeeper).
- **Genuinely not available from this API for any 2026 match** (must use season-rate
  approximation): `shot`, `shotOnTarget`, `chanceCreated`, `successfulPass`, `successfulCross`,
  `foulWon`, `foulCommitted`, `tackleWon`, `interception`, `block`, `save`, `penaltySave`,
  `penaltyConceded`.

### Approximation formula for the non-available categories

For each of the "genuinely not available" categories above, use:

```
per_match_stat_estimate = season_rate_stat_per_90 * (minutes_played_this_match / 90)
```

where `season_rate_stat_per_90` comes from the season-aggregate endpoint
(`/seasons/{id}/stats/players?category={general|passing|defending|goalkeeping}`, already consumed
by `scripts/sync-official-nwsl-player-pool.ts`) divided by that player's season `minutes-played` /
90, and `minutes_played_this_match` is the real, exact per-match minutes already derivable from the
lineup endpoint (not approximated). This produces a genuinely mixed snapshot per player per match:
some fields exact (goals, cards, assists-when-resolvable, clean sheets, goalkeeper win/draw,
minutes, appearance), some fields estimated (shots/passing/defending/saves volume stats). **Persist
an explicit boolean flag per estimated field, not one global `is_approximated` flag on the whole
row** — e.g. `stats_partially_estimated: true` plus, ideally, a list/set of which fields were
estimated — so the UI can label a line as "goals: final, shots: estimated" rather than a blanket
label that would misrepresent the exact fields as approximate too. At minimum, packet 04 must
persist a row-level flag distinguishing "this row has ANY estimated fields" so the UI never
silently presents a mixed row as 100% final data.

### Exact field-name mapping for the season-rate fallback (from live-read `sync-official-nwsl-player-pool.ts`)

Categories: `general`, `passing`, `defending`, `goalkeeping` (query param `category=`). Stat id
matching is done case/punctuation-insensitively (`normalizeStatId`: lowercase, strip non-alphanumeric).
Real stat id strings already proven live by that script:

| Scoring field | category priority | stat id(s) to match |
|---|---|---|
| shots | general | `total-scoring-attempts`, `Total Shots` |
| shotsOnTarget | general | `on-target-scoring-attempts`, `Shots On Target ( inc goals )` |
| chancesCreated | passing, general | `total-attacking-assist`, `Key Passes (Attempt Assists)` |
| successfulPasses | passing, general | `accurate-pass`, `Total Successful Passes ( Excl Crosses & Corners )` |
| successfulCrosses | passing, general | `cross`, `Successful Crosses open play`, `Successful Crosses & Corners` (use max, not sum — the source script uses `getStatMax`) |
| foulsWon | general | `fouls-suffered`, `Total Fouls Won` |
| foulsCommitted | general | `fouls-committed`, `Total Fouls Conceded` |
| tacklesWon | defending, general | `tackle`, `tackles-won`, `Tackles Won` |
| interceptions | defending, general | `interception`, `Interceptions` |
| blocks | general | `Blocked Shots` |
| saves | goalkeeping, general | `saves`, `Saves Made` |
| goalsConceded (season fallback, if ever needed) | goalkeeping, general | `goals-conceded`, `Goals Conceded` |
| cleanSheets (season fallback) | goalkeeping, general | `clean-sheets`, `Clean Sheets` |
| minutes (denominator for the /90 rate) | general | `minutes-played`, `Time Played` |
| games-played (sanity check) | general | `games-played`, `Appearances` |

`penaltySave` and `penaltyConceded` do not have a confirmed stat id in the reviewed script (it
never reads them) — packet 04 will need to either accept 0 for those two categories in the
approximated fields, or do a one-off live check of the `goalkeeping` category's raw stat id list
before shipping (`fetchAllStats("goalkeeping")` and print `stats[].statsId` — a 2-minute check, not
redone here since it's not blocking: worst case these two fields default to 0 like `penaltyMiss`).

## Summary for packet 04 (actionable, no further live exploration needed)

1. Use the API's own UUID-style `matchId` (from `/seasons/{id}/matches`), never the `matches.csv`
   numeric id, when calling `/lineups`.
2. Parse `events[].type` for: `goal`, `penalty-goal`, `own-goal`, `yellow-card`,
   `second-yellow-card`, `red-card`, `substitution-in`, `substitution-out` — these are the only 8
   type values that exist in the 2026 season's live data.
3. Derive `appearance`, `minutes60Plus`, `goal`, `ownGoal`, `yellowCard`, `redCard`, `assist`
   (conditional on `relatedPlayerId` resolving), `cleanSheet`, `goalsConceded`, `goalkeeperWin`,
   `goalkeeperDraw` as **real, exact, per-match** values — no approximation, no `is_approximated`
   flag needed for these fields specifically.
4. Derive `shot`, `shotOnTarget`, `chanceCreated`, `successfulPass`, `successfulCross`, `foulWon`,
   `foulCommitted`, `tackleWon`, `interception`, `block`, `save`, `penaltySave`,
   `penaltyConceded` as **season-rate-per-90 × (match minutes / 90)** estimates, using the field
   mapping table above, and persist a flag marking those specific fields as estimated so the UI can
   be honest per-field rather than blanket-labeling the whole row.
5. `penaltyMiss` is always 0 from this source (no such event type exists in the 2026 data); do not
   flag it as estimated, it's genuinely absent/zero, same treatment as any other stat category the
   API doesn't track at all.
6. No code changes were made to `nwsl-model/src/data/official_api.py` in this packet, per the
   REVISED instruction — this document is the sole deliverable, and it is sufficient for packet 04
   to implement the equivalent parsing natively in TypeScript against the same JSON endpoints with
   `fetch()`.

DONE: 01
