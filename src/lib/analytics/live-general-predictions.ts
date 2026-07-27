import "server-only";
import type { MatchPrediction } from "@/types/analytics";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const STALE_AFTER_MS = 30 * 60 * 60 * 1000;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function scoreMatrix(lambdaHome: number, lambdaAway: number): number[][] {
  const matrix: number[][] = [];
  let total = 0;
  for (let home = 0; home < 9; home += 1) {
    matrix[home] = [];
    for (let away = 0; away < 9; away += 1) {
      const homeProbability =
        (Math.exp(-lambdaHome) * lambdaHome ** home) / factorial(home);
      const awayProbability =
        (Math.exp(-lambdaAway) * lambdaAway ** away) / factorial(away);
      matrix[home][away] = homeProbability * awayProbability;
      total += matrix[home][away];
    }
  }
  return matrix.map((row) =>
    row.map((probability) => Math.round((probability / total) * 10_000) / 10_000)
  );
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function probabilityRecord(
  value: unknown
): Record<string, { over: number; under: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([line, raw]) => {
        const row =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        return [
          line,
          {
            over: numberValue(row.over),
            under: numberValue(row.under),
          },
        ] as const;
      })
      .filter(([, row]) => row.over >= 0 && row.under >= 0)
  );
}

function handicapRecord(
  value: unknown
): Record<string, { home: number; away: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([line, raw]) => {
      const row =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return [
        line,
        {
          home: numberValue(row.home),
          away: numberValue(row.away),
        },
      ] as const;
    })
  );
}

export async function getLiveGeneralPredictions(): Promise<
  MatchPrediction[] | null
> {
  if (!hasSupabaseServerConfig()) return null;

  const supabase = getSupabaseServerClient();
  const { data: run, error: runError } = await supabase
    .from("nwsl_prediction_runs")
    .select(
      "id,model_version,model_family,training_cutoff,source_manifest_generated_at,generated_at,gating_status,feature_status,row_count"
    )
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError || !run) {
    if (runError) {
      console.error("Unable to load general NWSL prediction lineage", {
        code: runError.code,
        message: runError.message,
      });
    }
    return null;
  }

  const { data: rows, error: rowsError } = await supabase
    .from("nwsl_match_predictions")
    .select(
      "match_id,match_date,match_status,home_team,away_team,home_probability,draw_probability,away_probability,lambda_home,lambda_away,btts_yes_probability,over_under,asian_handicap"
    )
    .eq("run_id", run.id)
    .eq("match_status", "upcoming")
    .order("match_date", { ascending: true })
    .order("match_id", { ascending: true });
  if (rowsError || !rows || rows.length !== Number(run.row_count)) {
    if (rowsError) {
      console.error("Unable to load general NWSL prediction rows", {
        code: rowsError.code,
        message: rowsError.message,
      });
    }
    return null;
  }

  const generatedAt = String(run.generated_at);
  const generatedTime = Date.parse(generatedAt);
  const isStale =
    !Number.isFinite(generatedTime) ||
    Date.now() - generatedTime > STALE_AFTER_MS;

  return rows.map((row) => {
    const lambdaHome = numberValue(row.lambda_home);
    const lambdaAway = numberValue(row.lambda_away);
    const homeTeam = String(row.home_team);
    const awayTeam = String(row.away_team);
    return {
      matchId: String(row.match_id),
      date: String(row.match_date),
      homeTeam,
      homeTeamId: slugify(homeTeam),
      awayTeam,
      awayTeamId: slugify(awayTeam),
      homeProb: numberValue(row.home_probability),
      drawProb: numberValue(row.draw_probability),
      awayProb: numberValue(row.away_probability),
      bttsYesProb: numberValue(row.btts_yes_probability),
      overUnder: probabilityRecord(row.over_under),
      asianHandicap: handicapRecord(row.asian_handicap),
      lambdaHome,
      lambdaAway,
      scoreMatrix: scoreMatrix(lambdaHome, lambdaAway),
      model: String(run.model_family),
      timestamp: generatedAt,
      modelVersion: String(run.model_version),
      modelFamily: String(run.model_family),
      trainingCutoff: String(run.training_cutoff),
      sourceManifestGeneratedAt: String(run.source_manifest_generated_at),
      gatingStatus: run.gating_status as "current" | "degraded_context",
      featureStatus: run.feature_status as "complete" | "partial",
      dataSource: "supabase",
      isStale,
    };
  });
}
