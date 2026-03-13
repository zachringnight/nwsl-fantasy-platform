import type { PlayerPosition } from "@/types/fantasy";

export type ProviderKey = "api-football" | "nwsl-availability-report" | "nwsl-data";

export interface ProviderRequestWindow {
  startAt: string;
  endAt: string;
}

export interface ProviderClubRecord {
  providerId: string;
  name: string;
  shortName: string;
}

export interface ProviderPlayerRecord {
  providerId: string;
  clubProviderId: string;
  displayName: string;
  position: PlayerPosition;
}

export interface ProviderFixtureRecord {
  providerId: string;
  startsAt: string;
  homeClubProviderId: string;
  awayClubProviderId: string;
  status: string;
}

export interface ProviderStatLineRecord {
  fixtureProviderId: string;
  playerProviderId: string;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  penaltySaves: number;
  penaltyMisses: number;
}

export interface ProviderFetchResult<T> {
  provider: ProviderKey;
  items: T[];
  status: "ready" | "not-configured";
}
