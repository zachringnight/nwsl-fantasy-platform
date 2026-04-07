# FBref Advanced Stats Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape FBref NWSL advanced stats (xG, npxG, xAG, progressive actions, shot creation, defensive actions) directly via Playwright, then integrate into both the fantasy player pool and the betting model.

**Architecture:** A Python scraper uses Playwright to bypass Cloudflare, parses FBref HTML tables with BeautifulSoup, and writes CSV files. A TypeScript enrichment script reads those CSVs and merges advanced stats into the generated player pool. The betting model's data layer gains new optional fields on MatchRecord for xG/npxG from FBref schedule data.

**Tech Stack:** Python 3.9+, Playwright, BeautifulSoup4, pandas, Node.js/TypeScript (existing platform tooling)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `scripts/scrape-fbref-nwsl.py` | Playwright-based FBref scraper — fetches pages, parses tables, writes CSVs |
| `scripts/enrich-player-pool.ts` | Reads FBref CSVs, merges xG/xAG/progressive stats into fantasy player pool generation |
| `src/types/fbref.ts` | TypeScript types for FBref stat records |
| `data/fbref/` | Output directory for scraped CSVs |

### Modified Files
| File | Change |
|------|--------|
| `scripts/sync-official-nwsl-player-pool.ts` | Import and merge FBref advanced stats during pool generation |
| `src/lib/generated/fantasy-player-pool.generated.ts` | Regenerated with new fields |
| `src/types/fantasy.ts:161-172` | Add optional advanced stat fields to `FantasyPoolPlayer` |
| `src/components/player/player-card.tsx:57-82` | Add advanced stats row to the 3-metric grid |
| `src/app/players/page.tsx:18-26` | Add ADVANCED filter tab |
| `nwsl-model/src/data/schemas.py:50-78` | Add optional xag/sca/progressive fields to `MatchRecord` |
| `nwsl-model/src/data/loaders.py` | Add standalone `load_fbref_*` functions matching existing pattern |
| `nwsl-model/src/data/transforms.py` | Add `merge_fbref_team_stats()` transform |
| `nwsl-model/src/features/match_features.py:14-49` | Extend `compute_rolling_form()` with xag/sca/progressive rolling stats |
| `package.json` | Add `players:enrich` and `data:pipeline` script commands |

---

## Chunk 1: FBref Scraper

### Task 1: Set up Playwright and project scaffolding

**Files:**
- Create: `scripts/scrape-fbref-nwsl.py`
- Create: `data/fbref/.gitkeep`

- [ ] **Step 1: Install Playwright**

```bash
pip3 install playwright beautifulsoup4 lxml
python3 -m playwright install chromium
```

- [ ] **Step 2: Create data output directory**

```bash
mkdir -p data/fbref
touch data/fbref/.gitkeep
```

- [ ] **Step 3: Write the scraper with Cloudflare bypass**

Create `scripts/scrape-fbref-nwsl.py`:

