import type { FantasyDataProvider } from "@/providers/contracts/fantasy-data-provider";
import type {
  ProviderClubRecord,
  ProviderFetchResult,
  ProviderFixtureRecord,
  ProviderPlayerRecord,
  ProviderRequestWindow,
  ProviderStatLineRecord,
} from "@/types/provider";

function emptyResult<T>(items: T[] = []): ProviderFetchResult<T> {
  return {
    provider: "api-football",
    items,
    status: process.env.API_FOOTBALL_KEY ? "ready" : "not-configured",
  };
}

export class ApiFootballProvider implements FantasyDataProvider {
  key = "api-football";

  async getClubs(): Promise<ProviderFetchResult<ProviderClubRecord>> {
    return emptyResult();
  }

  async getPlayers(): Promise<ProviderFetchResult<ProviderPlayerRecord>> {
    return emptyResult();
  }

  async getFixtures(
    window: ProviderRequestWindow
  ): Promise<ProviderFetchResult<ProviderFixtureRecord>> {
    void window;
    return emptyResult();
  }

  async getStatLines(
    window: ProviderRequestWindow
  ): Promise<ProviderFetchResult<ProviderStatLineRecord>> {
    void window;
    return emptyResult();
  }
}

export const apiFootballProvider = new ApiFootballProvider();
