import type { AvailabilityStatus, PlayerPosition } from "@/types/fantasy";

/**
 * Canonical NWSL public-data contracts.
 *
 * These types describe the normalized rows stored in the `nwsl_*` Supabase
 * tables created by `supabase/migrations/20260724_nwsl_public_data.sql`.
 * They are the shared vocabulary between provider ingest (added in a later
 * packet) and every public read model built on top of it.
 *
 * Every record carries its own provenance (`source`) and an
 * `isApproximated` flag so callers can render an honest "unavailable" or
 * "estimated" state instead of fabricating a value. See
 * `src/lib/nwsl/contracts.ts` for the Zod parsers that produce these types
 * from raw Supabase rows.
 */

/** Lifecycle state of an NWSL match. Closed set: no other value is valid. */
export type NwslMatchStatus =
  | "scheduled"
  | "live"
  | "final"
  | "postponed"
  | "canceled";

/**
 * Data providers this platform ingests from. `nwsl_official` is always
 * primary; `espn` is a documented fallback for schedule, result, venue,
 * broadcast, and standings fields only.
 */
export type NwslProvider = "nwsl_official" | "espn";

/**
 * Provenance stamp attached to every canonical NWSL record. `sourceUrl` is
 * optional because not every provider response is fetched from an
 * addressable URL worth persisting.
 */
export interface NwslSourceStamp {
  provider: NwslProvider;
  fetchedAt: string;
  sourceSeason: string;
  sourceUrl?: string;
  isFallback: boolean;
}

export interface NwslTeamRecord {
  id: string;
  providerId: string;
  slug: string;
  name: string;
  abbreviation: string;
  crestUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  isActive: boolean;
  isApproximated: boolean;
  source: NwslSourceStamp;
  createdAt: string;
  updatedAt: string;
}

export interface NwslPlayerRecord {
  id: string;
  providerId: string;
  slug: string;
  displayName: string;
  /** Null when the player is not currently mapped to a roster. */
  teamId: string | null;
  position: PlayerPosition;
  /** Null when unassigned or not yet reported by any provider. */
  jerseyNumber: number | null;
  /** Null when no provider has supplied a headshot; never a placeholder URL. */
  headshotUrl: string | null;
  availability: AvailabilityStatus;
  isApproximated: boolean;
  source: NwslSourceStamp;
  createdAt: string;
  updatedAt: string;
}

export interface NwslMatchRecord {
  id: string;
  providerId: string;
  season: string;
  kickoffAt: string;
  status: NwslMatchStatus;
  homeTeamId: string;
  awayTeamId: string;
  /** Null until the match has a reported score; never fabricated as 0. */
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  broadcast: Record<string, unknown>;
  isApproximated: boolean;
  source: NwslSourceStamp;
  createdAt: string;
  updatedAt: string;
}

export interface NwslMatchEventRecord {
  id: string;
  /** Stable, provider-agnostic idempotency key computed by the ingest layer. */
  eventKey: string;
  matchId: string;
  /** Null when the source provider does not issue a per-event id. */
  providerEventId: string | null;
  sequence: number;
  minute: number;
  stoppageMinute: number | null;
  type: string;
  teamId: string | null;
  playerId: string | null;
  /** e.g. the assist provider, or the player substituted out. */
  relatedPlayerId: string | null;
  payload: Record<string, unknown>;
  isApproximated: boolean;
  source: NwslSourceStamp;
  createdAt: string;
  updatedAt: string;
}
