# Packet 03: oddsportal-direct-mode

## Objective
Add a fully direct plain-HTTP mode to the OddsPortal close-odds backfill so June and July 2026 closing odds can be fetched unattended with no Apify credits and no token. Today only two steps are Apify-bound: results-page discovery and archive-page fetch. The event-level fetch already runs direct.

## Files
- Modify: `nwsl-model/src/odds/apify_oddsportal.py`
- Modify: `nwsl-model/scripts/fetch_apify_oddsportal_history.py`
- Modify: `nwsl-model/tests/test_apify_oddsportal.py` (extend)

## Context facts
- `ODDSPORTAL_NWSL_RESULTS_URLS` maps {2025, 2026}; 2026 results URL is `https://www.oddsportal.com/football/usa/nwsl-women/results/`.
- Apify is used to render the results page to extract the `:odds-request` attribute (archive_url/urlPartTz/urlPartQs) and to fetch archive pages. But `repair_empty_archive_items(items)` already refetches the SAME encrypted archive AJAX URLs with plain urllib (Referer oddsportal.com, UA nwsl-model/0.1) and it works.
- `fetch_user_data_config(user_data_url)` is already plain HTTP (returns bookiehash/usePremium).
- `run_direct_match_event_fetch(parsed_rows, *, betting_type=2, scope=2, request_timeout_seconds=30, max_workers=8)` is the existing direct-HTTP pattern hitting `https://www.oddsportal.com/match-event/1-1-{encodedEventId}-{bettingType}-{scope}-yja83.dat?_={ms}`.
- Decryption is fully local: `decrypt_archive_payload(encrypted_text)` (PBKDF2-SHA256 1000 iters + AES-CBC, hardcoded ODDSPORTAL_PASSWORD/SALT, gzip fallback).
- CLI already has `--total-market-fetch-mode {apify,direct,apify_then_direct}` for the event step. Merge path: `build_historical_odds_contract` then `merge_historical_with_existing_odds` into `data/raw/odds.csv`.
- `load_env_token(env_key='APIFY_TOKEN', ...)` is called by the script; in direct mode the token must become OPTIONAL.

## Steps
1. Failing tests first in `tests/test_apify_oddsportal.py`:
   - `extract_odds_request_from_html(html) -> dict`: given a small inline HTML fixture containing a `:odds-request='{"url": ..., "urlPartTz": ...}'`-style attribute (mirror the real attribute shape the Apify page-function extracts; read the existing page-function string in the module to copy the exact attribute name and JSON shape), returns the parsed request dict. Include an HTML-entity-escaped variant (&quot;) since raw HTML will escape the JSON.
   - `--archive-fetch-mode direct` wiring test: monkeypatch the HTTP fetcher, assert discovery + archive fetch use plain urllib paths and NO Apify call is attempted, and that a missing APIFY_TOKEN does not raise in direct mode.
2. Implement in `src/odds/apify_oddsportal.py`:
   - `fetch_results_page_html(url, *, timeout=30) -> str`: plain urllib GET with the same Referer/UA headers `repair_empty_archive_items` uses.
   - `extract_odds_request_from_html(html) -> dict`: regex + html.unescape to pull the archive request config the Apify page function currently extracts. Raise ValueError with a clear message when not found (site markup changed).
   - `run_direct_archive_fetch(requests, *, timeout=30, max_workers=4) -> list`: fetch each archive page URL directly (reusing the exact URL-construction and decrypt path that `repair_empty_archive_items` uses), returning the same item shape `run_apify_archive_fetch` returns so downstream `archive_pages_to_match_rows` is unchanged.
3. Implement in `scripts/fetch_apify_oddsportal_history.py`:
   - New CLI flag `--archive-fetch-mode {apify,direct,apify_then_direct}` default `apify_then_direct`... set default to `direct` ONLY if that is the existing convention for the event flag; otherwise keep default `apify_then_direct` and let callers pass `direct`.
   - In `direct` mode: skip Apify entirely (discovery via fetch_results_page_html + extract_odds_request_from_html; archive via run_direct_archive_fetch) and do NOT require APIFY_TOKEN (make load_env_token lazy / only in modes that need it).
   - Polite pacing: max_workers<=4 and a small sleep between page fetches (site-blocking risk).
4. Keep every existing mode working unchanged.

## Interface contract (produced)
- CLI: `python3 scripts/fetch_apify_oddsportal_history.py --seasons 2026 --archive-fetch-mode direct --include-1x2-opening --total-market-fetch-mode direct` runs with no APIFY_TOKEN and merges close rows into `data/raw/odds.csv`. Consumer: packet 10.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -m pytest tests/test_apify_oddsportal.py -q
```
Expected: 0 failures. Do NOT hit the network in tests; do NOT run the live fetch in this packet (packet 10 does that).

## Done-signal
End with exactly one line: `DONE: 03` / `DONE_WITH_CONCERNS: 03: <one line>` / `BLOCKED: 03: <one line>`.
