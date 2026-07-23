# Packet 10: odds-close-backfill

## Objective
Extend closing-odds history to cover June and July 2026 completed matches using the direct plain-HTTP OddsPortal mode from packet 03. Execution-only. Best-effort: the lab proceeds on existing coverage if this fails.

## Files
- Run-only. Data outputs: `nwsl-model/data/raw/odds.csv` (merged close rows), `oddsportal_historical_*.csv`, `data/raw/odds_normalized.csv`, coverage report JSON in the plan dir.

## Hard cautions
- No Apify. No tokens. Direct mode only (packet 03 made APIFY_TOKEN optional in direct mode). If direct mode errors on discovery (site markup changed), report and stop this packet; do NOT fall back to Apify.
- Polite pacing flags per packet 03 (max_workers<=4).
- Never edit source here; if the fetch crashes, that is a report, not a hotfix.

## Steps (cwd: nwsl-model/)
1. Record before-coverage:
   `python3 -c "import pandas as pd, json; from src.odds.quality import build_odds_quality_report; m=pd.read_csv('data/raw/matches.csv'); o=pd.read_csv('data/raw/odds.csv'); print(json.dumps(build_odds_quality_report(m,o)['close_coverage_pct'] if isinstance(build_odds_quality_report(m,o), dict) else {}, default=str))"`
   (If the report signature differs, adapt the one-liner by reading src/odds/quality.py; it takes (matches, odds, stale_line_minutes=180, now=None).)
2. `python3 scripts/fetch_apify_oddsportal_history.py --seasons 2026 --archive-fetch-mode direct --total-market-fetch-mode direct --include-1x2-opening`
3. `python3 scripts/normalize_odds.py --input data/raw/odds.csv --output data/raw/odds_normalized.csv`
4. Repair manifest odds fields:
   `python3 -c "import pandas as pd; from src.odds.apify_footystats import update_dataset_manifest_odds; update_dataset_manifest_odds('data/raw/dataset_manifest.json', pd.read_csv('data/raw/odds.csv'))"`
5. After-coverage with the same report call; write both before/after into `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main/plans/2026-07-22-model-lab/odds_backfill_report.json` = {before: {...}, after: {...}, new_close_rows: int, unmatched: int}.

## Verification
```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model && python3 -c "
import pandas as pd
o = pd.read_csv('data/raw/odds.csv')
close = o[(o.source_type=='close') & (o.market_type=='1x2')]
m = pd.read_csv('data/raw/matches.csv')
new = m[(m.season==2026) & (m.match_date > '2026-05-24')]
covered = new.match_id.astype(str).isin(close.match_id.astype(str)).mean()
print(f'June-July close 1x2 coverage: {covered:.1%} of {len(new)} matches')"
```
Expected on success: coverage above 80 percent of the June-July matches. Below that (or fetch failure): DONE_WITH_CONCERNS with the honest number; the report file must exist either way.

## Done-signal
End with exactly one line: `DONE: 10` / `DONE_WITH_CONCERNS: 10: <one line>` / `BLOCKED: 10: <one line>`.
