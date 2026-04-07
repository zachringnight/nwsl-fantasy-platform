"""
FBref NWSL Scraper
==================
Scrapes advanced player and team stats from FBref for NWSL using Playwright
to bypass Cloudflare protection. Outputs CSVs to data/fbref/.

Usage:
    python3 scripts/scrape-fbref-nwsl.py --season 2024
    python3 scripts/scrape-fbref-nwsl.py --season 2025 --stats standard shooting passing
"""

from __future__ import annotations

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
    stat: f"stats_squads_{TABLE_IDS[stat].replace('stats_', '')}_for"
    for stat in STAT_PAGES
}

DELAY_SECONDS = 7

SCHEDULE_TEXT_COLUMNS = {
    "round",
    "dayofweek",
    "date",
    "start_time",
    "home_team",
    "score",
    "away_team",
    "venue",
    "referee",
    "match_report",
    "notes",
}


def build_url(season: str, stat_type: str) -> str:
    page = STAT_PAGES[stat_type]
    return f"{BASE_URL}/{COMP_ID}/{season}/{page}/{season}-NWSL-Stats"


def build_schedule_url(season: str) -> str:
    return f"{BASE_URL}/{COMP_ID}/{season}/schedule/{season}-NWSL-Scores-and-Fixtures"


def wait_for_cloudflare(page, timeout_seconds: int = 30):
    """Wait for Cloudflare challenge to resolve."""
    import time as _time
    for i in range(timeout_seconds // 2):
        title = page.title()
        if "Just a moment" not in title:
            return True
        _time.sleep(2)
    return False


def fetch_page(page, url: str) -> str:
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    wait_for_cloudflare(page)
    # Extra wait for JS-rendered content
    page.wait_for_timeout(3000)
    return page.content()


def parse_table(html: str, table_id: str) -> pd.DataFrame | None:
    """Parse an FBref stats table, handling comment-wrapped tables."""
    cleaned = re.sub(r"<!--|-->", "", html)
    soup = BeautifulSoup(cleaned, "lxml")

    table = soup.find("table", id=table_id)
    if table is None:
        return None

    thead = table.find("thead")
    header_rows = thead.find_all("tr") if thead else []
    if not header_rows:
        return None

    columns = []
    for th in header_rows[-1].find_all(["th", "td"]):
        columns.append(th.get("data-stat", th.get_text(strip=True)))

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

    text_cols = {
        "player", "nationality", "position", "squad", "age", "birth_year",
        "team", "country", "comp_level", "lg_finish", "matches",
    }
    if table_id.startswith("sched_"):
        text_cols |= SCHEDULE_TEXT_COLUMNS
    for col in df.columns:
        if col not in text_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if table_id.startswith("sched_"):
        for col in SCHEDULE_TEXT_COLUMNS & set(df.columns):
            df[col] = df[col].astype(str).str.strip().replace({"": pd.NA, "nan": pd.NA})
        core_columns = [col for col in ("date", "home_team", "away_team") if col in df.columns]
        if core_columns:
            df = df.dropna(subset=core_columns, how="any").reset_index(drop=True)

    return df


def scrape_all(season: str, stat_types: list[str], output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        # Use system Chrome (non-headless) to bypass Cloudflare protection.
        # Headless Chromium gets blocked by Cloudflare's bot detection.
        browser = p.chromium.launch(
            headless=False,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context()
        page = context.new_page()

        for stat_type in stat_types:
            url = build_url(season, stat_type)
            print(f"  Fetching {stat_type}: {url}")

            try:
                html = fetch_page(page, url)

                player_table_id = TABLE_IDS[stat_type]
                df_player = parse_table(html, player_table_id)
                if df_player is not None and not df_player.empty:
                    fname = f"nwsl_{season}_player_{stat_type}.csv"
                    df_player.to_csv(output_dir / fname, index=False)
                    print(f"    [OK] {len(df_player)} player rows -> {fname}")
                else:
                    print(f"    [WARN] No player data for {stat_type}")

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

        print("  Fetching schedule...")
        try:
            url = build_schedule_url(season)
            html = fetch_page(page, url)
            schedule_candidates = [
                "sched_all",
                f"sched_{season}_{COMP_ID}_1",
                f"sched_{season}_{COMP_ID}_2",
                f"sched_{season}_{COMP_ID}",
            ]
            schedule_frames = []

            for table_id in schedule_candidates:
                df_sched = parse_table(html, table_id)
                if df_sched is not None and not df_sched.empty:
                    schedule_frames.append(df_sched)

            if schedule_frames:
                df_sched = (
                    pd.concat(schedule_frames, ignore_index=True)
                    .dropna(subset=["date", "home_team", "away_team"], how="any")
                    .drop_duplicates(subset=["date", "home_team", "away_team"], keep="first")
                    .reset_index(drop=True)
                )
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