```python
"""
FBref NWSL Scraper
==================
Scrapes advanced player and team stats from FBref for NWSL using Playwright
to bypass Cloudflare protection. Outputs CSVs to data/fbref/.

Usage:
    python3 scripts/scrape-fbref-nwsl.py --season 2024
    python3 scripts/scrape-fbref-nwsl.py --season 2025 --stats standard shooting passing
"""

import argparse
import re
import time
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

COMP_ID = 182
BASE_URL = "https://fbref.com/en/comps"

STAT_PAGES = {
    "standard": "stats",
    "shooting": "shooting",
    "passing": "passing",
    "passing_types": "passing_types",
    "goal_shot_creation": "gca",
    "defense": "defense",
    "possession": "possession",
    "misc": "misc",
    "keeper": "keepers",
    "keeper_adv": "keepersadv",
    "playing_time": "playingtime",
}

TABLE_IDS = {
    "standard": "stats_standard",
    "shooting": "stats_shooting",
    "passing": "stats_passing",
    "passing_types": "stats_passing_types",
    "goal_shot_creation": "stats_gca",
    "defense": "stats_defense",
    "possession": "stats_possession",
    "misc": "stats_misc",
    "keeper": "stats_keeper",
    "keeper_adv": "stats_keeper_adv",
    "playing_time": "stats_playing_time",
}

TEAM_TABLE_IDS = {
    stat: f"stats_teams_{TABLE_IDS[stat].replace('stats_', '')}_for"
    for stat in STAT_PAGES
}

DELAY_SECONDS = 7


def build_url(season: str, stat_type: str) -> str:
    page = STAT_PAGES[stat_type]
    return f"{BASE_URL}/{COMP_ID}/{season}/{page}/{season}-NWSL-Stats"


def build_schedule_url(season: str) -> str:
    return f"{BASE_URL}/{COMP_ID}/{season}/schedule/{season}-NWSL-Scores-and-Fixtures"


def fetch_page(page, url: str) -> str:
    page.goto(url, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)
    return page.content()


def parse_table(html: str, table_id: str) -> pd.DataFrame | None:
    """Parse an FBref stats table, handling comment-wrapped tables.

    FBref wraps most tables (except the first on the page) inside HTML
    comments (<!-- ... -->). We strip comment markers before parsing so
    BeautifulSoup can find all tables.
    """
    cleaned = re.sub(r"<!--|-->", "", html)
    soup = BeautifulSoup(cleaned, "lxml")

    table = soup.find("table", id=table_id)
    if table is None:
        return None

    # Header: last row of <thead> has the actual column names via data-stat
    thead = table.find("thead")
    header_rows = thead.find_all("tr") if thead else []
    if len(header_rows) < 2:
        return None

    columns = []
    for th in header_rows[-1].find_all(["th", "td"]):
        columns.append(th.get("data-stat", th.get_text(strip=True)))

    # Data rows (skip separator rows with class "thead")
    rows = []
    tbody = table.find("tbody")
    if tbody is None:
        return None

    for tr in tbody.find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        cells = tr.find_all(["th", "td"])
        row = {}
        for cell in cells:
            stat = cell.get("data-stat", "")
            a_tag = cell.find("a")
            value = (
                a_tag.get_text(strip=True)
                if a_tag and stat in ("player", "squad")
                else cell.get_text(strip=True)
            )
            row[stat] = value
        if row:
            rows.append(row)

    if not rows:
        return None

    df = pd.DataFrame(rows)

    # Convert numeric columns
    text_cols = {
        "player", "nationality", "position", "squad", "age", "birth_year",
        "team", "country", "comp_level", "lg_finish", "matches",
    }
    for col in df.columns:
        if col not in text_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def scrape_all(season: str, stat_types: list[str], output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        for stat_type in stat_types:
            url = build_url(season, stat_type)
            print(f"  Fetching {stat_type}: {url}")

            try:
                html = fetch_page(page, url)

                # Player stats
                player_table_id = TABLE_IDS[stat_type]
                df_player = parse_table(html, player_table_id)
                if df_player is not None and not df_player.empty:
                    fname = f"nwsl_{season}_player_{stat_type}.csv"
                    df_player.to_csv(output_dir / fname, index=False)
                    print(f"    [OK] {len(df_player)} player rows -> {fname}")
                else:
                    print(f"    [WARN] No player data for {stat_type}")

                # Team stats
                team_table_id = TEAM_TABLE_IDS[stat_type]
                df_team = parse_table(html, team_table_id)
                if df_team is not None and not df_team.empty:
                    fname = f"nwsl_{season}_team_{stat_type}.csv"
                    df_team.to_csv(output_dir / fname, index=False)
                    print(f"    [OK] {len(df_team)} team rows -> {fname}")
                else:
                    print(f"    [WARN] No team data for {stat_type}")

            except Exception as e:
                print(f"    [ERROR] {stat_type}: {e}")

            time.sleep(DELAY_SECONDS)

        # Schedule
        print("  Fetching schedule...")
        try:
            url = build_schedule_url(season)
            html = fetch_page(page, url)
            schedule_table_id = f"sched_{season}_{COMP_ID}_1"
            df_sched = parse_table(html, schedule_table_id)
            if df_sched is None or df_sched.empty:
                df_sched = parse_table(html, f"sched_{season}_{COMP_ID}")
            if df_sched is not None and not df_sched.empty:
                fname = f"nwsl_{season}_schedule.csv"
                df_sched.to_csv(output_dir / fname, index=False)
                print(f"    [OK] {len(df_sched)} matches -> {fname}")
            else:
                print("    [WARN] No schedule data found")
        except Exception as e:
            print(f"    [ERROR] schedule: {e}")

        browser.close()


def main():
    parser = argparse.ArgumentParser(description="FBref NWSL Scraper (Playwright)")
    parser.add_argument("--season", default="2024", help="Season year (e.g. 2024)")
    parser.add_argument(
        "--stats",
        nargs="*",
        default=list(STAT_PAGES.keys()),
        choices=list(STAT_PAGES.keys()),
        help="Stat types to scrape",
    )
    parser.add_argument("--output", default="data/fbref", help="Output directory")
    args = parser.parse_args()

    print(f"=== FBref NWSL Scraper - Season {args.season} ===\n")
    scrape_all(args.season, args.stats, Path(args.output))
    print("\nDone.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the scraper for 2024 season standard stats as a smoke test**

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 scripts/scrape-fbref-nwsl.py --season 2024 --stats standard
```

