const ESPN_NWSL_SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.nwsl/summary";

type MatchPhase = "prematch" | "live" | "final";

interface EspnTeamRef {
  id?: string;
  displayName?: string;
}

interface EspnCompetitor {
  homeAway?: "home" | "away";
  score?: string;
  winner?: boolean;
  team?: EspnTeamRef;
}

interface EspnCompetition {
  date?: string;
  venue?: {
    fullName?: string;
    address?: {
      city?: string;
    };
  };
  competitors?: EspnCompetitor[];
  status?: {
    type?: {
      state?: "pre" | "in" | "post";
      completed?: boolean;
      description?: string;
      detail?: string;
      shortDetail?: string;
    };
  };
}

interface EspnStatistic {
  name?: string;
  displayValue?: string;
}

interface EspnBoxscoreTeam {
  team?: EspnTeamRef;
  statistics?: EspnStatistic[];
}

interface EspnKeyEvent {
  id?: string;
  type?: {
    type?: string;
    text?: string;
  };
  text?: string;
  shortText?: string;
  clock?: {
    value?: number;
    displayValue?: string;
  };
  team?: EspnTeamRef;
  participants?: Array<{
    athlete?: {
      id?: string;
      displayName?: string;
    };
  }>;
}

interface EspnRoster {
  team?: EspnTeamRef;
  formation?: string;
  roster?: Array<{
    starter?: boolean;
    jersey?: string;
    position?: {
      abbreviation?: string;
    };
    athlete?: {
      id?: string;
      displayName?: string;
    };
  }>;
}

interface EspnSummaryResponse {
  header?: {
    id?: string;
    competitions?: EspnCompetition[];
  };
  boxscore?: {
    teams?: EspnBoxscoreTeam[];
  };
  gameInfo?: {
    venue?: {
      fullName?: string;
      address?: {
        city?: string;
      };
    };
    officials?: Array<{
      fullName?: string;
      displayName?: string;
      position?: {
        name?: string;
        displayName?: string;
      };
    }>;
  };
  broadcasts?: Array<{
    media?: {
      name?: string;
      shortName?: string;
    };
  }>;
  keyEvents?: EspnKeyEvent[];
  rosters?: EspnRoster[];
}

export interface MatchStatPair {
  home: number | null;
  away: number | null;
}

export interface EspnLiveMatchStats {
  possession: MatchStatPair;
  shots: MatchStatPair;
  shotsOnTarget: MatchStatPair;
  blockedShots: MatchStatPair;
  corners: MatchStatPair;
  fouls: MatchStatPair;
  offsides: MatchStatPair;
  saves: MatchStatPair;
  passes: MatchStatPair;
  passAccuracy: MatchStatPair;
  tackles: MatchStatPair;
  interceptions: MatchStatPair;
  clearances: MatchStatPair;
  yellowCards: MatchStatPair;
  redCards: MatchStatPair;
}

export interface EspnLiveMatchEvent {
  id: string;
  minute: number;
  minuteLabel: string;
  type: "goal" | "yellow_card" | "red_card" | "substitution";
  team: string;
  playerName: string;
  secondaryPlayerName: string | null;
  detail: string;
}

export interface EspnMatchLineup {
  teamName: string;
  formation: string | null;
  starters: Array<{
    espnId: string | null;
    name: string;
    jersey: string | null;
    position: string | null;
  }>;
}

export interface EspnLiveMatchSnapshot {
  matchId: string;
  phase: MatchPhase;
  statusLabel: string;
  kickoff: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamEspnId: string | null;
  awayTeamEspnId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  city: string | null;
  referee: string | null;
  broadcasts: string[];
  stats: EspnLiveMatchStats | null;
  events: EspnLiveMatchEvent[];
  lineups: EspnMatchLineup[];
}

function toNumber(value: string | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function phaseFromCompetition(competition: EspnCompetition): MatchPhase {
  if (competition.status?.type?.completed || competition.status?.type?.state === "post") {
    return "final";
  }
  if (competition.status?.type?.state === "in") return "live";
  return "prematch";
}

function eventType(
  value: string | undefined
): EspnLiveMatchEvent["type"] | null {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("goal") || normalized === "penalty---scored") {
    return "goal";
  }
  if (normalized === "yellow-card") return "yellow_card";
  if (normalized === "red-card") return "red_card";
  if (normalized === "substitution") return "substitution";
  return null;
}

function parseEvents(events: EspnKeyEvent[]): EspnLiveMatchEvent[] {
  return events
    .map((event, index): EspnLiveMatchEvent | null => {
      const type = eventType(event.type?.type);
      if (!type) return null;
      const participantNames = (event.participants ?? [])
        .map((participant) => participant.athlete?.displayName)
        .filter((name): name is string => Boolean(name));
      const minute = Number(event.clock?.value ?? 0);

      return {
        id: event.id ?? `${minute}-${type}-${index}`,
        minute: Number.isFinite(minute) ? minute : 0,
        minuteLabel: event.clock?.displayValue || "",
        type,
        team: event.team?.displayName ?? "",
        playerName:
          participantNames[0] ??
          event.shortText ??
          event.type?.text ??
          "Match event",
        secondaryPlayerName: participantNames[1] ?? null,
        detail: event.text ?? event.shortText ?? event.type?.text ?? "",
      };
    })
    .filter((event): event is EspnLiveMatchEvent => event !== null)
    .sort((left, right) => left.minute - right.minute);
}

