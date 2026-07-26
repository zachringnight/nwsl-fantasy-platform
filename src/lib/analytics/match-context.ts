import type {
  MatchPrediction,
  MatchResult,
  TeamRating,
  TeamStanding,
} from "@/types/analytics";
import type {
  EspnLiveMatchEvent,
  EspnLiveMatchStats,
} from "@/lib/analytics/espn-live-match";

export interface MatchFormEntry {
  matchId: string;
  date: string;
  opponent: string;
  opponentId: string;
  result: "W" | "D" | "L";
  goalsFor: number;
  goalsAgainst: number;
}

export interface HeadToHeadEntry {
  matchId: string;
  date: string;
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface RankedStanding {
  rank: number;
  standing: TeamStanding;
}

export interface MatchNarrative {
  title: string;
  lead: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formSummary(entries: MatchFormEntry[]): string | null {
  if (entries.length === 0) return null;
  const wins = entries.filter((entry) => entry.result === "W").length;
  const draws = entries.filter((entry) => entry.result === "D").length;
  const losses = entries.filter((entry) => entry.result === "L").length;
  const goalsFor = entries.reduce((sum, entry) => sum + entry.goalsFor, 0);
  const goalsAgainst = entries.reduce(
    (sum, entry) => sum + entry.goalsAgainst,
    0
  );
  return `${wins}-${draws}-${losses} across the last ${entries.length}, scoring ${goalsFor} and conceding ${goalsAgainst}`;
}

export function getRecentTeamForm(
  matches: MatchResult[],
  teamId: string,
  beforeDate: string,
  excludeMatchId: string,
  limit = 5
): MatchFormEntry[] {
  return matches
    .filter(
      (match) =>
        match.status === "completed" &&
        match.matchId !== excludeMatchId &&
        match.date <= beforeDate &&
        (match.homeTeamId === teamId || match.awayTeamId === teamId)
    )
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.matchId.localeCompare(left.matchId)
    )
    .slice(0, limit)
    .map((match) => {
      const isHome = match.homeTeamId === teamId;
      const goalsFor = isHome ? match.homeGoals : match.awayGoals;
      const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
      return {
        matchId: match.matchId,
        date: match.date,
        opponent: isHome ? match.awayTeam : match.homeTeam,
        opponentId: isHome ? match.awayTeamId : match.homeTeamId,
        result:
          goalsFor > goalsAgainst
            ? "W"
            : goalsFor < goalsAgainst
              ? "L"
              : "D",
        goalsFor,
        goalsAgainst,
      };
    });
}

export function getHeadToHead(
  matches: MatchResult[],
  homeTeamId: string,
  awayTeamId: string,
  beforeDate: string,
  excludeMatchId: string,
  limit = 5
): HeadToHeadEntry[] {
  return matches
    .filter((match) => {
      if (
        match.status !== "completed" ||
        match.matchId === excludeMatchId ||
        match.date > beforeDate
      ) {
        return false;
      }
      return (
        (match.homeTeamId === homeTeamId &&
          match.awayTeamId === awayTeamId) ||
        (match.homeTeamId === awayTeamId &&
          match.awayTeamId === homeTeamId)
      );
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.matchId.localeCompare(left.matchId)
    )
    .slice(0, limit)
    .map((match) => ({
      matchId: match.matchId,
      date: match.date,
      homeTeam: match.homeTeam,
      homeTeamId: match.homeTeamId,
      awayTeam: match.awayTeam,
      awayTeamId: match.awayTeamId,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
    }));
}

export function buildPrematchNarrative({
  match,
  prediction,
  homeStanding,
  awayStanding,
  homeForm,
  awayForm,
  homeRating,
  awayRating,
}: {
  match: MatchResult;
  prediction?: MatchPrediction;
  homeStanding?: RankedStanding;
  awayStanding?: RankedStanding;
  homeForm: MatchFormEntry[];
  awayForm: MatchFormEntry[];
  homeRating?: TeamRating;
  awayRating?: TeamRating;
}): MatchNarrative {
  const homeFormText = formSummary(homeForm);
  const awayFormText = formSummary(awayForm);
  const sections: MatchNarrative["sections"] = [];

  let lead = `${match.homeTeam} host ${match.awayTeam} at ${match.venue || "a venue to be confirmed"}.`;

  if (prediction) {
    const outcomes = [
      { label: match.homeTeam, value: prediction.homeProb },
      { label: "the draw", value: prediction.drawProb },
      { label: match.awayTeam, value: prediction.awayProb },
    ].sort((left, right) => right.value - left.value);
    const totalExpectedGoals = prediction.lambdaHome + prediction.lambdaAway;
    lead = `The model makes ${outcomes[0].label} the most likely result at ${percentage(outcomes[0].value)}, with a projected ${prediction.lambdaHome.toFixed(1)}-${prediction.lambdaAway.toFixed(1)} expected-goals profile.`;
    sections.push({
      title: "Model outlook",
      body: `${match.homeTeam} ${percentage(prediction.homeProb)} · draw ${percentage(prediction.drawProb)} · ${match.awayTeam} ${percentage(prediction.awayProb)}. The model puts both teams scoring at ${percentage(prediction.bttsYesProb)} and expects ${totalExpectedGoals.toFixed(1)} total goals.`,
    });
  }

  if (homeFormText || awayFormText) {
    sections.push({
      title: "Form guide",
      body: [
        homeFormText ? `${match.homeTeam} are ${homeFormText}.` : null,
        awayFormText ? `${match.awayTeam} are ${awayFormText}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (homeStanding || awayStanding) {
    sections.push({
      title: "Table context",
      body: [
        homeStanding
          ? `${match.homeTeam} enter ${ordinal(homeStanding.rank)} with ${homeStanding.standing.points} points and a ${signed(homeStanding.standing.goalDifference)} goal difference.`
          : null,
        awayStanding
          ? `${match.awayTeam} enter ${ordinal(awayStanding.rank)} with ${awayStanding.standing.points} points and a ${signed(awayStanding.standing.goalDifference)} goal difference.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (homeRating && awayRating) {
    const ratingEdge =
      homeRating.overallRating === awayRating.overallRating
        ? null
        : homeRating.overallRating > awayRating.overallRating
          ? homeRating
          : awayRating;
    const attackEdge =
      homeRating.attackRating === awayRating.attackRating
        ? null
        : homeRating.attackRating > awayRating.attackRating
          ? homeRating
          : awayRating;
    sections.push({
      title: "What to watch",
      body: ratingEdge
        ? `${ratingEdge.team} hold the stronger overall model rating, while ${attackEdge?.team ?? "neither side"} carry the attacking-rating edge. The pressure point is whether that advantage becomes clear chances rather than low-value possession.`
        : "The overall ratings are effectively level, so finishing, set pieces, and game state carry more weight than a broad team-strength edge.",
    });
  }

  return {
    title: "Match preview",
    lead,
    sections,
  };
}

function ordinal(value: number): string {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function statSentence(
  homeTeam: string,
  awayTeam: string,
  stats: EspnLiveMatchStats | null
): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (stats.shots.home !== null && stats.shots.away !== null) {
    parts.push(
      `${homeTeam} have ${stats.shots.home} shots to ${awayTeam}'s ${stats.shots.away}`
    );
  }
  if (
    stats.shotsOnTarget.home !== null &&
    stats.shotsOnTarget.away !== null
  ) {
    parts.push(
      `${stats.shotsOnTarget.home}-${stats.shotsOnTarget.away} on target`
    );
  }
  if (
    stats.possession.home !== null &&
    stats.possession.away !== null
  ) {
    parts.push(
      `${stats.possession.home.toFixed(0)}%-${stats.possession.away.toFixed(0)}% possession`
    );
  }
  return parts.length ? `${parts.join(" and ")}.` : null;
}

export function buildMatchStateNarrative({
  phase,
  statusLabel,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  stats,
  events,
}: {
  phase: "live" | "final";
  statusLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  stats: EspnLiveMatchStats | null;
  events: EspnLiveMatchEvent[];
}): MatchNarrative {
  const isDraw = homeScore === awayScore;
  const leader = homeScore > awayScore ? homeTeam : awayTeam;
  const trailer = homeScore > awayScore ? awayTeam : homeTeam;
  const statLine = statSentence(homeTeam, awayTeam, stats);
  const goals = events.filter((event) => event.type === "goal");
  const keyMoments = goals
    .slice(-3)
    .map(
      (event) =>
        `${event.playerName}${event.minuteLabel ? ` ${event.minuteLabel}` : ""}`
    )
    .join(", ");

  if (phase === "live") {
    return {
      title: "Live match report",
      lead: isDraw
        ? `${homeTeam} and ${awayTeam} are level ${homeScore}-${awayScore} at ${statusLabel}.`
        : `${leader} lead ${trailer} ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)} at ${statusLabel}.`,
      sections: [
        ...(statLine
          ? [{ title: "How it is playing", body: statLine }]
          : []),
        ...(keyMoments
          ? [{ title: "Goals so far", body: keyMoments }]
          : []),
      ],
    };
  }

  return {
    title: "Match report",
    lead: isDraw
      ? `${homeTeam} and ${awayTeam} finished ${homeScore}-${awayScore}.`
      : `${leader} beat ${trailer} ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}.`,
    sections: [
      ...(statLine ? [{ title: "By the numbers", body: statLine }] : []),
      ...(keyMoments
        ? [{ title: "Scoring summary", body: keyMoments }]
        : []),
    ],
  };
}