Expected: CSV file at `data/fbref/nwsl_2024_player_standard.csv` with columns including `xg`, `npxg`, `xg_assist` (FBref's data-stat for xAG), `progressive_carries`, `progressive_passes`.

- [ ] **Step 5: Inspect CSV column names and document them**

```bash
head -1 data/fbref/nwsl_2024_player_standard.csv
head -1 data/fbref/nwsl_2024_team_standard.csv
```

Expected: Comma-separated column names matching FBref `data-stat` attributes. **Note:** FBref uses `xg_assist` (not `xa`) for expected assists in its HTML. Record the actual column names so downstream scripts use the correct keys.

- [ ] **Step 6: Run full scrape for 2024 and 2025 seasons**

```bash
python3 scripts/scrape-fbref-nwsl.py --season 2024
python3 scripts/scrape-fbref-nwsl.py --season 2025
```

Expected: ~22 CSV files in `data/fbref/` (11 stat types x 2 player/team per season, plus schedule).

- [ ] **Step 7: Commit scraper**

```bash
git add scripts/scrape-fbref-nwsl.py data/fbref/.gitkeep
git commit -m "feat: add Playwright-based FBref NWSL scraper

Bypasses Cloudflare with headless Chromium, parses all 11 stat
categories (player + team) and match schedule with xG data."
```

---

## Chunk 2: Fantasy Platform — Types & Enrichment Script

### Task 2: Add FBref types to the fantasy platform

**Files:**
- Create: `src/types/fbref.ts`
- Modify: `src/types/fantasy.ts:161-172`

- [ ] **Step 1: Create FBref stat record types**

Create `src/types/fbref.ts`:

```typescript
/** Parsed row from FBref player standard stats CSV */
export interface FBrefPlayerStandard {
  player: string;
  squad: string;
  position: string;
  games: number;
  games_starts: number;
  minutes: number;
  minutes_90s: number;
  goals: number;
  assists: number;
  xg: number;
  npxg: number;
  xg_assist: number; // FBref's data-stat name for xAG
  npxg_xg_assist: number;
  progressive_carries: number;
  progressive_passes: number;
  progressive_passes_received: number;
}

/** Parsed row from FBref player shooting stats CSV */
export interface FBrefPlayerShooting {
  player: string;
  squad: string;
  shots: number;
  shots_on_target: number;
  xg: number;
  npxg: number;
  npxg_per_shot: number;
  xg_net: number; // goals minus xG (overperformance)
}

/** Parsed row from FBref player goal/shot creation CSV */
export interface FBrefPlayerGCA {
  player: string;
  squad: string;
  sca: number; // shot-creating actions
  sca_per90: number;
  gca: number; // goal-creating actions
  gca_per90: number;
}

/** Parsed row from FBref player possession CSV */
export interface FBrefPlayerPossession {
  player: string;
  squad: string;
  touches: number;
  progressive_carries: number;
  carries_into_final_third: number;
  carries_into_penalty_area: number;
  progressive_passes_received: number;
  take_ons_won: number;
  take_ons_won_pct: number;
}

/** Parsed row from FBref schedule CSV (match-level xG) */
export interface FBrefScheduleRecord {
  date: string;
  home_team: string;
  away_team: string;
  home_xg: number;
  away_xg: number;
  score: string;
}
```

- [ ] **Step 2: Extend FantasyPoolPlayer with optional advanced stats**

In `src/types/fantasy.ts:171` (before the closing `}` of `FantasyPoolPlayer`), add:

```typescript
  /** FBref advanced stats (optional — populated when FBref data available) */
  xg_per90?: number;
  npxg_per90?: number;
  xag_per90?: number;
  shot_creating_actions_per90?: number;
  goal_creating_actions_per90?: number;
  progressive_carries_per90?: number;
  progressive_passes_per90?: number;
  xg_overperformance?: number;
```

**Note:** These go on `FantasyPoolPlayer` (not `OfficialFantasyPoolPlayerRecord`) because `PlayerCard` and the players page consume `FantasyPoolPlayer`. The fields are optional so existing consumers are unaffected.

- [ ] **Step 3: Commit types**

```bash
git add src/types/fbref.ts src/types/fantasy.ts
git commit -m "feat: add FBref stat types and extend FantasyPoolPlayer with advanced metrics"
```

### Task 3: Build the enrichment script

**Files:**
- Create: `scripts/enrich-player-pool.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the enrichment script**

Create `scripts/enrich-player-pool.ts`. **Important:** This uses `papaparse` for CSV parsing instead of naive string splitting, to handle quoted fields containing commas (player/team names).

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

/**
 * Reads FBref CSVs and produces a generated TS file with advanced stats.
 * Consumed by sync-official-nwsl-player-pool.ts to enrich the player pool.
 */

const FBREF_DIR = path.join(process.cwd(), "data", "fbref");
const OUTPUT_FILE = path.join(
  process.cwd(),
  "src/lib/generated/fbref-advanced-stats.generated.ts"
);

interface FBrefPlayerAdvanced {
  player: string;
  squad: string;
  minutes_90s: number;
  xg: number;
  npxg: number;
  xag: number;
  xg_per90: number;
  npxg_per90: number;
  xag_per90: number;
  sca: number;
  sca_per90: number;
  gca: number;
  gca_per90: number;
  progressive_carries: number;
  progressive_carries_per90: number;
  progressive_passes: number;
  progressive_passes_per90: number;
  xg_net: number;
}

function num(value: string | undefined): number {
  const n = Number(value ?? "");
  return Number.isNaN(n) ? 0 : n;
}

function per90(total: number, minutes90s: number): number {
  return minutes90s > 0 ? Number((total / minutes90s).toFixed(2)) : 0;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function readCsv(filename: string): Promise<Record<string, string>[]> {
  try {
    const content = await fs.readFile(path.join(FBREF_DIR, filename), "utf-8");
    const result = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    return result.data;
  } catch {
    console.warn(`  [WARN] ${filename} not found, skipping`);
    return [];
  }
}

async function main() {
  const files = await fs.readdir(FBREF_DIR);
  const seasons = [
    ...new Set(
      files
        .filter((f) => f.startsWith("nwsl_") && f.endsWith(".csv"))
        .map((f) => f.split("_")[1])
    ),
  ].sort();

  if (seasons.length === 0) {
    console.error("No FBref CSVs found in data/fbref/. Run the scraper first.");
    process.exit(1);
  }

  const season = seasons[seasons.length - 1];
  console.log(`Using FBref data for season ${season}`);

  const standardRows = await readCsv(`nwsl_${season}_player_standard.csv`);
  const shootingRows = await readCsv(`nwsl_${season}_player_shooting.csv`);
  const gcaRows = await readCsv(`nwsl_${season}_player_goal_shot_creation.csv`);
  const possessionRows = await readCsv(`nwsl_${season}_player_possession.csv`);

  const shootingMap = new Map(
    shootingRows.map((r) => [normalizeName(r.player), r])
  );
  const gcaMap = new Map(
    gcaRows.map((r) => [normalizeName(r.player), r])
  );
  const possessionMap = new Map(
    possessionRows.map((r) => [normalizeName(r.player), r])
  );

  // FBref uses "xg_assist" as the data-stat for expected assists.
  // Fall back to "xa" in case the column header differs by version.
  const advancedStats: FBrefPlayerAdvanced[] = standardRows.map((std) => {
    const key = normalizeName(std.player);
    const shoot = shootingMap.get(key);
    const gca = gcaMap.get(key);
    const poss = possessionMap.get(key);
    const minutes90s = num(std.minutes_90s);
    const xag = num(std.xg_assist) || num(std.xa);

    return {
      player: std.player,
      squad: std.squad,
      minutes_90s: minutes90s,
      xg: num(std.xg),
      npxg: num(std.npxg),
      xag,
      xg_per90: per90(num(std.xg), minutes90s),
      npxg_per90: per90(num(std.npxg), minutes90s),
      xag_per90: per90(xag, minutes90s),
      sca: num(gca?.sca),
      sca_per90: num(gca?.sca_per90) || per90(num(gca?.sca), minutes90s),
      gca: num(gca?.gca),
      gca_per90: num(gca?.gca_per90) || per90(num(gca?.gca), minutes90s),
      progressive_carries:
        num(poss?.progressive_carries) || num(std.progressive_carries),
      progressive_carries_per90: per90(
        num(poss?.progressive_carries) || num(std.progressive_carries),
        minutes90s
      ),
      progressive_passes: num(std.progressive_passes),
      progressive_passes_per90: per90(num(std.progressive_passes), minutes90s),
      xg_net: num(shoot?.xg_net),
    };
  });

  const fileContents = `/**
 * FBref advanced stats for NWSL players.
 * Generated by scripts/enrich-player-pool.ts
 * Season: ${season}
 * Generated: ${new Date().toISOString()}
 */

export interface FBrefAdvancedRecord {
  player: string;
  squad: string;
  minutes_90s: number;
  xg: number;
  npxg: number;
  xag: number;
  xg_per90: number;
  npxg_per90: number;
  xag_per90: number;
  sca: number;
  sca_per90: number;
  gca: number;
  gca_per90: number;
  progressive_carries: number;
  progressive_carries_per90: number;
  progressive_passes: number;
  progressive_passes_per90: number;
  xg_net: number;
}

export const fbrefAdvancedStats: FBrefAdvancedRecord[] = ${JSON.stringify(advancedStats, null, 2)};
`;

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, fileContents);
  console.log(`Wrote ${advancedStats.length} players to ${OUTPUT_FILE}`);
}

await main();
```

- [ ] **Step 2: Install papaparse**

```bash
pnpm add -D papaparse @types/papaparse
```

- [ ] **Step 3: Add npm script**

In `package.json` scripts, add:

```json
"players:enrich": "tsx scripts/enrich-player-pool.ts"
```

- [ ] **Step 4: Commit enrichment script**

```bash
git add scripts/enrich-player-pool.ts package.json pnpm-lock.yaml
git commit -m "feat: add FBref enrichment script that generates advanced stats lookup"
```

---

## Chunk 3: Merge FBref Stats into Player Pool Generation

### Task 4: Integrate FBref stats into sync-official-nwsl-player-pool.ts

**Files:**
- Modify: `scripts/sync-official-nwsl-player-pool.ts:1-5` (imports)
- Modify: `scripts/sync-official-nwsl-player-pool.ts:437-506` (pool generation)
- Modify: `scripts/sync-official-nwsl-player-pool.ts:508-549` (generated file template)

- [ ] **Step 1: Import FBref data in the sync script**

At `scripts/sync-official-nwsl-player-pool.ts:5`, add after existing imports:

```typescript
import { fbrefAdvancedStats } from "../src/lib/generated/fbref-advanced-stats.generated";
```

- [ ] **Step 2: Add name normalization helper**

After the existing `getStablePlayerId` function (~line 111), add:

```typescript
function normalizeFBrefName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
```

- [ ] **Step 3: Build FBref lookup and enrich pool rows**

In `main()`, after the `poolRows` flatMap completes (~line 436) and **before** the `positionBaselines` computation (~line 438), insert:

```typescript
  // Merge FBref advanced stats
  const fbrefByName = new Map(
    (fbrefAdvancedStats ?? []).map((r) => [normalizeFBrefName(r.player), r])
  );

  const enrichedPoolRows = poolRows.map((player) => {
    const fbref = fbrefByName.get(normalizeFBrefName(player.display_name));
    return {
      ...player,
      xg_per90: fbref?.xg_per90 ?? 0,
      npxg_per90: fbref?.npxg_per90 ?? 0,
      xag_per90: fbref?.xag_per90 ?? 0,
      shot_creating_actions_per90: fbref?.sca_per90 ?? 0,
      goal_creating_actions_per90: fbref?.gca_per90 ?? 0,
      progressive_carries_per90: fbref?.progressive_carries_per90 ?? 0,
      progressive_passes_per90: fbref?.progressive_passes_per90 ?? 0,
      xg_overperformance: fbref?.xg_net ?? 0,
    };
  });
```

- [ ] **Step 4: Replace all subsequent `poolRows` references with `enrichedPoolRows`**

Specifically in `scripts/sync-official-nwsl-player-pool.ts`:

1. Line ~445: `poolRows.filter(...)` in the `positionBaselines` loop → `enrichedPoolRows.filter(...)`
2. Line ~462: `poolRows.map(...)` in the `projectedRows` computation → `enrichedPoolRows.map(...)`

- [ ] **Step 5: Add advanced fields to OfficialFantasyPoolPlayerRecord in the generated file template**

In the `fileContents` template string (~line 508), after the existing `raw_average_points_2025: number;` line, add:

```typescript
  xg_per90: number;
  npxg_per90: number;
  xag_per90: number;
  shot_creating_actions_per90: number;
  goal_creating_actions_per90: number;
  progressive_carries_per90: number;
  progressive_passes_per90: number;
  xg_overperformance: number;
```

- [ ] **Step 6: Run the full pipeline**

```bash
pnpm players:enrich   # Generate fbref-advanced-stats.generated.ts
pnpm players:sync     # Regenerate fantasy-player-pool.generated.ts with FBref data
```

Expected: `fantasy-player-pool.generated.ts` now includes `xg_per90`, `npxg_per90`, etc. on each player record.

- [ ] **Step 7: Commit integration**

```bash
git add scripts/sync-official-nwsl-player-pool.ts src/lib/generated/
git commit -m "feat: merge FBref advanced stats (xG, xAG, progressive actions) into player pool"
```

---

## Chunk 4: Player Display Enhancements

### Task 5: Show advanced stats on player cards

**Files:**
- Modify: `src/components/player/player-card.tsx:57-82`

- [ ] **Step 1: Add advanced stats row to player card**

In `src/components/player/player-card.tsx`, after the existing 3-metric grid (lines 57-82), add a conditional advanced stats row. Insert after line 82 (closing `</div>` of the grid):

```tsx
        {(player.xg_per90 || player.xag_per90 || player.progressive_carries_per90) ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                xG / 90
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-foreground">
                {(player.xg_per90 ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                xAG / 90
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-foreground">
                {(player.xag_per90 ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                Prog carries / 90
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-foreground">
                {(player.progressive_carries_per90 ?? 0).toFixed(1)}
              </p>
            </div>
          </div>
        ) : null}
```

- [ ] **Step 2: Commit player card changes**

```bash
git add src/components/player/player-card.tsx
git commit -m "feat: show xG, xAG, and progressive carries on player cards"
```

### Task 6: Add ADVANCED filter to the players page

**Files:**
- Modify: `src/app/players/page.tsx:18-26` (filter types)
- Modify: `src/app/players/page.tsx:38-77` (filter logic)

- [ ] **Step 1: Add ADVANCED to the BoardFilter type and filter list**

In `src/app/players/page.tsx:18`, change the type:

```typescript
type BoardFilter = "ALL" | "WATCHLIST" | "TRENDING" | "QUESTIONABLE" | "VALUE" | "ADVANCED";
```

At line 26, add a new entry to `boardFilters` array before the closing `]`:

```typescript
  { key: "ADVANCED", label: "Advanced" },
```

- [ ] **Step 2: Add ADVANCED sort logic**

In the `.sort()` function inside `filteredPlayers` (~line 67), add before the final `return`:

```typescript
        if (filter === "ADVANCED") {
          const leftScore = (left.npxg_per90 ?? 0) + (left.xag_per90 ?? 0);
          const rightScore = (right.npxg_per90 ?? 0) + (right.xag_per90 ?? 0);
          return rightScore - leftScore;
        }
```

- [ ] **Step 3: Update compare view to show advanced stats**

In the compare section (~line 255), after the existing `{player.average_points.toFixed(1)} proj` line, add:

```tsx
                    {player.xg_per90 ? (
                      <p className="mt-1 text-xs text-muted">
                        xG/90: {player.xg_per90.toFixed(2)} • xAG/90: {(player.xag_per90 ?? 0).toFixed(2)} • SCA/90: {(player.shot_creating_actions_per90 ?? 0).toFixed(1)}
                      </p>
                    ) : null}
```

- [ ] **Step 4: Verify the page renders**

```bash
pnpm dev
# Visit http://localhost:3000/players
# Verify: Advanced filter tab appears, player cards show xG/xAG row, compare shows advanced stats
```

- [ ] **Step 5: Commit UI changes**

```bash
git add src/app/players/page.tsx
git commit -m "feat: add ADVANCED filter and display xG/xAG in compare view on players page"
```

---

## Chunk 5: Betting Model Integration

### Task 7: Extend betting model schemas and loaders

**Files:**
- Modify: `nwsl-model/src/data/schemas.py:50-78`
- Modify: `nwsl-model/src/data/schemas.py:162-169`
- Modify: `nwsl-model/src/data/loaders.py`
- Modify: `nwsl-model/src/data/transforms.py`

- [ ] **Step 1: Add optional fields to MatchRecord schema**

In `nwsl-model/src/data/schemas.py`, after line 67 (`away_xg: Optional[float] = None`), add:

```python
    home_xag: Optional[float] = None
    away_xag: Optional[float] = None
    home_sca: Optional[float] = None
    away_sca: Optional[float] = None
    home_progressive_passes: Optional[float] = None
    away_progressive_passes: Optional[float] = None
    home_progressive_carries: Optional[float] = None
    away_progressive_carries: Optional[float] = None
```

Also add to `MATCH_OPTIONAL_COLS` list (~line 163), after `"home_penalties", "away_penalties",`:

```python
    "home_xag", "away_xag", "home_sca", "away_sca",
    "home_progressive_passes", "away_progressive_passes",
    "home_progressive_carries", "away_progressive_carries",
```

- [ ] **Step 2: Add standalone FBref loader functions**

In `nwsl-model/src/data/loaders.py`, after the `load_projected_lineups` function (~line 111) and **before** the `NWSLDataset` class, add:

```python
def load_fbref_player_stats(
    data_dir: str | Path, season: str, stat_type: str, fmt: str = "csv"
) -> Optional[pd.DataFrame]:
    """Load FBref player stats CSV if available. Returns None if missing."""
    fbref_path = Path(data_dir) / "fbref" / f"nwsl_{season}_player_{stat_type}.csv"
    try:
        return _load_file(fbref_path, fmt)
    except FileNotFoundError:
        logger.info(f"FBref {stat_type} not found at {fbref_path}")
        return None


def load_fbref_schedule(
    data_dir: str | Path, season: str, fmt: str = "csv"
) -> Optional[pd.DataFrame]:
    """Load FBref schedule with match-level xG. Returns None if missing."""
    sched_path = Path(data_dir) / "fbref" / f"nwsl_{season}_schedule.csv"
    try:
        return _load_file(sched_path, fmt)
    except FileNotFoundError:
        logger.info(f"FBref schedule not found at {sched_path}")
        return None
```

- [ ] **Step 3: Add FBref team aggregation transform**

In `nwsl-model/src/data/transforms.py`, after the `merge_odds_to_matches` function (~line 136), add:

```python
def merge_fbref_team_stats(
    matches_df: pd.DataFrame,
    fbref_team_df: Optional[pd.DataFrame],
) -> pd.DataFrame:
    """Merge FBref team-level advanced stats into match records.

    Reads the team standard stats CSV (which uses FBref data-stat column names)
    and maps team-level xAG, SCA, progressive passes/carries to home/away.
    """
    if fbref_team_df is None or fbref_team_df.empty:
        return matches_df

    df = matches_df.copy()

    # FBref column names: xg_assist (xAG), sca, progressive_passes, progressive_carries
    # These are the data-stat attributes from the HTML tables.
    stat_mapping = {
        "xg_assist": "xag",
        "sca": "sca",
        "progressive_passes": "progressive_passes",
        "progressive_carries": "progressive_carries",
    }

    team_lookup = fbref_team_df.set_index("squad") if "squad" in fbref_team_df.columns else fbref_team_df

    for fbref_col, output_name in stat_mapping.items():
        if fbref_col not in team_lookup.columns:
            logger.info(f"FBref column '{fbref_col}' not found in team stats, skipping")
            continue

        for prefix, team_col in [("home", "home_team"), ("away", "away_team")]:
            col_name = f"{prefix}_{output_name}"
            if col_name not in df.columns:
                df[col_name] = df[team_col].map(
                    team_lookup[fbref_col].to_dict()
                )

    return df
```

- [ ] **Step 4: Commit model changes**

```bash
git add nwsl-model/src/data/
git commit -m "feat: extend betting model data layer with FBref advanced stats fields"
```

### Task 8: Add rolling advanced stat features

**Files:**
- Modify: `nwsl-model/src/data/transforms.py:71-99` (melt_to_team_match)
- Modify: `nwsl-model/src/features/match_features.py:14-49` (compute_rolling_form)
- Modify: `nwsl-model/src/features/match_features.py:71-108` (build_match_features)

- [ ] **Step 1: Extend melt_to_team_match to include new columns**

In `nwsl-model/src/data/transforms.py`, in `melt_to_team_match()`, update both the `home` and `away` rename/select to include the new columns if present. After line 84, before `home["is_home"] = True`, add:

```python
    for col_pair in [("home_xag", "away_xag", "xag_for", "xag_against"),
                     ("home_sca", "away_sca", "sca_for", "sca_against"),
                     ("home_progressive_passes", "away_progressive_passes",
                      "prog_passes_for", "prog_passes_against"),
                     ("home_progressive_carries", "away_progressive_carries",
                      "prog_carries_for", "prog_carries_against")]:
        h_col, a_col, for_name, against_name = col_pair
        if h_col in df.columns:
            home[for_name] = df[h_col].values
            home[against_name] = df[a_col].values
            away[for_name] = df[a_col].values
            away[against_name] = df[h_col].values
```

- [ ] **Step 2: Add rolling features for new stats**

In `nwsl-model/src/features/match_features.py`, in `compute_rolling_form()`, after the existing goals rolling loop (~line 47), add:

```python
    # Rolling advanced stats (only if columns present)
    advanced_cols = [
        ("xag_for", "xag_against"),
        ("sca_for", "sca_against"),
        ("prog_passes_for", "prog_passes_against"),
        ("prog_carries_for", "prog_carries_against"),
    ]
    for for_col, against_col in advanced_cols:
        if for_col not in df.columns:
            continue
        for w in windows:
            df[f"roll_{w}_{for_col}"] = (
                df.groupby("team")[for_col]
                .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
            )
            df[f"roll_{w}_{against_col}"] = (
                df.groupby("team")[against_col]
                .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
            )
```

- [ ] **Step 3: Register new features in build_match_features()**

In `build_match_features()`, after the existing `form_cols` construction (~line 95), add:

```python
    # Add advanced stat rolling columns if they exist
    for stat in ["xag_for", "xag_against", "sca_for", "sca_against",
                 "prog_passes_for", "prog_passes_against",
                 "prog_carries_for", "prog_carries_against"]:
        for w in windows:
            col = f"roll_{w}_{stat}"
            if col in team_form.columns:
                form_cols.append(col)
```

- [ ] **Step 4: Commit feature changes**

```bash
git add nwsl-model/src/features/ nwsl-model/src/data/transforms.py
git commit -m "feat: add rolling xAG, progressive actions, and SCA features to betting model"
```

---

## Chunk 6: End-to-End Pipeline & Verification

### Task 9: Wire up the full pipeline

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add combined pipeline scripts**

In `package.json` scripts, add:

```json
"data:scrape-fbref": "python3 scripts/scrape-fbref-nwsl.py --season 2025",
"data:pipeline": "pnpm data:scrape-fbref && pnpm players:enrich && pnpm players:sync"
```

- [ ] **Step 2: Symlink FBref data for the betting model**

The scraper writes to `data/fbref/` at project root. The betting model loads data via config paths. Add a note in the model config (or create a symlink) so the model can find FBref CSVs:

```bash
# If the model has a config file, add:
# fbref_data_dir: ../../data/fbref
# Or symlink:
ln -sf ../../data/fbref nwsl-model/data/fbref
```

- [ ] **Step 3: Run the full pipeline end-to-end**

```bash
pnpm data:pipeline
```

Expected: FBref CSVs scraped -> advanced stats generated -> player pool regenerated with xG/xAG/progressive stats.

- [ ] **Step 4: Verify generated data has advanced stats**

```bash
grep "xg_per90" src/lib/generated/fantasy-player-pool.generated.ts | head -5
```

Expected: Lines showing non-zero `xg_per90` values.

- [ ] **Step 5: Run existing tests and type checking**

```bash
pnpm test
pnpm typecheck
```

Expected: All tests pass, no type errors from the new optional fields.

- [ ] **Step 6: Final commit**

```bash
git add package.json nwsl-model/data/fbref
git commit -m "feat: add data:pipeline script for end-to-end FBref scrape + enrichment"
```
