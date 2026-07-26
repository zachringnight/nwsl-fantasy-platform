import { describe, expect, it } from "vitest";
import {
  buildMatchStateNarrative,
  buildPrematchNarrative,
  getHeadToHead,
  getRecentTeamForm,
} from "./match-context";
import type {
  MatchPrediction,
  MatchResult,
  TeamStanding,
} from "@/types/analytics";

const matches: MatchResult[] = [
  {
    matchId: "old-1",
    date: "2026-06-01",
    matchday: 10,
    homeTeam: "Home FC",
    homeTeamId: "home",
    awayTeam: "Away FC",
    awayTeamId: "away",
    homeGoals: 2,
    awayGoals: 1,
    homeXg: 1.7,
    awayXg: 0.9,
    venue: "Home Ground",
    status: "completed",
  },
  {
    matchId: "old-2",
    date: "2026-06-15",
    matchday: 11,
    homeTeam: "Third FC",
    homeTeamId: "third",
    awayTeam: "Home FC",
    awayTeamId: "home",
    homeGoals: 0,
    awayGoals: 0,
    homeXg: 0.8,
    awayXg: 1.1,
    venue: "Third Ground",
    status: "completed",
  },
  {
    matchId: "current",
    date: "2026-07-27",
    matchday: 12,
    homeTeam: "Home FC",
    homeTeamId: "home",
    awayTeam: "Away FC",
    awayTeamId: "away",
    homeGoals: 0,
    awayGoals: 0,
    homeXg: 0,
    awayXg: 0,
    venue: "Home Ground",
    status: "upcoming",
  },
];

const standing = (
  teamId: string,
  team: string,
  points: number
): TeamStanding => ({
  teamId,
  team,
  played: 12,
  won: 6,
  drawn: 3,
  lost: 3,
  goalsFor: 18,
  goalsAgainst: 12,
  goalDifference: 6,
  points,
  form: ["W", "D", "W"],
  xg: 17.5,
  xga: 12.4,
});

const prediction: MatchPrediction = {
  matchId: "current",
  date: "2026-07-27",
  homeTeam: "Home FC",
  homeTeamId: "home",
  awayTeam: "Away FC",
  awayTeamId: "away",
  homeProb: 0.52,
  drawProb: 0.27,
  awayProb: 0.21,
  bttsYesProb: 0.58,
  overUnder: {},
  asianHandicap: {},
  lambdaHome: 1.6,
  lambdaAway: 1,
  scoreMatrix: [],
  model: "dixon_coles",
  timestamp: "2026-07-26T12:00:00Z",
};

describe("match context", () => {
  it("builds recent form and head-to-head only from earlier completed matches", () => {
    const form = getRecentTeamForm(
      matches,
      "home",
      "2026-07-27",
      "current"
    );
    const headToHead = getHeadToHead(
      matches,
      "home",
      "away",
      "2026-07-27",
      "current"
    );

    expect(form.map((entry) => entry.result)).toEqual(["D", "W"]);
    expect(form[0]).toMatchObject({
      opponent: "Third FC",
      goalsFor: 0,
      goalsAgainst: 0,
    });
    expect(headToHead).toHaveLength(1);
    expect(headToHead[0].matchId).toBe("old-1");
  });

  it("writes a source-bounded preview from model, form, and table data", () => {
    const narrative = buildPrematchNarrative({
      match: matches[2],
      prediction,
      homeStanding: { rank: 2, standing: standing("home", "Home FC", 21) },
      awayStanding: { rank: 6, standing: standing("away", "Away FC", 15) },
      homeForm: getRecentTeamForm(
        matches,
        "home",
        "2026-07-27",
        "current"
      ),
      awayForm: getRecentTeamForm(
        matches,
        "away",
        "2026-07-27",
        "current"
      ),
    });

    expect(narrative.title).toBe("Match preview");
    expect(narrative.lead).toContain("52%");
    expect(narrative.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(["Model outlook", "Form guide", "Table context"])
    );
  });

  it("turns score and live statistics into a match report", () => {
    const narrative = buildMatchStateNarrative({
      phase: "final",
      statusLabel: "FT",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      homeScore: 2,
      awayScore: 1,
      stats: {
        possession: { home: 54, away: 46 },
        shots: { home: 12, away: 8 },
        shotsOnTarget: { home: 5, away: 2 },
        blockedShots: { home: null, away: null },
        corners: { home: null, away: null },
        fouls: { home: null, away: null },
        offsides: { home: null, away: null },
        saves: { home: null, away: null },
        passes: { home: null, away: null },
        passAccuracy: { home: null, away: null },
        tackles: { home: null, away: null },
        interceptions: { home: null, away: null },
        clearances: { home: null, away: null },
        yellowCards: { home: null, away: null },
        redCards: { home: null, away: null },
      },
      events: [],
    });

    expect(narrative.title).toBe("Match report");
    expect(narrative.lead).toBe("Home FC beat Away FC 2-1.");
    expect(narrative.sections[0].body).toContain("12 shots");
  });
});
