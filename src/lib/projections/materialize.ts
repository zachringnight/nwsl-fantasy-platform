import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import {
  getPredictiveHubData,
  type MatchupPreviewRecord,
  type PlayerProjectionRecord,
} from "@/lib/analytics/predictive";
import { getFantasyPlayerPool } from "@/lib/fantasy-player-pool";
import { getFantasyTargetSlate } from "@/lib/fantasy-slate-engine";
import {
  classifyProjectionQuality,
  fantasyProjectionSchemas,
  scaleProjectionValue,
  scoreProjectedPlayer,
  type FantasyProjectionSchemaKey,
} from "@/lib/projections/scoring";
import type {
  FantasyProjectionMaterializedPlayer,
  FantasyProjectionSlateResponse,
  MaterializedMatchProjection,
  ProjectionEngineMetadata,
} from "@/lib/projections/types";
import type { FantasyGameVariant } from "@/types/fantasy";

const MODEL_ARTIFACT_ROOT = path.join(
  process.cwd(),
  "nwsl-model",
  "data",
  "processed",
  "models"
);

const BASELINE_MODEL_FAMILIES = [
  "home_field_baseline",
  "rolling_npxg_poisson",
  "team_ratings_poisson",
  "uniform_baseline",
] as const;

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(targetPath: string) {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  const payload = await fs.readFile(targetPath, "utf8");
  return JSON.parse(payload) as T;
}

async function resolveProjectionEngineMetadata(): Promise<ProjectionEngineMetadata> {
  const registry = await readJsonIfExists<{
    aliases?: Record<
      string,
      {
        version: string;
        model_family: string;
        gating_status?: string;
      }
    >;
  }>(path.join(MODEL_ARTIFACT_ROOT, "champions.json"));
  const championPure = registry?.aliases?.champion_pure;

  if (championPure) {
    const evaluationSummary = await readJsonIfExists<{
      models?: Record<
        string,
        {
          posthoc_calibration?: {
            available?: boolean;
          };
        }
      >;
    }>(
      path.join(
        MODEL_ARTIFACT_ROOT,
        championPure.version,
        "evaluation_summary.json"
      )
    );

    return {
      requestedModel: "champion_pure",
      resolvedMode: "promoted",
      modelVersion: championPure.version,
      modelFamily: championPure.model_family,
      gatingStatus: championPure.gating_status ?? "passed",
      calibrationApplied: Boolean(
        evaluationSummary?.models?.[championPure.model_family]?.posthoc_calibration
          ?.available
      ),
      notes: ["Serving the promoted pure projection engine."],
    };
  }

  const versionEntries = await fs
    .readdir(MODEL_ARTIFACT_ROOT, { withFileTypes: true })
    .catch(() => []);
  const latestVersion = versionEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1);

  if (!latestVersion) {
    return {
      requestedModel: "champion_pure",
      resolvedMode: "app_fallback",
      modelVersion: "site_predictive_v1",
      modelFamily: "app_predictive_heuristic",
      gatingStatus: "app_fallback",
      calibrationApplied: false,
      notes: ["No nwsl-model artifacts were found. Falling back to the app projection kernel."],
    };
  }

  const backtestSummary = await readJsonIfExists<{
    models?: Record<
      string,
      {
        log_loss_1x2?: number;
      }
    >;
  }>(path.join(MODEL_ARTIFACT_ROOT, latestVersion, "backtest_summary.json"));

  let fallbackFamily = "home_field_baseline";
  let bestLogLoss = Number.POSITIVE_INFINITY;
  BASELINE_MODEL_FAMILIES.forEach((family) => {
    const value = backtestSummary?.models?.[family]?.log_loss_1x2;
    if (typeof value === "number" && Number.isFinite(value) && value < bestLogLoss) {
      fallbackFamily = family;
      bestLogLoss = value;
    }
  });

  return {
    requestedModel: "champion_pure",
    resolvedMode: "baseline_fallback",
    modelVersion: latestVersion,
    modelFamily: fallbackFamily,
    gatingStatus: "baseline_fallback",
    calibrationApplied: false,
    notes: [
      "No promoted pure model passed gates.",
      `Using ${fallbackFamily} as the approved non-market fallback.`,
    ],
  };
}

