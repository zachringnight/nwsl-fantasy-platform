import type { SupabaseClient } from "@supabase/supabase-js";
import { officialFantasyPlayerPool } from "@/lib/generated/fantasy-player-pool.generated";
import {
  calculateFantasyScore,
  type StatLineInput,
} from "@/lib/scoring/scoring-engine";
import type { PlayerPosition } from "@/types/fantasy";

const API_ROOT = "https://api-sdp.nwslsoccer.com/v1/nwsl/football";
const MATCH_MINUTES = 90;

const ESTIMATED_FIELDS = [
  "shots",
  "shots_on_target",
  "chances_created",
  "successful_passes",
  "successful_crosses",
  "fouls_won",
  "fouls_committed",
  "tackles_won",
  "interceptions",
  "blocks",
  "saves",
  "penalty_saves",
  "penalty_conceded",
] as const;

interface OfficialEvent {
  type?: string;
  time?: number;
  additionalTime?: number;
  relatedPlayerId?: string | null;
}

interface OfficialPlayer {
  playerId: string;
  role?: number;
  roleLabel?: string;
  isGoalkeeper?: boolean;
  events?: OfficialEvent[];
}

interface OfficialLineupTeam {
  teamId: string;
  fielded?: OfficialPlayer[];
  benched?: OfficialPlayer[];
}

interface OfficialLineupResponse {
  home?: OfficialLineupTeam | null;
  away?: OfficialLineupTeam | null;
}

interface OfficialMatch {
  matchId: string;
  matchDateUtc?: string;
  homeScorePush?: number | string | null;
  awayScorePush?: number | string | null;
  home?: { score?: number | string | null };
  away?: { score?: number | string | null };
}

interface OfficialMatchesResponse {
  matches?: OfficialMatch[];
}

export interface FantasyPlayerMatchStatRow {
  player_id: string;
  match_id: string;
  season: string;
  team_id: string;
  match_date_utc: string;
  position: PlayerPosition;
  minutes: number;
  goals: number;
  assists: number;
  clean_sheet: boolean;
  saves: number;
  goals_conceded: number;
  yellow_cards: number;
  red_cards: number;
  penalty_saves: number;
  penalty_misses: number;
  shots: number;
  shots_on_target: number;
  chances_created: number;
  successful_passes: number;
  successful_crosses: number;
  fouls_won: number;
  fouls_committed: number;
  tackles_won: number;
  interceptions: number;
  blocks: number;
  penalty_conceded: number;
  own_goals: number;
  goalkeeper_win: boolean;
  goalkeeper_draw: boolean;
  stats_partially_estimated: boolean;
  estimated_fields: string[];
  fetched_at: string;
}

export interface FantasyPointSnapshotRow {
  player_id: string;
  match_id: string;
  season: string;
  match_date_utc: string;
  points: number;
  breakdown: Record<string, number>;
  is_approximated: boolean;
  estimated_fields: string[];
  computed_at: string;
}

interface IngestStore {
  writeStats(rows: FantasyPlayerMatchStatRow[]): Promise<void>;
  writeSnapshots(rows: FantasyPointSnapshotRow[]): Promise<void>;
}

export interface IngestMatchStatsOptions {
  fetcher?: typeof fetch;
  store?: IngestStore;
  now?: () => Date;
}

function stableId(id: string) {
  return id.split("::").pop() ?? id;
}

function eventMinute(event: OfficialEvent) {
  return Math.min(
    MATCH_MINUTES,
    Math.max(0, Number(event.time ?? 0) + Number(event.additionalTime ?? 0))
  );
}

function eventCount(player: OfficialPlayer, ...types: string[]) {
  return (player.events ?? []).filter((event) =>
    types.includes(String(event.type))
  ).length;
}

function positionFor(player: OfficialPlayer): PlayerPosition {
  const poolPlayer = officialFantasyPlayerPool.find(
    (candidate) => candidate.id === stableId(player.playerId)
  );

  if (poolPlayer) return poolPlayer.position;
  if (player.isGoalkeeper || player.role === 1) return "GK";

  const label = String(player.roleLabel ?? "").toLowerCase();
  if (label.includes("def")) return "DEF";
  if (label.includes("mid")) return "MID";
  return "FWD";
}

