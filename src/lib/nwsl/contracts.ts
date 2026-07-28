import { z } from "zod";

import type { AvailabilityStatus, PlayerPosition } from "@/types/fantasy";
import type {
  NwslMatchRecord,
  NwslMatchStatus,
  NwslPlayerRecord,
  NwslProvider,
  NwslSourceStamp,
} from "@/types/nwsl-data";

/**
 * Zod-backed contracts for canonical NWSL data rows.
 *
 * These parsers validate raw rows (snake_case, matching the `nwsl_*`
 * Supabase tables created by `supabase/migrations/20260724_nwsl_public_data.sql`)
 * and return the camelCase domain records defined in `src/types/nwsl-data.ts`.
 *
 * Status and provider strings are closed enums: an unrecognized value fails
 * to parse rather than passing through, so callers never render a
 * fabricated or ambiguous state for data that isn't backed by a real,
 * recognized source.
 */

const NWSL_MATCH_STATUSES = [
  "scheduled",
  "live",
  "final",
  "postponed",
  "canceled",
] as const satisfies readonly NwslMatchStatus[];

const NWSL_PROVIDERS = [
  "nwsl_official",
  "espn",
] as const satisfies readonly NwslProvider[];

const NWSL_PLAYER_POSITIONS = [
  "GK",
  "DEF",
  "MID",
  "FWD",
] as const satisfies readonly PlayerPosition[];

const NWSL_AVAILABILITY_STATUSES = [
  "available",
  "questionable",
  "out",
] as const satisfies readonly AvailabilityStatus[];

/**
 * Lowercase, hyphen-separated segments only (e.g. `sky-blue-fc`). Matches
 * the `_slug_format` check constraint on `nwsl_teams` and `nwsl_players` so
 * anything that clears this parser also clears the database constraint.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nwslMatchStatusSchema = z.enum(NWSL_MATCH_STATUSES);
const nwslProviderSchema = z.enum(NWSL_PROVIDERS);
const nwslPlayerPositionSchema = z.enum(NWSL_PLAYER_POSITIONS);
const nwslAvailabilityStatusSchema = z.enum(NWSL_AVAILABILITY_STATUSES);

/** Absolute-instant timestamp: requires an explicit offset or `Z`. */
const isoTimestampSchema = z.iso.datetime({
  offset: true,
  message: "must be an ISO 8601 timestamp with a UTC offset",
});

const slugSchema = z
  .string()
  .trim()
  .min(1, "slug is required")
  .regex(
    SLUG_PATTERN,
    "slug must be lowercase alphanumeric segments separated by single hyphens",
  );

/** A stable external id from the row's `source_provider`. Never empty. */
const stableProviderIdSchema = z
  .string()
  .trim()
  .min(1, "a stable provider id is required");

const sourceStampRowSchema = z.object({
  source_provider: nwslProviderSchema,
  source_fetched_at: isoTimestampSchema,
  source_season: z.string().trim().min(1, "source_season is required"),
  source_url: z.url().nullish(),
  is_fallback: z.boolean(),
});

function toSourceStamp(
  row: z.infer<typeof sourceStampRowSchema>,
): NwslSourceStamp {
  return {
    provider: row.source_provider,
    fetchedAt: row.source_fetched_at,
    sourceSeason: row.source_season,
    sourceUrl: row.source_url ?? undefined,
    isFallback: row.is_fallback,
  };
}

const nwslPlayerRowSchema = sourceStampRowSchema.extend({
  id: z.uuid(),
  provider_id: stableProviderIdSchema,
  slug: slugSchema,
  display_name: z.string().trim().min(1, "display_name is required"),
  team_id: z.uuid().nullable(),
  position: nwslPlayerPositionSchema,
  jersey_number: z.number().int().positive().nullable(),
  headshot_url: z.url().nullable(),
  availability: nwslAvailabilityStatusSchema,
  is_approximated: z.boolean(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

const nwslMatchRowSchema = sourceStampRowSchema.extend({
  id: z.uuid(),
  provider_id: stableProviderIdSchema,
  season: z.string().trim().min(1, "season is required"),
  kickoff_at: isoTimestampSchema,
  status: nwslMatchStatusSchema,
  home_team_id: z.uuid(),
  away_team_id: z.uuid(),
  home_score: z.number().int().nonnegative().nullable(),
  away_score: z.number().int().nonnegative().nullable(),
  venue: z.string().trim().min(1).nullable(),
  broadcast: z.record(z.string(), z.unknown()),
  is_approximated: z.boolean(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

/**
 * Parses a raw `nwsl_players` row into a validated `NwslPlayerRecord`.
 * Throws a `ZodError` if the row is missing a required field, has an
 * unrecognized `position`/`availability`, or fails slug/timestamp format
 * checks.
 */
export function parseNwslPlayerRow(row: unknown): NwslPlayerRecord {
  const parsed = nwslPlayerRowSchema.parse(row);
  return {
    id: parsed.id,
    providerId: parsed.provider_id,
    slug: parsed.slug,
    displayName: parsed.display_name,
    teamId: parsed.team_id,
    position: parsed.position,
    jerseyNumber: parsed.jersey_number,
    headshotUrl: parsed.headshot_url,
    availability: parsed.availability,
    isApproximated: parsed.is_approximated,
    source: toSourceStamp(parsed),
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}

/**
 * Parses a raw `nwsl_matches` row into a validated `NwslMatchRecord`.
 * Throws a `ZodError` if the row is missing a required field, has an
 * unrecognized `status`, or fails timestamp format checks. Unrecognized
 * status strings (e.g. a provider value this platform hasn't mapped yet)
 * are rejected rather than silently coerced.
 */
export function parseNwslMatchRow(row: unknown): NwslMatchRecord {
  const parsed = nwslMatchRowSchema.parse(row);
  return {
    id: parsed.id,
    providerId: parsed.provider_id,
    season: parsed.season,
    kickoffAt: parsed.kickoff_at,
    status: parsed.status,
    homeTeamId: parsed.home_team_id,
    awayTeamId: parsed.away_team_id,
    homeScore: parsed.home_score,
    awayScore: parsed.away_score,
    venue: parsed.venue,
    broadcast: parsed.broadcast,
    isApproximated: parsed.is_approximated,
    source: toSourceStamp(parsed),
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}
