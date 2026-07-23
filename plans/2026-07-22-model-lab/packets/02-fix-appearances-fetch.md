# Packet 02: fix-appearances-fetch

## Objective
Fix the schema conflict that makes a data refresh destructive: `scripts/fetch_official_player_appearances.py` overwrites `data/nwsl-official/nwsl_{season}_official_player_match_logs.csv` with a slim schema lacking `match_date_utc`, but `src/data/dataset_builder.py::build_projected_lineups` reads that same 2026 file and does `pd.to_datetime(logs['match_date_utc'])`, which would KeyError on the next dataset rebuild.

## Files
- Modify: `nwsl-model/scripts/fetch_official_player_appearances.py`
- Modify: `nwsl-model/tests/test_official_api.py` (extend)

## Context facts
- The fetch walks every FINISHED match per season on api-sdp.nwslsoccer.com (`/seasons/{sid}/matches`, `/seasons/{sid}/matches/{mid}/lineups`), crosswalks API matchId to ESPN match_id via (UTC date, canonical home, canonical away), and writes per-season logs with columns: match_id, season, team_id, team_name, player_id, role_label, gamestarted, totalsubon, minsplayed, minutes.
- The season match payloads it already fetches contain the match UTC datetime (that is what the crosswalk keys on), so `match_date_utc` is available at write time with no extra API calls.
- The current on-disk 2026 file (wide schema from May 26) HAS `match_date_utc`; preserving that column on rewrite keeps `build_projected_lineups` working.
- `src/data/official_api.py` has `flatten_match_lineup(payload, *, match_id, season, regulation_minutes=90)`; the fetch script assembles rows from it plus the crosswalk.
- Tests use inline DataFrames/dict payloads; no network in tests.

## Steps
1. Failing test first in `tests/test_official_api.py`: build a minimal season-matches payload plus lineup payload, run the row-assembly function used by the fetch script (refactor row assembly into a testable pure function in the script if needed, imported as `from scripts.fetch_official_player_appearances import ...`), and assert the output rows include a `match_date_utc` column whose value matches the API match datetime.
2. Add a second test: the written frame's columns are a superset of what `build_projected_lineups` requires from this file (`match_date_utc` present).
3. Implement: carry the match UTC datetime through `build_match_crosswalk`/`fetch_season_appearances` into every output row as `match_date_utc` (ISO 8601 string as the API provides it).
4. Do not change the output path or the other columns.

## Interface contract (produced)
- `data/nwsl-official/nwsl_{season}_official_player_match_logs.csv` gains column `match_date_utc` on every rewrite. Consumer: `dataset_builder.build_projected_lineups` (unchanged) and packet 05 which runs this script.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_official_api.py -q
```
Expected: 0 failures, new tests included. No network calls during tests.

## Done-signal
End with exactly one line: `DONE: 02` / `DONE_WITH_CONCERNS: 02: <one line>` / `BLOCKED: 02: <one line>`.