function minutesPlayed(player: OfficialPlayer, started: boolean) {
  const events = player.events ?? [];
  const substitutionIn = events.find(
    (event) => event.type === "substitution-in"
  );
  const substitutionOut = events.find(
    (event) => event.type === "substitution-out"
  );
  const start = started ? 0 : substitutionIn ? eventMinute(substitutionIn) : 90;
  const end = substitutionOut ? eventMinute(substitutionOut) : 90;

  return Math.max(0, end - start);
}

function scoreValue(
  match: OfficialMatch,
  side: "home" | "away"
) {
  const pushValue =
    side === "home" ? match.homeScorePush : match.awayScorePush;
  const nestedValue = side === "home" ? match.home?.score : match.away?.score;
  const value = Number(pushValue ?? nestedValue ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function rateEstimate(total: number, seasonMinutes: number, matchMinutes: number) {
  if (seasonMinutes <= 0 || matchMinutes <= 0) return 0;
  return Number(((total / seasonMinutes) * matchMinutes).toFixed(4));
}

function approximationFor(playerId: string, matchMinutes: number) {
  const player = officialFantasyPlayerPool.find(
    (candidate) => candidate.id === stableId(playerId)
  );
  const minutes = player?.minutes_2025 ?? 0;
  const estimate = (value: number | undefined) =>
    rateEstimate(value ?? 0, minutes, matchMinutes);

  return {
    shots: estimate(player?.shots_2025),
    shots_on_target: estimate(player?.shots_on_target_2025),
    chances_created: estimate(player?.chances_created_2025),
    successful_passes: estimate(player?.successful_passes_2025),
    successful_crosses: estimate(player?.successful_crosses_2025),
    fouls_won: estimate(player?.fouls_won_2025),
    fouls_committed: estimate(player?.fouls_committed_2025),
    tackles_won: estimate(player?.tackles_won_2025),
    interceptions: estimate(player?.interceptions_2025),
    blocks: estimate(player?.blocks_2025),
    saves: estimate(player?.saves_2025),
    penalty_saves: estimate(player?.penalty_saves_2025),
    penalty_conceded: estimate(player?.penalty_conceded_2025),
  };
}

function toScoringInput(row: FantasyPlayerMatchStatRow): StatLineInput {
  return {
    position: row.position,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,
    cleanSheet: row.clean_sheet,
    saves: row.saves,
    goalsConceded: row.goals_conceded,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    penaltySaves: row.penalty_saves,
    penaltyMisses: row.penalty_misses,
    shots: row.shots,
    shotsOnTarget: row.shots_on_target,
    chancesCreated: row.chances_created,
    successfulPasses: row.successful_passes,
    successfulCrosses: row.successful_crosses,
    foulsWon: row.fouls_won,
    foulsCommitted: row.fouls_committed,
    tacklesWon: row.tackles_won,
    interceptions: row.interceptions,
    blocks: row.blocks,
    penaltyConceded: row.penalty_conceded,
    ownGoals: row.own_goals,
    goalkeeperWin: row.goalkeeper_win,
    goalkeeperDraw: row.goalkeeper_draw,
  };
}

async function createSupabaseStore(): Promise<IngestStore> {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  const client = getSupabaseServerClient() as SupabaseClient;

  return {
    async writeStats(rows) {
      const { error } = await client
        .from("fantasy_player_match_stats")
        .upsert(rows, { onConflict: "player_id,match_id" });
      if (error) throw error;
    },
    async writeSnapshots(rows) {
      const { error } = await client
        .from("fantasy_point_snapshots")
        .upsert(rows, { onConflict: "player_id,match_id" });
      if (error) throw error;
    },
  };
}

async function fetchJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Official NWSL API request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

export async function ingestMatchStats(
  matchId: string,
  seasonId: string,
  options: IngestMatchStatsOptions = {}
) {
  if (!matchId || !seasonId) {
    throw new Error("matchId and seasonId are required");
  }

  const fetcher = options.fetcher ?? fetch;
  const matchesUrl = `${API_ROOT}/seasons/${encodeURIComponent(
    seasonId
  )}/matches?locale=en-US`;
  const lineupsUrl = `${API_ROOT}/seasons/${encodeURIComponent(
    seasonId
  )}/matches/${encodeURIComponent(matchId)}/lineups?locale=en-US`;

  const [matchesPayload, lineup] = await Promise.all([
    fetchJson<OfficialMatchesResponse>(fetcher, matchesUrl),
    fetchJson<OfficialLineupResponse>(fetcher, lineupsUrl),
  ]);
  const match = (matchesPayload.matches ?? []).find(
    (candidate) => candidate.matchId === matchId
  );

  if (!match?.matchDateUtc) {
    throw new Error(`Match ${matchId} was not found in season ${seasonId}`);
  }
  if (!lineup.home || !lineup.away) {
    throw new Error(`Lineup data is not available for match ${matchId}`);
  }

  const fetchedAt = (options.now ?? (() => new Date()))().toISOString();
  const rosterPlayers = [
    ...(lineup.home.fielded ?? []),
    ...(lineup.home.benched ?? []),
    ...(lineup.away.fielded ?? []),
    ...(lineup.away.benched ?? []),
  ];
  const rosterIds = new Set(rosterPlayers.map((player) => player.playerId));
  const assistsByPlayer = new Map<string, number>();

  for (const player of rosterPlayers) {
    for (const event of player.events ?? []) {
      if (
        (event.type === "goal" || event.type === "penalty-goal") &&
        event.relatedPlayerId &&
        rosterIds.has(event.relatedPlayerId)
      ) {
        assistsByPlayer.set(
          event.relatedPlayerId,
          (assistsByPlayer.get(event.relatedPlayerId) ?? 0) + 1
        );
      }
    }
  }

  const rows: FantasyPlayerMatchStatRow[] = [];
  const addTeam = (
    team: OfficialLineupTeam,
    opponentScore: number,
    teamScore: number
  ) => {
    const addPlayer = (player: OfficialPlayer, started: boolean) => {
      const minutes = minutesPlayed(player, started);
      if (minutes <= 0) return;

      const position = positionFor(player);
      const estimated = approximationFor(player.playerId, minutes);
      const secondYellow = eventCount(player, "second-yellow-card");
      const isGoalkeeper = position === "GK";

      rows.push({
        player_id: stableId(player.playerId),
        match_id: matchId,
        season: seasonId,
        team_id: stableId(team.teamId),
        match_date_utc: match.matchDateUtc!,
        position,
        minutes,
        goals: eventCount(player, "goal", "penalty-goal"),
        assists: assistsByPlayer.get(player.playerId) ?? 0,
        clean_sheet: opponentScore === 0,
        saves: estimated.saves,
        goals_conceded: opponentScore,
        yellow_cards: eventCount(player, "yellow-card") + secondYellow,
        red_cards: eventCount(player, "red-card") + secondYellow,
        penalty_saves: estimated.penalty_saves,
        penalty_misses: 0,
        shots: estimated.shots,
        shots_on_target: estimated.shots_on_target,
        chances_created: estimated.chances_created,
        successful_passes: estimated.successful_passes,
        successful_crosses: estimated.successful_crosses,
        fouls_won: estimated.fouls_won,
        fouls_committed: estimated.fouls_committed,
        tackles_won: estimated.tackles_won,
        interceptions: estimated.interceptions,
        blocks: estimated.blocks,
        penalty_conceded: estimated.penalty_conceded,
        own_goals: eventCount(player, "own-goal"),
        goalkeeper_win: isGoalkeeper && teamScore > opponentScore,
        goalkeeper_draw: isGoalkeeper && teamScore === opponentScore,
        stats_partially_estimated: true,
        estimated_fields: [...ESTIMATED_FIELDS],
        fetched_at: fetchedAt,
      });
    };

    for (const player of team.fielded ?? []) addPlayer(player, true);
    for (const player of team.benched ?? []) addPlayer(player, false);
  };

  const homeScore = scoreValue(match, "home");
  const awayScore = scoreValue(match, "away");
  addTeam(lineup.home, awayScore, homeScore);
  addTeam(lineup.away, homeScore, awayScore);

  const snapshots: FantasyPointSnapshotRow[] = rows.map((row) => {
    const score = calculateFantasyScore(toScoringInput(row));
    return {
      player_id: row.player_id,
      match_id: row.match_id,
      season: row.season,
      match_date_utc: row.match_date_utc,
      points: score.total,
      breakdown: score.breakdown,
      is_approximated: row.stats_partially_estimated,
      estimated_fields: row.estimated_fields,
      computed_at: fetchedAt,
    };
  });

  const store = options.store ?? (await createSupabaseStore());
  await store.writeStats(rows);
  await store.writeSnapshots(snapshots);

  return {
    statsWritten: rows.length,
    snapshotsComputed: snapshots.length,
  };
}
