import type {
  MatchupPreviewRecord,
  ProjectedPlayerStats,
} from "@/lib/analytics/predictive";
import type { FantasySlateWindow, FantasyPoolPlayer } from "@/types/fantasy";
import type { FantasyProjectionSchemaKey } from "@/lib/projections/scoring";

export interface ProjectionEngineMetadata {
  requestedModel: string;
  resolvedMode: "promoted" | "baseline_fallback" | "app_fallback";
  modelVersion: string;
  modelFamily: string;
  gatingStatus: string;
  calibrationApplied: boolean;
  notes: string[];
}

export interface FantasyProjectionMaterializedPlayer extends FantasyPoolPlayer {
  official_player_id: string;
  schema_key: FantasyProjectionSchemaKey;
  schema_label: string;
  stat_projection: ProjectedPlayerStats;
  fantasy_breakdown: Record<string, number>;
  match_key: string | null;
}

export type MaterializedMatchProjection = Omit<
  MatchupPreviewRecord,
  "homeTargets" | "awayTargets"
> & {
  homeTargets: FantasyProjectionMaterializedPlayer[];
  awayTargets: FantasyProjectionMaterializedPlayer[];
};

export interface FantasyProjectionSlateResponse {
  generatedAt: string;
  schemaKey: FantasyProjectionSchemaKey;
  schemaLabel: string;
  slate: FantasySlateWindow;
  model: ProjectionEngineMetadata;
  matches: MaterializedMatchProjection[];
  players: FantasyProjectionMaterializedPlayer[];
}