function parseLineups(rosters: EspnRoster[]): EspnMatchLineup[] {
  return rosters
    .map((roster) => ({
      teamName: roster.team?.displayName ?? "",
      formation: roster.formation ?? null,
      starters: (roster.roster ?? [])
        .filter((player) => player.starter && player.athlete?.displayName)
        .map((player) => ({
          espnId: player.athlete?.id ?? null,
          name: player.athlete?.displayName ?? "",
          jersey: player.jersey ?? null,
          position: player.position?.abbreviation ?? null,
        })),
    }))
    .filter((lineup) => lineup.teamName && lineup.starters.length > 0);
}

function parseStats(
  teams: EspnBoxscoreTeam[],
  homeTeamId: string | undefined,
  awayTeamId: string | undefined
): EspnLiveMatchStats | null {
  const home =
    teams.find((team) => team.team?.id === homeTeamId) ??
    teams[0];
  const away =
    teams.find((team) => team.team?.id === awayTeamId) ??
    teams[1];
  if (!home || !away) return null;

  const stat = (team: EspnBoxscoreTeam, name: string): number | null =>
    toNumber(team.statistics?.find((row) => row.name === name)?.displayValue);
  const pair = (name: string, percentage = false): MatchStatPair => {
    const normalize = (value: number | null) =>
      percentage && value !== null && Math.abs(value) <= 1
        ? Math.round(value * 1000) / 10
        : value;
    return {
      home: normalize(stat(home, name)),
      away: normalize(stat(away, name)),
    };
  };

  const stats: EspnLiveMatchStats = {
    possession: pair("possessionPct", true),
    shots: pair("totalShots"),
    shotsOnTarget: pair("shotsOnTarget"),
    blockedShots: pair("blockedShots"),
    corners: pair("wonCorners"),
    fouls: pair("foulsCommitted"),
    offsides: pair("offsides"),
    saves: pair("saves"),
    passes: pair("totalPasses"),
    passAccuracy: pair("passPct", true),
    tackles: pair("totalTackles"),
    interceptions: pair("interceptions"),
    clearances: pair("totalClearance"),
    yellowCards: pair("yellowCards"),
    redCards: pair("redCards"),
  };

  return Object.values(stats).some(
    (value) => value.home !== null || value.away !== null
  )
    ? stats
    : null;
}

export function parseEspnLiveMatch(
  payload: EspnSummaryResponse
): EspnLiveMatchSnapshot | null {
  const competition = payload.header?.competitions?.[0];
  if (!competition) return null;
  const home = competition.competitors?.find(
    (competitor) => competitor.homeAway === "home"
  );
  const away = competition.competitors?.find(
    (competitor) => competitor.homeAway === "away"
  );
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const venue = payload.gameInfo?.venue ?? competition.venue;
  const referee = payload.gameInfo?.officials?.find((official) => {
    const position =
      official.position?.name ?? official.position?.displayName ?? "";
    return position.toLowerCase() === "referee";
  });
  const statusType = competition.status?.type;

  return {
    matchId: payload.header?.id ?? "",
    phase: phaseFromCompetition(competition),
    statusLabel:
      statusType?.shortDetail ??
      statusType?.detail ??
      statusType?.description ??
      "Scheduled",
    kickoff: competition.date ?? null,
    homeTeam: home.team.displayName,
    awayTeam: away.team.displayName,
    homeTeamEspnId: home.team.id ?? null,
    awayTeamEspnId: away.team.id ?? null,
    homeScore: toNumber(home.score),
    awayScore: toNumber(away.score),
    venue: venue?.fullName ?? null,
    city: venue?.address?.city ?? null,
    referee: referee?.displayName ?? referee?.fullName ?? null,
    broadcasts: [
      ...new Set(
        (payload.broadcasts ?? [])
          .map(
            (broadcast) =>
              broadcast.media?.shortName ?? broadcast.media?.name
          )
          .filter((name): name is string => Boolean(name))
      ),
    ],
    stats: parseStats(
      payload.boxscore?.teams ?? [],
      home.team.id,
      away.team.id
    ),
    events: parseEvents(payload.keyEvents ?? []),
    lineups: parseLineups(payload.rosters ?? []),
  };
}

export async function getEspnLiveMatch(
  matchId: string
): Promise<EspnLiveMatchSnapshot | null> {
  try {
    const response = await fetch(
      `${ESPN_NWSL_SUMMARY_URL}?event=${encodeURIComponent(matchId)}`,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as EspnSummaryResponse;
    return parseEspnLiveMatch(payload);
  } catch {
    return null;
  }
}
