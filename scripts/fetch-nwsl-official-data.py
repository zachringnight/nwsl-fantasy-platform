#!/usr/bin/env python3
"""
Fetch multi-season NWSL data from the public official site API.

Outputs season-scoped CSVs for:
- teams
- matches
- player stats
- team stats
- current-season player profiles
- current-season player match logs

Usage:
    python3 scripts/fetch-nwsl-official-data.py
    python3 scripts/fetch-nwsl-official-data.py --seasons 2024 2025 2026
    python3 scripts/fetch-nwsl-official-data.py --skip-player-logs
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


BASE_API = "https://api-sdp.nwslsoccer.com/v1/nwsl/football"
COMPETITION_ID = "nwsl::Football_Competition::3293333447504e83986ec13e794b68ea"
DEFAULT_LOCALE = "en-US"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}
PLAYER_CATEGORY_SPECS = [
    {"category": "general", "orderBy": "games-played", "role": "All", "direction": "desc", "pageNumElement": 500},
    {"category": "passing", "orderBy": "Total Passes", "role": "All", "direction": "desc", "pageNumElement": 500},
    {"category": "goalkeeping", "orderBy": "goals-against-average", "role": "goalkeeper", "direction": "asc", "pageNumElement": 100},
]
TEAM_CATEGORY_SPECS = [
    {"category": "general", "orderBy": "goals", "direction": "desc", "pageNumElement": 100},
    {"category": "attacking", "orderBy": "total-scoring-attempts", "direction": "desc", "pageNumElement": 100},
    {"category": "passing", "orderBy": "total-pass", "direction": "desc", "pageNumElement": 100},
]


def normalize_key(value: str) -> str:
    key = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return re.sub(r"_+", "_", key)


def api_url(path: str, **query: Any) -> str:
    filtered_query = {
        key: value
        for key, value in query.items()
        if value is not None and value != ""
    }
    return f"{BASE_API}{path}?{urlencode(filtered_query, doseq=True)}"


def fetch_json(url: str) -> dict[str, Any]:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def write_csv(path: Path, rows: list[dict[str, Any]], preferred_headers: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if not rows:
        path.write_text("", encoding="utf-8")
        return

    preferred = preferred_headers or []
    discovered_headers: list[str] = []
    seen_headers = set()

    for header in preferred:
        if header not in seen_headers:
            discovered_headers.append(header)
            seen_headers.add(header)

    for row in rows:
        for key in row.keys():
            if key not in seen_headers:
                discovered_headers.append(key)
                seen_headers.add(key)

    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=discovered_headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in discovered_headers})


def flatten_team(team: dict[str, Any] | None, prefix: str) -> dict[str, Any]:
    if not team:
        return {}

    return {
        f"{prefix}_team_id": team.get("teamId"),
        f"{prefix}_provider_id": team.get("providerId"),
        f"{prefix}_short_name": team.get("shortName"),
        f"{prefix}_official_name": team.get("officialName"),
        f"{prefix}_acronym_name": team.get("acronymName"),
        f"{prefix}_media_name": team.get("mediaName"),
        f"{prefix}_country_code": team.get("countryCode"),
    }


def flatten_stats(stats: list[dict[str, Any]] | None) -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for stat in stats or []:
        stat_id = stat.get("statsId")
        if not stat_id:
            continue
        flattened[normalize_key(stat_id)] = stat.get("statsValue")
    return flattened


def extract_seasons() -> list[dict[str, Any]]:
    url = api_url(f"/competitions/{quote(COMPETITION_ID, safe='')}/seasons", locale=DEFAULT_LOCALE)
    seasons = fetch_json(url).get("seasons", [])
    seasons.sort(key=lambda season: int(season.get("seasonName", 0)), reverse=True)
    return seasons


def fetch_collection(path: str, collection_key: str, **query: Any) -> list[dict[str, Any]]:
    page = 1
    results: list[dict[str, Any]] = []

    while True:
        url = api_url(path, page=page, **query)
        data = fetch_json(url)
        collection = data.get(collection_key) or []
        results.extend(collection)
        pagination = data.get("pagination") or {}
        total_pages = pagination.get("totalPages", 1)
        if not collection or pagination.get("isLastPage", True) or page >= total_pages:
            break
        page += 1

    return results


def flatten_player_rows(players: list[dict[str, Any]], season_name: str, season_id: str, category: str) -> dict[str, dict[str, Any]]:
    by_player: dict[str, dict[str, Any]] = {}
    for player in players:
        player_id = player.get("playerId")
        if not player_id:
            continue

        row = by_player.setdefault(player_id, {})
        if not row:
            row.update(
                {
                    "season": season_name,
                    "season_id": season_id,
                    "player_id": player_id,
                    "provider_id": player.get("providerId"),
                    "bib_number": player.get("bibNumber"),
                    "role_label": player.get("roleLabel"),
                    "role": player.get("role"),
                    "media_first_name": player.get("mediaFirstName"),
                    "media_last_name": player.get("mediaLastName"),
                    "short_name": player.get("shortName"),
                    "display_name": player.get("displayName"),
                    "nationality": player.get("nationality"),
                    "nationality_iso_code": player.get("nationalityIsoCode"),
                    "rank_label": player.get("rankLabel"),
                }
            )
            row.update(flatten_team(player.get("team"), "team"))

        row.update(flatten_stats(player.get("stats")))
        row[f"source_category_{category}"] = True

    return by_player


def flatten_team_rows(teams: list[dict[str, Any]], season_name: str, season_id: str, category: str) -> dict[str, dict[str, Any]]:
    by_team: dict[str, dict[str, Any]] = {}
    for team in teams:
        team_id = team.get("teamId")
        if not team_id:
            continue

        row = by_team.setdefault(team_id, {})
        if not row:
            row.update(
                {
                    "season": season_name,
                    "season_id": season_id,
                    "team_id": team_id,
                    "provider_id": team.get("providerId"),
                    "short_name": team.get("shortName"),
                    "official_name": team.get("officialName"),
                    "acronym_name": team.get("acronymName"),
                    "media_name": team.get("mediaName"),
                    "country_code": team.get("countryCode"),
                    "team_type": team.get("teamType"),
                }
            )

        row.update(flatten_stats(team.get("stats")))
        row[f"source_category_{category}"] = True

    return by_team


def fetch_player_stats(season_name: str, season_id: str) -> list[dict[str, Any]]:
    players_by_id: dict[str, dict[str, Any]] = {}
    path = f"/seasons/{quote(season_id, safe='')}/stats/players"

    for spec in PLAYER_CATEGORY_SPECS:
        try:
            players = fetch_collection(
                path,
                "players",
                locale=DEFAULT_LOCALE,
                category=spec["category"],
                orderBy=spec["orderBy"],
                role=spec["role"],
                direction=spec["direction"],
                pageNumElement=spec["pageNumElement"],
            )
        except Exception as exc:
            print(
                f"[WARN] Skipping player category {spec['category']} for {season_name}: {exc}",
                file=sys.stderr,
            )
            continue
        for player_id, row in flatten_player_rows(players, season_name, season_id, spec["category"]).items():
            players_by_id.setdefault(player_id, {}).update(row)

    return sorted(players_by_id.values(), key=lambda row: (row.get("media_last_name") or "", row.get("media_first_name") or ""))


def fetch_team_stats(season_name: str, season_id: str) -> list[dict[str, Any]]:
    teams_by_id: dict[str, dict[str, Any]] = {}
    path = f"/seasons/{quote(season_id, safe='')}/stats/teams"

    for spec in TEAM_CATEGORY_SPECS:
        try:
            teams = fetch_collection(
                path,
                "teams",
                locale=DEFAULT_LOCALE,
                category=spec["category"],
                orderBy=spec["orderBy"],
                direction=spec["direction"],
                pageNumElement=spec["pageNumElement"],
            )
        except Exception as exc:
            print(
                f"[WARN] Skipping team category {spec['category']} for {season_name}: {exc}",
                file=sys.stderr,
            )
            continue
        for team_id, row in flatten_team_rows(teams, season_name, season_id, spec["category"]).items():
            teams_by_id.setdefault(team_id, {}).update(row)

    return sorted(teams_by_id.values(), key=lambda row: row.get("official_name") or "")


def flatten_matches(season_name: str, season_id: str, matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for match in matches:
        rows.append(
            {
                "season": season_name,
                "season_id": season_id,
                "match_id": match.get("matchId"),
                "provider_id": match.get("providerId"),
                "status": match.get("status"),
                "provider_status": match.get("providerStatus"),
                "phase": match.get("phase"),
                "match_date_utc": match.get("matchDateUtc"),
                "match_date_local": match.get("matchDateLocal"),
                "local_time_utc_offset": match.get("localTimeUtcOffset"),
                "home_score": match.get("homeScorePush"),
                "away_score": match.get("awayScorePush"),
                "win_reason": match.get("winReason"),
                "win_team_id": match.get("winTeamId"),
                "stadium_id": match.get("stadiumId"),
                "stadium_name": match.get("stadiumName"),
                "city_name": match.get("cityName"),
                "round_id": match.get("roundId"),
                "round_name": match.get("roundName"),
                "match_week": match.get("matchWeek"),
                "highlights_url": (match.get("editorial") or {}).get("highlightsUrl"),
                "tickets_url": (match.get("editorial") or {}).get("ticketsUrl"),
                **flatten_team(match.get("home"), "home"),
                **flatten_team(match.get("away"), "away"),
            }
        )
    return rows


def flatten_teams(season_name: str, season_id: str, teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for team in teams:
        rows.append(
            {
                "season": season_name,
                "season_id": season_id,
                "team_id": team.get("teamId"),
                "provider_id": team.get("providerId"),
                "short_name": team.get("shortName"),
                "official_name": team.get("officialName"),
                "acronym_name": team.get("acronymName"),
                "media_name": team.get("mediaName"),
                "country_code": team.get("countryCode"),
                "team_type": team.get("teamType"),
                "website_url": ((team.get("editorial") or {}).get("websiteUrl")),
                "shop_url": ((team.get("editorial") or {}).get("shopUrl")),
                "tickets_url": ((team.get("editorial") or {}).get("ticketsUrl")),
            }
        )
    return rows


def fetch_player_breakdown_rows(season_name: str, season_id: str, player_row: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    player_id = player_row["player_id"]
    url = api_url(
        f"/seasons/{quote(season_id, safe='')}/stats/players/{quote(player_id, safe='')}/matchBreakdown",
        locale=DEFAULT_LOCALE,
    )
    data = fetch_json(url)
    player = data.get("player") or {}
    player_team = player.get("team") or {}
    player_team_id = player_team.get("teamId")

    profile = {
        "season": season_name,
        "season_id": season_id,
        "player_id": player.get("playerId"),
        "provider_id": player.get("providerId"),
        "team_id": player_team.get("teamId"),
        "team_name": player_team.get("officialName"),
        "team_acronym_name": player_team.get("acronymName"),
        "media_first_name": player.get("mediaFirstName"),
        "media_last_name": player.get("mediaLastName"),
        "short_name": player.get("shortName"),
        "date_of_birth": player.get("dateOfBirth"),
        "height_cm": player.get("height"),
        "weight_kg": player.get("weight"),
        "player_status": player.get("playerStatus"),
        "bib_number": player.get("bibNumber"),
        "role_label": player.get("roleLabel"),
        "nationality": player.get("nationality"),
        "nationality_iso_code": player.get("nationalityIsoCode"),
    }

    rows: list[dict[str, Any]] = []
    for match_entry in data.get("matches", []):
        match = match_entry.get("match") or {}
        home = match.get("home") or {}
        away = match.get("away") or {}
        venue = "Home" if player_team_id == home.get("teamId") else "Away" if player_team_id == away.get("teamId") else ""
        opponent = away if venue == "Home" else home if venue == "Away" else {}
        goals_for = match.get("homeScorePush") if venue == "Home" else match.get("awayScorePush")
        goals_against = match.get("awayScorePush") if venue == "Home" else match.get("homeScorePush")

        if goals_for is None or goals_against is None or venue == "":
            result = ""
        elif goals_for > goals_against:
            result = "W"
        elif goals_for < goals_against:
            result = "L"
        else:
            result = "D"

        rows.append(
            {
                "season": season_name,
                "season_id": season_id,
                "player_id": player.get("playerId"),
                "provider_id": player.get("providerId"),
                "player_name": " ".join(filter(None, [player.get("mediaFirstName"), player.get("mediaLastName")])),
                "team_id": player_team.get("teamId"),
                "team_name": player_team.get("officialName"),
                "match_id": match.get("matchId"),
                "match_provider_id": match.get("providerId"),
                "match_date_utc": match.get("matchDateUtc"),
                "match_date_local": match.get("matchDateLocal"),
                "status": match.get("status"),
                "venue": venue,
                "opponent_team_id": opponent.get("teamId"),
                "opponent_team_name": opponent.get("officialName"),
                "opponent_team_acronym_name": opponent.get("acronymName"),
                "stadium_name": match.get("stadiumName"),
                "city_name": match.get("cityName"),
                "home_team_name": home.get("officialName"),
                "away_team_name": away.get("officialName"),
                "home_score": match.get("homeScorePush"),
                "away_score": match.get("awayScorePush"),
                "goals_for": goals_for,
                "goals_against": goals_against,
                "result": result,
                **flatten_stats(match_entry.get("playerStats")),
            }
        )

    return profile, rows


def fetch_latest_player_logs(
    latest_season_name: str,
    latest_season_id: str,
    latest_player_rows: list[dict[str, Any]],
    max_workers: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    profiles: list[dict[str, Any]] = []
    match_logs: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fetch_player_breakdown_rows, latest_season_name, latest_season_id, player_row): player_row["player_id"]
            for player_row in latest_player_rows
        }

        completed = 0
        for future in as_completed(futures):
            player_id = futures[future]
            try:
                profile, rows = future.result()
            except Exception as exc:
                print(f"[WARN] Failed player match breakdown for {player_id}: {exc}", file=sys.stderr)
                continue

            profiles.append(profile)
            match_logs.extend(rows)
            completed += 1
            if completed % 50 == 0:
                print(f"  fetched player match logs for {completed} players")

    profiles.sort(key=lambda row: (row.get("media_last_name") or "", row.get("media_first_name") or ""))
    match_logs.sort(key=lambda row: ((row.get("match_date_utc") or ""), (row.get("player_name") or "")))
    return profiles, match_logs


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch official NWSL API data into local CSVs.")
    parser.add_argument("--output", default="data/nwsl-official", help="Output directory")
    parser.add_argument("--seasons", nargs="*", help="Season names to fetch, e.g. 2024 2025 2026")
    parser.add_argument("--skip-player-logs", action="store_true", help="Skip current-season player match logs")
    parser.add_argument("--max-workers", type=int, default=8, help="Worker count for current-season player match logs")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    seasons = extract_seasons()
    if args.seasons:
        requested = set(args.seasons)
        seasons = [season for season in seasons if season.get("seasonName") in requested]

    if not seasons:
        raise SystemExit("No seasons matched the request.")

    season_rows = [
        {
            "season": season.get("seasonName"),
            "season_id": season.get("seasonId"),
            "competition_id": season.get("competitionId"),
            "provider_id": season.get("providerId"),
            "start_date_utc": season.get("startDateUtc"),
            "end_date_utc": season.get("endDateUtc"),
            "name": season.get("name"),
            "official_name": season.get("officialName"),
            "short_name": season.get("shortName"),
            "acronym_name": season.get("acronymName"),
        }
        for season in seasons
    ]
    write_csv(output_dir / "nwsl_official_seasons.csv", season_rows)

    latest_player_rows: list[dict[str, Any]] = []
    latest_season_name = seasons[0]["seasonName"]
    latest_season_id = seasons[0]["seasonId"]

    for season in seasons:
        season_name = season["seasonName"]
        season_id = season["seasonId"]
        print(f"Fetching official NWSL data for {season_name}")

        teams = fetch_json(api_url(f"/seasons/{quote(season_id, safe='')}/teams", locale=DEFAULT_LOCALE)).get("teams", [])
        matches = fetch_json(api_url(f"/seasons/{quote(season_id, safe='')}/matches", locale=DEFAULT_LOCALE)).get("matches", [])
        player_rows = fetch_player_stats(season_name, season_id)
        team_rows = fetch_team_stats(season_name, season_id)

        write_csv(
            output_dir / f"nwsl_{season_name}_official_teams.csv",
            flatten_teams(season_name, season_id, teams),
        )
        write_csv(
            output_dir / f"nwsl_{season_name}_official_matches.csv",
            flatten_matches(season_name, season_id, matches),
            preferred_headers=[
                "season",
                "season_id",
                "match_id",
                "provider_id",
                "status",
                "provider_status",
                "phase",
                "match_date_utc",
                "match_date_local",
                "local_time_utc_offset",
                "home_team_id",
                "home_official_name",
                "away_team_id",
                "away_official_name",
                "home_score",
                "away_score",
                "round_name",
                "match_week",
                "stadium_name",
                "city_name",
            ],
        )
        write_csv(
            output_dir / f"nwsl_{season_name}_official_player_stats.csv",
            player_rows,
            preferred_headers=[
                "season",
                "season_id",
                "player_id",
                "provider_id",
                "team_team_id",
                "team_official_name",
                "media_first_name",
                "media_last_name",
                "short_name",
                "role_label",
                "nationality",
            ],
        )
        write_csv(
            output_dir / f"nwsl_{season_name}_official_team_stats.csv",
            team_rows,
            preferred_headers=[
                "season",
                "season_id",
                "team_id",
                "provider_id",
                "official_name",
                "short_name",
                "acronym_name",
            ],
        )

        if season_name == latest_season_name:
            latest_player_rows = player_rows

    if not args.skip_player_logs and latest_player_rows:
        print(f"Fetching current-season player match logs for {latest_season_name}")
        profiles, match_logs = fetch_latest_player_logs(
            latest_season_name,
            latest_season_id,
            latest_player_rows,
            max_workers=max(1, args.max_workers),
        )
        write_csv(
            output_dir / f"nwsl_{latest_season_name}_official_player_profiles.csv",
            profiles,
            preferred_headers=[
                "season",
                "season_id",
                "player_id",
                "provider_id",
                "team_id",
                "team_name",
                "media_first_name",
                "media_last_name",
                "short_name",
                "role_label",
                "date_of_birth",
                "height_cm",
                "weight_kg",
                "nationality",
            ],
        )
        write_csv(
            output_dir / f"nwsl_{latest_season_name}_official_player_match_logs.csv",
            match_logs,
            preferred_headers=[
                "season",
                "season_id",
                "player_id",
                "player_name",
                "team_id",
                "team_name",
                "match_id",
                "match_date_utc",
                "match_date_local",
                "status",
                "venue",
                "opponent_team_name",
                "home_team_name",
                "away_team_name",
                "home_score",
                "away_score",
                "goals_for",
                "goals_against",
                "result",
                "stadium_name",
                "city_name",
            ],
        )


if __name__ == "__main__":
    main()
