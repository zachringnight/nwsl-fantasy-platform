import "server-only";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const POLICY_ID = "nwsl-totals-open-over-v1";
const STALE_AFTER_MS = 30 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

export interface LiveModelSlateRow {
  matchId: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string | null;
  quoteTimestamp: string | null;
  line: number | null;
  overOdds: number | null;
  modelProbability: number | null;
  probabilityEdge: number | null;
  expectedValue: number | null;
  confidence: number | null;
  actionable: boolean;
  reason: string;
  stakePct: number;
}

export interface LiveModelPick {
  pickKey: string;
  matchId: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string;
  line: number;
  overOdds: number;
  expectedValue: number;
  confidence: number;
  stakePct: number;
  lockedAt: string;
  settlementStatus: "pending" | "settled";
  result: "pending" | "win" | "loss" | "push";
  pnlUnits: number | null;
}

export interface LiveModelBoard {
  runId: string;
  policyId: string;
  policyStatus: string;
  modelFamily: string;
  artifactVersion: string;
  runStatus: "success" | "no_bet";
  generatedAt: string;
  publishedAt: string;
  matchesInWindow: number;
  pricedMatches: number;
  actionablePicks: number;
  stakeCapBankrollPct: number;
  isStale: boolean;
  reasonCounts: Record<string, number>;
  sourceHealth: JsonRecord;
  forwardResults: JsonRecord;
  evidenceSummary: JsonRecord;
  slate: LiveModelSlateRow[];
  picks: LiveModelPick[];
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function reasonCounts(summary: unknown): Record<string, number> {
  const raw = recordValue(recordValue(summary).reason_counts);
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, numberValue(value)] as const)
      .filter(([, value]) => value > 0)
  );
}

export async function getLiveModelBoard(): Promise<LiveModelBoard | null> {
  if (!hasSupabaseServerConfig()) return null;

  const supabase = getSupabaseServerClient();
  const { data: run, error: runError } = await supabase
    .from("nwsl_model_runs")
    .select(
      "id,policy_id,policy_status,model_family,artifact_version,run_status,generated_at,published_at,matches_in_window,priced_matches,actionable_picks,stake_cap_bankroll_pct,summary,source_health,forward_results,evidence_summary"
    )
    .eq("policy_id", POLICY_ID)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !run) {
    if (runError) {
      console.error("Unable to load the latest NWSL model run", {
        code: runError.code,
        message: runError.message,
      });
    }
    return null;
  }

  const [slateResult, picksResult] = await Promise.all([
    supabase
      .from("nwsl_model_slate_rows")
      .select(
        "match_id,match_date,home_team,away_team,sportsbook,quote_timestamp,line,over_odds,model_probability,probability_edge,expected_value,confidence,actionable,reason,stake_pct"
      )
      .eq("run_id", run.id)
      .order("match_date", { ascending: true }),
    supabase
      .from("nwsl_model_picks")
      .select(
        "pick_key,match_id,match_date,home_team,away_team,sportsbook,line,over_odds,expected_value,confidence,stake_pct,locked_at,settlement_status,result,pnl_units"
      )
      .eq("policy_id", POLICY_ID)
      .order("match_date", { ascending: false })
      .limit(200),
  ]);

  if (slateResult.error || picksResult.error) {
    console.error("Unable to load the NWSL model board rows", {
      slateCode: slateResult.error?.code,
      picksCode: picksResult.error?.code,
    });
    return null;
  }

  const slate: LiveModelSlateRow[] = (slateResult.data ?? []).map((row) => ({
    matchId: String(row.match_id),
    matchDate: String(row.match_date),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    sportsbook: row.sportsbook ? String(row.sportsbook) : null,
    quoteTimestamp: row.quote_timestamp ? String(row.quote_timestamp) : null,
    line: nullableNumber(row.line),
    overOdds: nullableNumber(row.over_odds),
    modelProbability: nullableNumber(row.model_probability),
    probabilityEdge: nullableNumber(row.probability_edge),
    expectedValue: nullableNumber(row.expected_value),
    confidence: nullableNumber(row.confidence),
    actionable: Boolean(row.actionable),
    reason: String(row.reason),
    stakePct: numberValue(row.stake_pct),
  }));
  const picks: LiveModelPick[] = (picksResult.data ?? []).map((row) => ({
    pickKey: String(row.pick_key),
    matchId: String(row.match_id),
    matchDate: String(row.match_date),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    sportsbook: String(row.sportsbook),
    line: numberValue(row.line),
    overOdds: numberValue(row.over_odds),
    expectedValue: numberValue(row.expected_value),
    confidence: numberValue(row.confidence),
    stakePct: numberValue(row.stake_pct),
    lockedAt: String(row.locked_at),
    settlementStatus: row.settlement_status as "pending" | "settled",
    result: row.result as "pending" | "win" | "loss" | "push",
    pnlUnits: nullableNumber(row.pnl_units),
  }));

  const generatedAt = String(run.generated_at);
  return {
    runId: String(run.id),
    policyId: String(run.policy_id),
    policyStatus: String(run.policy_status),
    modelFamily: String(run.model_family),
    artifactVersion: String(run.artifact_version),
    runStatus: run.run_status as "success" | "no_bet",
    generatedAt,
    publishedAt: String(run.published_at),
    matchesInWindow: numberValue(run.matches_in_window),
    pricedMatches: numberValue(run.priced_matches),
    actionablePicks: numberValue(run.actionable_picks),
    stakeCapBankrollPct: numberValue(run.stake_cap_bankroll_pct, 0.25),
    isStale:
      !Number.isFinite(Date.parse(generatedAt)) ||
      Date.now() - Date.parse(generatedAt) > STALE_AFTER_MS,
    reasonCounts: reasonCounts(run.summary),
    sourceHealth: recordValue(run.source_health),
    forwardResults: recordValue(run.forward_results),
    evidenceSummary: recordValue(run.evidence_summary),
    slate,
    picks,
  };
}
