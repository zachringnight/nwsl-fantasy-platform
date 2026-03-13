import type {
  ProviderClubRecord,
  ProviderFetchResult,
  ProviderFixtureRecord,
  ProviderPlayerRecord,
  ProviderRequestWindow,
  ProviderStatLineRecord,
} from "@/types/provider";

export interface FantasyDataProvider {
  key: string;
  getClubs(): Promise<ProviderFetchResult<ProviderClubRecord>>;
  getPlayers(): Promise<ProviderFetchResult<ProviderPlayerRecord>>;
  getFixtures(window: ProviderRequestWindow): Promise<ProviderFetchResult<ProviderFixtureRecord>>;
  getStatLines(window: ProviderRequestWindow): Promise<ProviderFetchResult<ProviderStatLineRecord>>;
}