function buildMaterializedPlayer(
  player: PlayerProjectionRecord,
  schemaKey: FantasyProjectionSchemaKey,
  model: ProjectionEngineMetadata,
  matchKey: string | null
): FantasyProjectionMaterializedPlayer {
  const schema = fantasyProjectionSchemas[schemaKey];
  const score = scoreProjectedPlayer(player, schemaKey);
  const projectedPoints = round(score.total, 1);
  const quality = classifyProjectionQuality(player.confidence);

  return {
    id: player.id,
    official_player_id: player.officialPlayerId,
    display_name: player.player,
    club_name: player.team,
    position: player.position,
    average_points: projectedPoints,
    projected_points: projectedPoints,
    baseline_points: scaleProjectionValue(
      player.baselineProjection,
      player.projection,
      projectedPoints
    ),
    floor_points: scaleProjectionValue(player.floor, player.projection, projectedPoints),
    ceiling_points: scaleProjectionValue(
      player.ceiling,
      player.projection,
      projectedPoints
    ),
    salary_cost: player.salary,
    availability: player.availability,
    rank: player.rank,
    projection_confidence: round(player.confidence, 3),
    projection_quality: quality,
    projection_schema: schema.key,
    projection_schema_label: schema.label,
    model_version: model.modelVersion,
    model_family: model.modelFamily,
    gating_status: model.gatingStatus,
    calibration_applied: model.calibrationApplied,
    fixture_id: matchKey,
    slate_key: player.matchDate?.slice(0, 10) ?? null,
    opponent: player.opponent,
    venue: player.venue,
    expected_minutes: round(player.expectedMinutes, 1),
    starter_probability: round(player.starterProbability, 3),
    lineup_status: player.lineupStatus,
    lineup_note: player.lineupNote,
    stat_projection: player.statProjection,
    fantasy_breakdown: score.breakdown,
    schema_key: schema.key,
    schema_label: schema.label,
    match_key: matchKey,
  };
}

function rankPlayers(players: FantasyProjectionMaterializedPlayer[]) {
  return [...players]
    .sort((left, right) => {
      const projectionDelta =
        (right.projected_points ?? right.average_points) -
        (left.projected_points ?? left.average_points);
      if (projectionDelta !== 0) {
        return projectionDelta;
      }

      return left.salary_cost - right.salary_cost;
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));
}

function filterPlayersForSlate(
  players: PlayerProjectionRecord[],
  slateKeys: Set<string>
) {
  return players.filter((player) => {
    const slateKey = player.matchDate?.slice(0, 10);
    return Boolean(slateKey && slateKeys.has(slateKey));
  });
}

function filterMatchupsForSlate(
  matchups: MatchupPreviewRecord[],
  slateKeys: Set<string>
) {
  return matchups.filter((matchup) => {
    const slateKey = matchup.matchDate.slice(0, 10);
    return slateKeys.has(slateKey);
  });
}

function buildFixtureLookup(matchups: MatchupPreviewRecord[]) {
  const fixtureLookup = new Map<string, string>();

  matchups.forEach((matchup) => {
    const slateKey = matchup.matchDate.slice(0, 10);
    fixtureLookup.set(
      [matchup.homeCanonicalTeam, matchup.awayCanonicalTeam, slateKey].join("::"),
      matchup.matchKey
    );
    fixtureLookup.set(
      [matchup.awayCanonicalTeam, matchup.homeCanonicalTeam, slateKey].join("::"),
      matchup.matchKey
    );
  });

  return fixtureLookup;
}

export const getMaterializedFantasyProjectionSlate = cache(
  async (
    schemaKey: FantasyProjectionSchemaKey = "site_launch_v1",
    variant: FantasyGameVariant = "salary_cap_daily",
    requestedSlateKey?: string
  ): Promise<FantasyProjectionSlateResponse> => {
    const schema = fantasyProjectionSchemas[schemaKey];
    const data = await getPredictiveHubData();
    const model = await resolveProjectionEngineMetadata();
    const slate = getFantasyTargetSlate(variant, requestedSlateKey);
    const slateKeySet = new Set(slate.slate_keys);
    const slateMatchups = filterMatchupsForSlate(data.predictive.matchups, slateKeySet);
    const fixtureLookup = buildFixtureLookup(slateMatchups);
    const slatePlayers = filterPlayersForSlate(
      data.predictive.playerBoard,
      slateKeySet
    );
    const bootstrapById = new Map(
      getFantasyPlayerPool().map((player) => [player.id, player] as const)
    );
    const rankedPlayers = rankPlayers(
      slatePlayers.map((player) => {
        const slateKey = player.matchDate?.slice(0, 10) ?? "";
        const matchKey =
          fixtureLookup.get(
            [player.canonicalTeam, player.opponentCanonicalTeam, slateKey].join("::")
          ) ?? null;
        const materialized = buildMaterializedPlayer(
          player,
          schemaKey,
          model,
          matchKey
        );
        const bootstrap = bootstrapById.get(player.id);

        return bootstrap
          ? {
              ...bootstrap,
              ...materialized,
            }
          : {
              ...materialized,
            };
      })
    );
    const playersById = new Map(rankedPlayers.map((player) => [player.id, player]));

    const matches = slateMatchups.map(
      (matchup): MaterializedMatchProjection => ({
        ...matchup,
        homeTargets: matchup.homeTargets
          .map((player) => playersById.get(player.id) ?? null)
          .filter(
            (player): player is FantasyProjectionMaterializedPlayer => player != null
          ),
        awayTargets: matchup.awayTargets
          .map((player) => playersById.get(player.id) ?? null)
          .filter(
            (player): player is FantasyProjectionMaterializedPlayer => player != null
          ),
      })
    );

    return {
      generatedAt: data.predictive.generatedAt,
      schemaKey: schema.key,
      schemaLabel: schema.label,
      slate,
      model,
      matches,
      players: rankedPlayers,
    };
  }
);
