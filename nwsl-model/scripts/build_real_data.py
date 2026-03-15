#!/usr/bin/env python3
"""Build real 2025 NWSL match data from scraped results.

Team name normalization matches the canonical names used throughout the model.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

# Canonical team name mapping
TEAM_MAP = {
    "Chicago": "Chicago Stars FC",
    "Orlando Pride": "Orlando Pride",
    "Wash. Spirit": "Washington Spirit",
    "Houston Dash": "Houston Dash",
    "Portland": "Portland Thorns FC",
    "KC Current": "Kansas City Current",
    "Bay FC": "Bay FC",
    "Utah Royals": "Utah Royals FC",
    "NC Courage": "North Carolina Courage",
    "Louisville": "Racing Louisville FC",
    "NJ/NY Gotham": "Gotham FC",
    "Seattle Reign": "Seattle Reign FC",
    "San Diego Wave": "San Diego Wave FC",
    "Angel City FC": "Angel City FC",
}

# All 182 regular-season matches from plaintextsports.com
RAW_RESULTS = """2025-03-14,Chicago,Orlando Pride,0,6
2025-03-14,Wash. Spirit,Houston Dash,2,1
2025-03-15,Portland,KC Current,0,3
2025-03-15,Bay FC,Utah Royals,1,1
2025-03-15,NC Courage,Louisville,1,1
2025-03-15,NJ/NY Gotham,Seattle Reign,1,1
2025-03-16,San Diego Wave,Angel City FC,1,1
2025-03-21,Angel City FC,Portland,1,1
2025-03-22,Seattle Reign,NC Courage,2,1
2025-03-22,KC Current,Wash. Spirit,2,0
2025-03-22,Utah Royals,San Diego Wave,2,3
2025-03-22,Louisville,Bay FC,1,2
2025-03-23,Houston Dash,Chicago,2,1
2025-03-23,Orlando Pride,NJ/NY Gotham,2,0
2025-03-28,NJ/NY Gotham,Houston Dash,0,0
2025-03-28,Bay FC,Wash. Spirit,0,2
2025-03-29,San Diego Wave,Orlando Pride,1,2
2025-03-29,Utah Royals,KC Current,0,3
2025-03-29,NC Courage,Portland,0,0
2025-03-30,Louisville,Chicago,1,0
2025-03-30,Seattle Reign,Angel City FC,1,2
2025-04-11,Portland,Utah Royals,1,0
2025-04-12,Wash. Spirit,Louisville,2,0
2025-04-12,Angel City FC,Houston Dash,3,1
2025-04-12,Orlando Pride,Seattle Reign,1,0
2025-04-12,KC Current,San Diego Wave,2,0
2025-04-13,NC Courage,NJ/NY Gotham,1,3
2025-04-13,Chicago,Bay FC,2,1
2025-04-18,Chicago,Utah Royals,0,1
2025-04-18,Portland,Seattle Reign,0,1
2025-04-18,NJ/NY Gotham,Angel City FC,4,0
2025-04-19,San Diego Wave,Louisville,4,1
2025-04-19,Wash. Spirit,Orlando Pride,1,0
2025-04-19,Bay FC,NC Courage,1,0
2025-04-19,Houston Dash,KC Current,0,2
2025-04-22,NJ/NY Gotham,Portland,1,4
2025-04-25,Utah Royals,Houston Dash,0,1
2025-04-25,Angel City FC,Orlando Pride,2,3
2025-04-26,NJ/NY Gotham,Wash. Spirit,3,0
2025-04-26,KC Current,NC Courage,2,3
2025-04-26,San Diego Wave,Chicago,3,0
2025-04-26,Seattle Reign,Bay FC,1,1
2025-04-27,Louisville,Portland,3,3
2025-05-02,Angel City FC,Wash. Spirit,4,3
2025-05-02,Louisville,Houston Dash,2,1
2025-05-02,KC Current,Seattle Reign,0,1
2025-05-03,Orlando Pride,Portland,0,1
2025-05-03,NC Courage,Utah Royals,2,0
2025-05-04,Chicago,NJ/NY Gotham,0,0
2025-05-04,Bay FC,San Diego Wave,1,2
2025-05-09,NJ/NY Gotham,Louisville,0,1
2025-05-09,Utah Royals,Angel City FC,0,2
2025-05-10,Wash. Spirit,Chicago,3,2
2025-05-10,Orlando Pride,NC Courage,1,1
2025-05-10,Portland,San Diego Wave,1,1
2025-05-11,Bay FC,KC Current,1,4
2025-05-11,Houston Dash,Seattle Reign,1,0
2025-05-16,San Diego Wave,NJ/NY Gotham,1,0
2025-05-16,Portland,Houston Dash,4,1
2025-05-16,KC Current,Orlando Pride,1,0
2025-05-17,Seattle Reign,Louisville,1,0
2025-05-17,Chicago,NC Courage,0,2
2025-05-17,Utah Royals,Wash. Spirit,3,3
2025-05-17,Angel City FC,Bay FC,0,2
2025-05-23,Orlando Pride,Utah Royals,3,1
2025-05-23,Wash. Spirit,Seattle Reign,2,1
2025-05-24,KC Current,Chicago,3,1
2025-05-24,Bay FC,Houston Dash,2,2
2025-05-24,Louisville,Angel City FC,3,2
2025-05-25,NC Courage,San Diego Wave,2,5
2025-06-06,Utah Royals,Louisville,2,3
2025-06-06,Seattle Reign,San Diego Wave,2,1
2025-06-07,KC Current,NJ/NY Gotham,2,1
2025-06-07,Houston Dash,Orlando Pride,0,1
2025-06-07,Portland,Bay FC,0,1
2025-06-07,Chicago,Angel City FC,2,2
2025-06-08,NC Courage,Wash. Spirit,1,3
2025-06-13,San Diego Wave,Houston Dash,3,2
2025-06-13,NJ/NY Gotham,Utah Royals,3,0
2025-06-13,Orlando Pride,Bay FC,1,0
2025-06-14,Seattle Reign,Chicago,2,2
2025-06-14,Louisville,KC Current,2,4
2025-06-14,NC Courage,Angel City FC,2,1
2025-06-15,Wash. Spirit,Portland,0,2
2025-06-20,Orlando Pride,Louisville,0,2
2025-06-20,Angel City FC,KC Current,0,1
2025-06-21,Seattle Reign,Utah Royals,4,1
2025-06-21,Houston Dash,NC Courage,1,2
2025-06-21,Bay FC,NJ/NY Gotham,1,2
2025-06-21,Chicago,Portland,0,1
2025-06-22,Wash. Spirit,San Diego Wave,0,0
2025-08-01,KC Current,Louisville,2,0
2025-08-01,NJ/NY Gotham,Chicago,1,1
2025-08-01,Angel City FC,Seattle Reign,0,2
2025-08-02,San Diego Wave,NC Courage,0,0
2025-08-02,Houston Dash,Bay FC,2,2
2025-08-03,Portland,Wash. Spirit,1,2
2025-08-03,Utah Royals,Orlando Pride,1,1
2025-08-08,NC Courage,Houston Dash,1,2
2025-08-08,KC Current,Utah Royals,1,0
2025-08-09,Wash. Spirit,NJ/NY Gotham,0,0
2025-08-09,Louisville,Orlando Pride,1,1
2025-08-09,Angel City FC,San Diego Wave,1,1
2025-08-10,Bay FC,Chicago,1,1
2025-08-10,Seattle Reign,Portland,2,4
2025-08-15,Louisville,Wash. Spirit,2,2
2025-08-15,Angel City FC,Utah Royals,0,0
2025-08-16,Orlando Pride,KC Current,0,0
2025-08-16,Portland,NC Courage,1,1
2025-08-16,San Diego Wave,Bay FC,2,1
2025-08-17,Houston Dash,NJ/NY Gotham,2,1
2025-08-18,Chicago,Seattle Reign,3,3
2025-08-21,Orlando Pride,Angel City FC,0,1
2025-08-22,NC Courage,Chicago,3,3
2025-08-23,Wash. Spirit,Bay FC,3,2
2025-08-23,Utah Royals,NJ/NY Gotham,0,0
2025-08-23,KC Current,Portland,2,0
2025-08-24,Seattle Reign,Houston Dash,1,1
2025-08-24,Louisville,San Diego Wave,1,0
2025-08-29,Houston Dash,Louisville,1,1
2025-08-29,NJ/NY Gotham,Orlando Pride,2,0
2025-08-29,San Diego Wave,Seattle Reign,0,0
2025-08-29,Utah Royals,Portland,2,1
2025-08-30,NC Courage,KC Current,0,2
2025-08-31,Chicago,Wash. Spirit,1,1
2025-09-01,Bay FC,Angel City FC,1,2
2025-09-05,Portland,Louisville,2,1
2025-09-06,Utah Royals,NC Courage,1,1
2025-09-06,KC Current,Bay FC,2,0
2025-09-07,Orlando Pride,Chicago,2,5
2025-09-07,Seattle Reign,Wash. Spirit,0,2
2025-09-07,Angel City FC,NJ/NY Gotham,1,3
2025-09-07,Houston Dash,San Diego Wave,3,0
2025-09-12,NJ/NY Gotham,San Diego Wave,2,0
2025-09-13,Angel City FC,NC Courage,1,2
2025-09-13,Bay FC,Orlando Pride,1,1
2025-09-13,Wash. Spirit,KC Current,0,0
2025-09-14,Portland,Chicago,1,1
2025-09-14,Houston Dash,Utah Royals,0,2
2025-09-16,Louisville,Seattle Reign,0,1
2025-09-18,Wash. Spirit,Angel City FC,2,2
2025-09-19,Chicago,Houston Dash,0,1
2025-09-19,NC Courage,Orlando Pride,1,0
2025-09-19,Louisville,Utah Royals,2,3
2025-09-20,Seattle Reign,KC Current,0,2
2025-09-20,San Diego Wave,Portland,1,1
2025-09-21,NJ/NY Gotham,Bay FC,1,1
2025-09-26,Chicago,KC Current,1,4
2025-09-26,Portland,NJ/NY Gotham,0,3
2025-09-26,Orlando Pride,San Diego Wave,2,1
2025-09-27,Angel City FC,Louisville,0,1
2025-09-27,Utah Royals,Bay FC,2,0
2025-09-28,Houston Dash,Wash. Spirit,0,4
2025-09-28,NC Courage,Seattle Reign,1,2
2025-10-03,Orlando Pride,Houston Dash,1,1
2025-10-04,Louisville,NC Courage,3,1
2025-10-04,Bay FC,Portland,1,2
2025-10-05,San Diego Wave,Wash. Spirit,1,2
2025-10-05,Seattle Reign,NJ/NY Gotham,0,0
2025-10-05,Utah Royals,Chicago,2,2
2025-10-06,KC Current,Angel City FC,1,0
2025-10-10,Chicago,Louisville,1,1
2025-10-10,Portland,Orlando Pride,0,1
2025-10-10,Bay FC,Seattle Reign,1,1
2025-10-11,NJ/NY Gotham,KC Current,0,2
2025-10-11,Wash. Spirit,NC Courage,1,1
2025-10-11,San Diego Wave,Utah Royals,3,2
2025-10-12,Houston Dash,Angel City FC,0,2
2025-10-17,NC Courage,Bay FC,4,1
2025-10-17,Utah Royals,Seattle Reign,1,2
2025-10-18,Orlando Pride,Wash. Spirit,3,2
2025-10-18,KC Current,Houston Dash,0,1
2025-10-18,Chicago,San Diego Wave,1,6
2025-10-19,Louisville,NJ/NY Gotham,2,2
2025-10-19,Portland,Angel City FC,2,0
2025-11-02,San Diego Wave,KC Current,1,2
2025-11-02,Wash. Spirit,Utah Royals,0,1
2025-11-02,Houston Dash,Portland,0,2
2025-11-02,Seattle Reign,Orlando Pride,1,1
2025-11-02,NJ/NY Gotham,NC Courage,2,3
2025-11-02,Bay FC,Louisville,0,1
2025-11-02,Angel City FC,Chicago,1,2"""


# Stadium locations (approximate)
VENUES = {
    "Kansas City Current": {"stadium": "CPKC Stadium", "lat": 39.0484, "lon": -94.5834},
    "Washington Spirit": {"stadium": "Audi Field", "lat": 38.8686, "lon": -77.0127},
    "Portland Thorns FC": {"stadium": "Providence Park", "lat": 45.5215, "lon": -122.6916},
    "Orlando Pride": {"stadium": "Inter&Co Stadium", "lat": 28.5411, "lon": -81.3894},
    "Seattle Reign FC": {"stadium": "Lumen Field", "lat": 47.5952, "lon": -122.3316},
    "San Diego Wave FC": {"stadium": "Snapdragon Stadium", "lat": 32.7831, "lon": -117.1196},
    "Racing Louisville FC": {"stadium": "Lynn Family Stadium", "lat": 38.2210, "lon": -85.7399},
    "Gotham FC": {"stadium": "Red Bull Arena", "lat": 40.7368, "lon": -74.1503},
    "North Carolina Courage": {"stadium": "WakeMed Soccer Park", "lat": 35.8032, "lon": -78.7217},
    "Houston Dash": {"stadium": "Shell Energy Stadium", "lat": 29.7522, "lon": -95.3529},
    "Angel City FC": {"stadium": "BMO Stadium", "lat": 34.0126, "lon": -118.2841},
    "Utah Royals FC": {"stadium": "America First Field", "lat": 40.5828, "lon": -111.8933},
    "Bay FC": {"stadium": "PayPal Park", "lat": 37.3514, "lon": -121.9253},
    "Chicago Stars FC": {"stadium": "SeatGeek Stadium", "lat": 41.6328, "lon": -87.7281},
}


def main():
    out_dir = Path("data/raw")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Build matches CSV
    matches = []
    for i, line in enumerate(RAW_RESULTS.strip().split("\n")):
        parts = line.split(",")
        match_date = parts[0]
        home_raw = parts[1]
        away_raw = parts[2]
        home_goals = int(parts[3])
        away_goals = int(parts[4])

        home = TEAM_MAP.get(home_raw, home_raw)
        away = TEAM_MAP.get(away_raw, away_raw)

        matches.append({
            "match_id": f"NWSL2025-{i+1:03d}",
            "match_date": match_date,
            "season": 2025,
            "competition": "NWSL",
            "regular_season_flag": True,
            "home_team": home,
            "away_team": away,
            "home_goals_90": home_goals,
            "away_goals_90": away_goals,
            # No xG data available from public source - model will fall back to goals
            "home_npxg": "",
            "away_npxg": "",
            "home_xg": "",
            "away_xg": "",
            "home_penalties": "",
            "away_penalties": "",
            "venue": VENUES.get(home, {}).get("stadium", ""),
            "stadium": VENUES.get(home, {}).get("stadium", ""),
            "surface": "grass",
            "altitude_m": "",
            "weather_temp_c": "",
            "weather_wind_kph": "",
            "weather_precip_mm": "",
            "weather_humidity_pct": "",
            "match_status": "completed",
            "resumed_flag": False,
            "incomplete_flag": False,
        })

    # Write matches
    cols = list(matches[0].keys())
    with open(out_dir / "matches.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        writer.writerows(matches)

    print(f"Written {len(matches)} matches to {out_dir / 'matches.csv'}")

    # Verify standings
    from collections import defaultdict
    standings = defaultdict(lambda: {"w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0})
    for m in matches:
        h, a = m["home_team"], m["away_team"]
        hg, ag = m["home_goals_90"], m["away_goals_90"]
        standings[h]["gf"] += hg
        standings[h]["ga"] += ag
        standings[a]["gf"] += ag
        standings[a]["ga"] += hg
        if hg > ag:
            standings[h]["w"] += 1
            standings[h]["pts"] += 3
            standings[a]["l"] += 1
        elif hg < ag:
            standings[a]["w"] += 1
            standings[a]["pts"] += 3
            standings[h]["l"] += 1
        else:
            standings[h]["d"] += 1
            standings[a]["d"] += 1
            standings[h]["pts"] += 1
            standings[a]["pts"] += 1

    print("\nReconstructed standings:")
    print(f"{'Team':30s} {'W':>3s} {'D':>3s} {'L':>3s} {'GF':>3s} {'GA':>3s} {'GD':>4s} {'PTS':>4s}")
    for team, s in sorted(standings.items(), key=lambda x: -x[1]["pts"]):
        gd = s["gf"] - s["ga"]
        gp = s["w"] + s["d"] + s["l"]
        print(f"{team:30s} {s['w']:3d} {s['d']:3d} {s['l']:3d} {s['gf']:3d} {s['ga']:3d} {gd:+4d} {s['pts']:4d}  ({gp} GP)")

    total_goals = sum(m["home_goals_90"] + m["away_goals_90"] for m in matches)
    print(f"\nTotal goals: {total_goals} in {len(matches)} matches ({total_goals/len(matches):.2f} per match)")
    print(f"Home wins: {sum(1 for m in matches if m['home_goals_90'] > m['away_goals_90'])}")
    print(f"Draws: {sum(1 for m in matches if m['home_goals_90'] == m['away_goals_90'])}")
    print(f"Away wins: {sum(1 for m in matches if m['home_goals_90'] < m['away_goals_90'])}")

    # Write venues
    venue_rows = []
    for team, info in VENUES.items():
        venue_rows.append({
            "team": team,
            "home_stadium": info["stadium"],
            "stadium_lat": info["lat"],
            "stadium_lon": info["lon"],
            "altitude_m": 0,
            "surface": "grass",
            "timezone": "US/Eastern",
        })

    with open(out_dir / "venues.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(venue_rows[0].keys()))
        writer.writeheader()
        writer.writerows(venue_rows)
    print(f"\nWritten {len(venue_rows)} venues to {out_dir / 'venues.csv'}")


if __name__ == "__main__":
    main()
