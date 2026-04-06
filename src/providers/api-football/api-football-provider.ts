import type { FantasyDataProvider } from "@/providers/contracts/fantasy-data-provider";
import type {
  ProviderClubRecord,
  ProviderFetchResult,
  ProviderFixtureRecord,
  ProviderPlayerRecord,
  ProviderRequestWindow,
  ProviderStatLineRecord,
} from "@/types/provider";

const API_BASE = "https://v3.football.api-sports.io";
const NWSL_LEAGUE_ID = 254; // API-Football league ID for NWSL

interface ApiFootballResponse<T> {
  response: T[];
  errors: Record<string, string>;
  results: number;
}

function getApiKey(): string | undefined {
  return process.env.API_FOOTBALL_KEY;
}

async function apiFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
  const key = getApiKey();
  if (!key) return [];

  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": key,
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!res.ok) {
    console.error(`API-Football error: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = (await res.json()) as ApiFootballResponse<T>;
  if (Object.keys(data.errors).length > 0) {
    console.error("API-Football errors:", data.errors);
    return [];
  }

  return data.response;
}

// ── Response types from API-Football ────────────────────────────────────────

interface ApiTeam {
  team: {
    id: number;
    name: string;
    code: string | null;
    logo: string;
  };
}

interface ApiPlayer {
  player: {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    photo: string;
  };
  statistics: Array<{
    team: { id: number; name: string };
    games: { position: string | null; appearences: number | null; minutes: number | null };
    goals: { total: number | null; assists: number | null; saves: number | null };
    cards: { yellow: number | null; red: number | null };
    penalty: { saved: number | null; missed: number | null };
  }>;
}

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string };
    venue: { name: string | null; city: string | null };
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

interface ApiPlayerStats {
  player: { id: number; name: string };
  statistics: Array<{
    games: { minutes: number | null };
    goals: { total: number | null; assists: number | null; saves: number | null; conceded: number | null };
    cards: { yellow: number | null; red: number | null };
    penalty: { saved: number | null; missed: number | null };
  }>;
}

// ── Position mapping ────────────────────────────────────────────────────────

function mapPosition(apiPosition: string | null): "GK" | "DEF" | "MID" | "FWD" {
  switch (apiPosition?.toLowerCase()) {
    case "goalkeeper":
      return "GK";
    case "defender":
      return "DEF";
    case "midfielder":
      return "MID";
    case "attacker":
      return "FWD";
    default:
      return "MID";
  }
}

function mapFixtureStatus(shortStatus: string): string {
  switch (shortStatus) {
    case "FT":
    case "AET":
    case "PEN":
      return "FINAL";
    case "1H":
    case "HT":
    case "2H":
    case "ET":
    case "BT":
    case "LIVE":
      return "LIVE";
    case "NS":
    case "TBD":
      return "SCHEDULED";
    case "PST":
      return "POSTPONED";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "CANCELED";
    default:
      return "SCHEDULED";
  }
}

// ── Provider Implementation ─────────────────────────────────────────────────

export class ApiFootballProvider implements FantasyDataProvider {
  key = "api-football";

  async getClubs(): Promise<ProviderFetchResult<ProviderClubRecord>> {
    const key = getApiKey();
    if (!key) return { provider: "api-football", items: [], status: "not-configured" };

    const teams = await apiFetch<ApiTeam>("teams", {
      league: String(NWSL_LEAGUE_ID),
      season: "2026",
    });

    const items: ProviderClubRecord[] = teams.map((t) => ({
      providerId: String(t.team.id),
      name: t.team.name,
      shortName: t.team.code ?? t.team.name.slice(0, 3).toUpperCase(),
    }));

    return { provider: "api-football", items, status: "ready" };
  }

  async getPlayers(): Promise<ProviderFetchResult<ProviderPlayerRecord>> {
    const key = getApiKey();
    if (!key) return { provider: "api-football", items: [], status: "not-configured" };

    const allPlayers: ProviderPlayerRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 5) {
      const players = await apiFetch<ApiPlayer>("players", {
        league: String(NWSL_LEAGUE_ID),
        season: "2026",
        page: String(page),
      });

      for (const p of players) {
        const stat = p.statistics[0];
        if (!stat) continue;

        allPlayers.push({
          providerId: String(p.player.id),
          clubProviderId: String(stat.team.id),
          displayName: p.player.name,
          position: mapPosition(stat.games.position),
        });
      }

      hasMore = players.length >= 20;
      page++;
    }

    return { provider: "api-football", items: allPlayers, status: "ready" };
  }

  async getFixtures(
    window: ProviderRequestWindow
  ): Promise<ProviderFetchResult<ProviderFixtureRecord>> {
    const key = getApiKey();
    if (!key) return { provider: "api-football", items: [], status: "not-configured" };

    const fixtures = await apiFetch<ApiFixture>("fixtures", {
      league: String(NWSL_LEAGUE_ID),
      season: "2026",
      from: window.startAt.split("T")[0],
      to: window.endAt.split("T")[0],
    });

    const items: ProviderFixtureRecord[] = fixtures.map((f) => ({
      providerId: String(f.fixture.id),
      startsAt: f.fixture.date,
      homeClubProviderId: String(f.teams.home.id),
      awayClubProviderId: String(f.teams.away.id),
      status: mapFixtureStatus(f.fixture.status.short),
    }));

    return { provider: "api-football", items, status: "ready" };
  }

  async getStatLines(
    window: ProviderRequestWindow
  ): Promise<ProviderFetchResult<ProviderStatLineRecord>> {
    const key = getApiKey();
    if (!key) return { provider: "api-football", items: [], status: "not-configured" };

    // First get fixtures in window to get fixture IDs
    const fixturesResult = await this.getFixtures(window);
    const items: ProviderStatLineRecord[] = [];

    for (const fixture of fixturesResult.items) {
      const fixtureStats = await apiFetch<{ players: ApiPlayerStats[] }>(
        "fixtures/players",
        { fixture: fixture.providerId }
      );

      for (const team of fixtureStats) {
        for (const ps of team.players ?? []) {
          const stat = ps.statistics?.[0];
          if (!stat) continue;

          items.push({
            fixtureProviderId: fixture.providerId,
            playerProviderId: String(ps.player.id),
            minutes: stat.games?.minutes ?? 0,
            goals: stat.goals?.total ?? 0,
            assists: stat.goals?.assists ?? 0,
            cleanSheet: (stat.goals?.conceded ?? 1) === 0,
            saves: stat.goals?.saves ?? 0,
            goalsConceded: stat.goals?.conceded ?? 0,
            yellowCards: stat.cards?.yellow ?? 0,
            redCards: stat.cards?.red ?? 0,
            penaltySaves: stat.penalty?.saved ?? 0,
            penaltyMisses: stat.penalty?.missed ?? 0,
          });
        }
      }
    }

    return { provider: "api-football", items, status: "ready" };
  }
}

export const apiFootballProvider = new ApiFootballProvider();
