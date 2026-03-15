#!/usr/bin/env python3
"""Generate realistic synthetic NWSL data for testing the full pipeline.

Creates matches, odds, venues, and appearances CSVs with realistic
distributions based on actual NWSL statistical patterns.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# --- Configuration ---
SEED = 42
SEASONS = [2022, 2023, 2024]

# NWSL teams with approximate attack/defense strength profiles
TEAMS = {
    "Portland Thorns": {"att": 0.15, "def": -0.10, "lat": 45.5152, "lon": -122.6784},
    "OL Reign": {"att": 0.10, "def": -0.05, "lat": 47.4823, "lon": -122.1826},
    "San Diego Wave": {"att": 0.20, "def": 0.05, "lat": 32.7642, "lon": -117.1181},
    "NJ/NY Gotham FC": {"att": 0.05, "def": -0.15, "lat": 40.7357, "lon": -74.1724},
    "Racing Louisville": {"att": -0.05, "def": 0.10, "lat": 38.2210, "lon": -85.7593},
    "North Carolina Courage": {"att": 0.08, "def": -0.08, "lat": 35.8032, "lon": -78.7217},
    "Chicago Red Stars": {"att": -0.02, "def": 0.05, "lat": 41.8625, "lon": -87.6166},
    "Houston Dash": {"att": -0.10, "def": 0.12, "lat": 29.7522, "lon": -95.3529},
    "Washington Spirit": {"att": 0.12, "def": -0.03, "lat": 38.8686, "lon": -77.0127},
    "Orlando Pride": {"att": 0.06, "def": 0.02, "lat": 28.5411, "lon": -81.3894},
    "Kansas City Current": {"att": 0.03, "def": -0.02, "lat": 39.0484, "lon": -94.5834},
    "Angel City FC": {"att": 0.00, "def": 0.08, "lat": 34.0141, "lon": -118.2879},
}

# 2024 expansion
EXPANSION_2024 = {
    "Bay FC": {"att": -0.08, "def": 0.15, "lat": 37.7510, "lon": -122.2005},
    "Utah Royals FC": {"att": -0.05, "def": 0.10, "lat": 40.6828, "lon": -111.9043},
}

SPORTSBOOKS = ["DraftKings", "FanDuel", "BetMGM"]
BASE_LEAGUE_RATE = 1.35  # Average goals per team per match in NWSL
HOME_ADV = 0.22


def generate_schedule(teams: list[str], season: int, rng: np.random.RandomState) -> list[dict]:
    """Generate a round-robin schedule with randomized dates."""
    n = len(teams)
    matches = []
    # Each team plays every other team twice (home and away)
    matchups = []
    for i in range(n):
        for j in range(n):
            if i != j:
                matchups.append((teams[i], teams[j]))

    rng.shuffle(matchups)

    # Distribute across the season (March to October)
    season_start = date(season, 3, 15)
    season_end = date(season, 10, 20)
    total_days = (season_end - season_start).days

    for idx, (home, away) in enumerate(matchups):
        day_offset = int(total_days * idx / len(matchups)) + rng.randint(-3, 4)
        day_offset = max(0, min(total_days, day_offset))
        match_date = season_start + timedelta(days=day_offset)
        matches.append({"home_team": home, "away_team": away, "match_date": match_date})

    return matches


def generate_matches() -> pd.DataFrame:
    """Generate the full matches table."""
    rng = np.random.RandomState(SEED)
    all_matches = []
    match_id = 0

    for season in SEASONS:
        teams_map = dict(TEAMS)
        if season >= 2024:
            teams_map.update(EXPANSION_2024)

        team_names = list(teams_map.keys())
        schedule = generate_schedule(team_names, season, rng)

        for match in schedule:
            home = match["home_team"]
            away = match["away_team"]
            home_info = teams_map[home]
            away_info = teams_map[away]

            # Scoring intensities
            # Add some season-level noise
            season_noise = rng.normal(0, 0.03)
            lam_h = np.exp(
                np.log(BASE_LEAGUE_RATE) + HOME_ADV
                + home_info["att"] - away_info["def"] + season_noise
                + rng.normal(0, 0.08)
            )
            lam_a = np.exp(
                np.log(BASE_LEAGUE_RATE)
                + away_info["att"] - home_info["def"] + season_noise
                + rng.normal(0, 0.08)
            )

            lam_h = max(lam_h, 0.3)
            lam_a = max(lam_a, 0.3)

            home_goals = rng.poisson(lam_h)
            away_goals = rng.poisson(lam_a)

            # npxG with some noise around actual xG
            home_xg = max(0, lam_h + rng.normal(0, 0.25))
            away_xg = max(0, lam_a + rng.normal(0, 0.25))
            home_pen = rng.binomial(1, 0.08)  # ~8% chance of a pen per match
            away_pen = rng.binomial(1, 0.07)
            home_npxg = max(0, home_xg - 0.76 * home_pen)
            away_npxg = max(0, away_xg - 0.76 * away_pen)

            # Weather
            month = match["match_date"].month
            base_temp = {3: 12, 4: 16, 5: 21, 6: 26, 7: 29, 8: 28, 9: 24, 10: 17}.get(month, 20)
            temp = base_temp + rng.normal(0, 4)
            wind = max(0, rng.normal(12, 6))
            precip = max(0, rng.exponential(1.5)) if rng.random() < 0.25 else 0.0
            humidity = np.clip(rng.normal(55, 15), 20, 95)

            all_matches.append({
                "match_id": f"NWSL-{season}-{match_id:04d}",
                "match_date": match["match_date"].isoformat(),
                "season": season,
                "competition": "NWSL",
                "regular_season_flag": True,
                "home_team": home,
                "away_team": away,
                "home_goals_90": home_goals,
                "away_goals_90": away_goals,
                "home_npxg": round(home_npxg, 2),
                "away_npxg": round(away_npxg, 2),
                "home_xg": round(home_xg, 2),
                "away_xg": round(away_xg, 2),
                "home_penalties": home_pen,
                "away_penalties": away_pen,
                "venue": f"{home} Stadium",
                "stadium": f"{home} Stadium",
                "surface": rng.choice(["grass", "grass", "grass", "turf"]),
                "altitude_m": rng.choice([0, 0, 0, 50, 100, 1600]),
                "weather_temp_c": round(temp, 1),
                "weather_wind_kph": round(wind, 1),
                "weather_precip_mm": round(precip, 1),
                "weather_humidity_pct": round(humidity, 1),
                "match_status": "completed",
                "resumed_flag": False,
                "incomplete_flag": False,
            })
            match_id += 1

    return pd.DataFrame(all_matches)


def generate_odds(matches: pd.DataFrame) -> pd.DataFrame:
    """Generate synthetic odds for each match."""
    rng = np.random.RandomState(SEED + 1)
    records = []

    for _, row in matches.iterrows():
        hg = row["home_goals_90"]
        ag = row["away_goals_90"]
        hxg = row["home_npxg"]
        axg = row["away_npxg"]

        # Simulate "true" probabilities loosely related to xG
        lam_h = max(0.5, hxg + rng.normal(0, 0.15))
        lam_a = max(0.5, axg + rng.normal(0, 0.15))

        from scipy.stats import poisson
        n = 9
        pmf_h = poisson.pmf(range(n), lam_h)
        pmf_a = poisson.pmf(range(n), lam_a)
        mat = np.outer(pmf_h, pmf_a)
        mat /= mat.sum()

        p_h = float(np.tril(mat, -1).sum())
        p_d = float(np.diag(mat).sum())
        p_a = float(np.triu(mat, 1).sum())

        # Add margin (overround ~5-8%)
        margin = rng.uniform(1.05, 1.08)

        for book in SPORTSBOOKS:
            book_noise = rng.normal(0, 0.01, 3)
            ph = max(0.05, p_h + book_noise[0])
            pd_ = max(0.05, p_d + book_noise[1])
            pa = max(0.05, p_a + book_noise[2])
            total = ph + pd_ + pa
            ph, pd_, pa = ph / total, pd_ / total, pa / total

            home_odds = round(margin / ph, 2)
            draw_odds = round(margin / pd_, 2)
            away_odds = round(margin / pa, 2)

            # Total goals market
            total_goals_ev = lam_h + lam_a
            p_over = float(sum(
                mat[i, j] for i in range(n) for j in range(n) if i + j > 2.5
            ))
            p_under = 1 - p_over
            over_odds = round(margin / max(p_over, 0.05), 2)
            under_odds = round(margin / max(p_under, 0.05), 2)

            for source in ["open", "close"]:
                drift = rng.normal(0, 0.02) if source == "close" else 0
                records.append({
                    "match_id": row["match_id"],
                    "timestamp": f"{row['match_date']}T{'10:00:00' if source == 'open' else '19:00:00'}",
                    "sportsbook": book,
                    "market_type": "1x2",
                    "line": None,
                    "home_odds": max(1.05, home_odds + drift),
                    "draw_odds": max(1.05, draw_odds + drift),
                    "away_odds": max(1.05, away_odds + drift),
                    "over_odds": max(1.05, over_odds + drift),
                    "under_odds": max(1.05, under_odds + drift),
                    "source_type": source,
                })

    return pd.DataFrame(records)


def generate_venues() -> pd.DataFrame:
    """Generate venue metadata."""
    all_teams = {**TEAMS, **EXPANSION_2024}
    records = []
    for team, info in all_teams.items():
        records.append({
            "team": team,
            "home_stadium": f"{team} Stadium",
            "stadium_lat": info["lat"],
            "stadium_lon": info["lon"],
            "altitude_m": 0,
            "surface": "grass",
            "timezone": "US/Eastern",
        })
    return pd.DataFrame(records)


def generate_appearances(matches: pd.DataFrame) -> pd.DataFrame:
    """Generate player appearance data."""
    rng = np.random.RandomState(SEED + 2)
    records = []

    # Generate stable rosters per team per season
    all_teams = set(matches["home_team"]) | set(matches["away_team"])
    rosters = {}
    for team in all_teams:
        for season in matches["season"].unique():
            roster = [f"{team[:3].upper()}-{season}-P{i:02d}" for i in range(25)]
            rosters[(team, season)] = roster

    for _, row in matches.iterrows():
        for team_col in ["home_team", "away_team"]:
            team = row[team_col]
            season = row["season"]
            roster = rosters.get((team, season), [])
            if not roster:
                continue

            # Pick 11 starters
            starters = rng.choice(roster[:18], size=11, replace=False)
            # 3-5 subs
            n_subs = rng.randint(3, 6)
            available_subs = [p for p in roster[:18] if p not in starters]
            subs = rng.choice(available_subs, size=min(n_subs, len(available_subs)), replace=False)

            for pid in starters:
                sub_off = rng.choice([90, 90, 90, 60 + rng.randint(0, 30)])
                records.append({
                    "match_id": row["match_id"],
                    "player_id": pid,
                    "team": team,
                    "start_minute": 0,
                    "end_minute": sub_off,
                    "started_flag": True,
                    "position": rng.choice(["GK", "CB", "FB", "CM", "AM", "FW"]),
                    "projected_flag": False,
                    "available_flag": True,
                    "injury_flag": False,
                    "suspension_flag": False,
                    "national_team_absence_flag": False,
                })

            for pid in subs:
                sub_on = 45 + rng.randint(0, 40)
                records.append({
                    "match_id": row["match_id"],
                    "player_id": pid,
                    "team": team,
                    "start_minute": sub_on,
                    "end_minute": 90,
                    "started_flag": False,
                    "position": rng.choice(["CB", "FB", "CM", "AM", "FW"]),
                    "projected_flag": False,
                    "available_flag": True,
                    "injury_flag": False,
                    "suspension_flag": False,
                    "national_team_absence_flag": False,
                })

            # Mark 0-2 players as injured/suspended
            n_unavail = rng.randint(0, 3)
            unavail_players = rng.choice(roster[18:], size=min(n_unavail, len(roster[18:])), replace=False)
            for pid in unavail_players:
                is_injured = rng.random() > 0.3
                records.append({
                    "match_id": row["match_id"],
                    "player_id": pid,
                    "team": team,
                    "start_minute": 0,
                    "end_minute": 0,
                    "started_flag": False,
                    "position": rng.choice(["CB", "FB", "CM", "AM", "FW"]),
                    "projected_flag": False,
                    "available_flag": False,
                    "injury_flag": is_injured,
                    "suspension_flag": not is_injured,
                    "national_team_absence_flag": False,
                })

    return pd.DataFrame(records)


def main():
    print("Generating synthetic NWSL data...")

    out_dir = Path("data/raw")
    out_dir.mkdir(parents=True, exist_ok=True)

    matches = generate_matches()
    print(f"  Matches: {len(matches)} rows across seasons {SEASONS}")

    odds = generate_odds(matches)
    print(f"  Odds: {len(odds)} rows")

    venues = generate_venues()
    print(f"  Venues: {len(venues)} rows")

    appearances = generate_appearances(matches)
    print(f"  Appearances: {len(appearances)} rows")

    matches.to_csv(out_dir / "matches.csv", index=False)
    odds.to_csv(out_dir / "odds.csv", index=False)
    venues.to_csv(out_dir / "venues.csv", index=False)
    appearances.to_csv(out_dir / "appearances.csv", index=False)

    # Print summary stats
    print(f"\nMatch statistics:")
    print(f"  Home goals mean: {matches['home_goals_90'].mean():.2f}")
    print(f"  Away goals mean: {matches['away_goals_90'].mean():.2f}")
    print(f"  Total goals mean: {(matches['home_goals_90'] + matches['away_goals_90']).mean():.2f}")
    print(f"  Home win %: {(matches['home_goals_90'] > matches['away_goals_90']).mean():.1%}")
    print(f"  Draw %: {(matches['home_goals_90'] == matches['away_goals_90']).mean():.1%}")
    print(f"  Away win %: {(matches['home_goals_90'] < matches['away_goals_90']).mean():.1%}")
    print(f"  Teams: {sorted(set(matches['home_team']) | set(matches['away_team']))}")

    print(f"\nData saved to {out_dir}/")


if __name__ == "__main__":
    main()
