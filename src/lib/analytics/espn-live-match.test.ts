import { describe, expect, it } from "vitest";
import { parseEspnLiveMatch } from "./espn-live-match";

describe("parseEspnLiveMatch", () => {
  it("normalizes a live ESPN summary into match stats, events, and lineups", () => {
    const snapshot = parseEspnLiveMatch({
      header: {
        id: "401853951",
        competitions: [
          {
            date: "2026-07-26T23:00:00Z",
            venue: {
              fullName: "Snapdragon Stadium",
              address: { city: "San Diego" },
            },
            status: {
              type: {
                state: "in",
                description: "In Progress",
                shortDetail: "63'",
              },
            },
            competitors: [
              {
                homeAway: "home",
                score: "1",
                team: { id: "21423", displayName: "San Diego Wave FC" },
              },
              {
                homeAway: "away",
                score: "0",
                team: { id: "15363", displayName: "Seattle Reign FC" },
              },
            ],
          },
        ],
      },
      boxscore: {
        teams: [
          {
            team: { id: "21423", displayName: "San Diego Wave FC" },
            statistics: [
              { name: "possessionPct", displayValue: "54" },
              { name: "totalShots", displayValue: "12" },
              { name: "shotsOnTarget", displayValue: "5" },
              { name: "passPct", displayValue: "0.8" },
            ],
          },
          {
            team: { id: "15363", displayName: "Seattle Reign FC" },
            statistics: [
              { name: "possessionPct", displayValue: "46" },
              { name: "totalShots", displayValue: "8" },
              { name: "shotsOnTarget", displayValue: "2" },
              { name: "passPct", displayValue: "0.7" },
            ],
          },
        ],
      },
      gameInfo: {
        officials: [
          {
            displayName: "Marie Durr",
            position: { name: "Referee" },
          },
        ],
      },
      broadcasts: [{ media: { shortName: "ION" } }],
      keyEvents: [
        {
          id: "goal-1",
          type: { type: "goal", text: "Goal" },
          text: "Goal by Jaedyn Shaw",
          clock: { value: 3420, displayValue: "57'" },
          team: { displayName: "San Diego Wave FC" },
          participants: [
            { athlete: { id: "1", displayName: "Jaedyn Shaw" } },
          ],
        },
      ],
      rosters: [
        {
          team: { displayName: "San Diego Wave FC" },
          formation: "4-3-3",
          roster: [
            {
              starter: true,
              jersey: "11",
              position: { abbreviation: "F" },
              athlete: { id: "1", displayName: "Jaedyn Shaw" },
            },
          ],
        },
      ],
    });

    expect(snapshot).toMatchObject({
      matchId: "401853951",
      phase: "live",
      statusLabel: "63'",
      homeScore: 1,
      awayScore: 0,
      venue: "Snapdragon Stadium",
      city: "San Diego",
      referee: "Marie Durr",
      broadcasts: ["ION"],
    });
    expect(snapshot?.stats?.shots).toEqual({ home: 12, away: 8 });
    expect(snapshot?.stats?.passAccuracy).toEqual({ home: 80, away: 70 });
    expect(snapshot?.events[0]).toMatchObject({
      type: "goal",
      minuteLabel: "57'",
      playerName: "Jaedyn Shaw",
    });
    expect(snapshot?.lineups[0]).toMatchObject({
      teamName: "San Diego Wave FC",
      formation: "4-3-3",
      starters: [{ name: "Jaedyn Shaw", jersey: "11", position: "F" }],
    });
  });

  it("recognizes a completed match", () => {
    const snapshot = parseEspnLiveMatch({
      header: {
        id: "final-1",
        competitions: [
          {
            status: {
              type: {
                state: "post",
                completed: true,
                description: "Full Time",
              },
            },
            competitors: [
              {
                homeAway: "home",
                score: "1",
                team: { displayName: "Home FC" },
              },
              {
                homeAway: "away",
                score: "2",
                team: { displayName: "Away FC" },
              },
            ],
          },
        ],
      },
    });

    expect(snapshot?.phase).toBe("final");
    expect(snapshot?.homeScore).toBe(1);
    expect(snapshot?.awayScore).toBe(2);
  });
});
