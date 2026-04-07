# NWSL Data Sources

This repo now uses multiple public NWSL data feeds instead of relying on a single source.

## Source map

### FBref
- Directory: `data/fbref`
- Script: `scripts/scrape-fbref-nwsl.py`
- Public source: `https://fbref.com/en/comps/182/`
- Best for:
  - season aggregates
  - advanced rate stats
  - player/team comparison boards

### Official NWSL API
- Directory: `data/nwsl-official`
- Script: `scripts/fetch-nwsl-official-data.py`
- Public source: `https://www.nwslsoccer.com/stats/players/league-leaders`
- Best for:
  - official teams and fixtures
  - official player/team stat tables
  - current-season player match logs
  - multi-season archive coverage

### nwslR archive
- Directory: `data/nwslr`
- Script: `scripts/import-nwslr-data.py`
- Public source: `https://github.com/adror1/nwslR`
- Best for:
  - older historical archive tables
  - franchise and stadium history
  - 2013-2019 player and goalkeeper season tables
  - 2016-2019 advanced player/team match stats

### StatsBomb Open Data
- Directory: `data/statsbomb`
- Script: `scripts/fetch-statsbomb-nwsl.py`
- Public source: `https://github.com/statsbomb/open-data`
- Best for:
  - event-level shot data
  - expected goals summaries
  - match-level open-data analytics

## Refresh commands

```bash
python3 scripts/fetch-nwsl-official-data.py
python3 scripts/import-nwslr-data.py
python3 scripts/fetch-statsbomb-nwsl.py
python3 scripts/scrape-fbref-nwsl.py --season 2026
```

## Notes

- The analytics hub at `src/app/analytics/page.tsx` combines these sources.
- FBref is the benchmark aggregate source, but the official API is now the source of truth for live fixtures, standings, and current-season player logs.
- StatsBomb Open Data is currently limited to the public NWSL 2018 open-data season.
