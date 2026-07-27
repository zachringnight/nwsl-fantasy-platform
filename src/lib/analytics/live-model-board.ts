import "server-only";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const POLICY_ID = "nwsl-totals-open-over-v1";
const STALE_AFTER_MS = 30 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

export interface LiveModelSlateRow {
  officialMatchId: string;
  matchId: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string | null;
  quoteTimestamp: string | null;
  line: number | null;
  overOdds: number | null;
  underOdds: number | null;
  modelProbability: number | null;
  marketNoVigProbability: number | null;
  probabilityEdge: number | null;
  expectedValue: number | null;
  confidence: number | null;
  quoteAgeMinutes: number | null;
  quoteIsFresh: boolean | null;
  firstSeenContractOk: boolean | null;
  actionable: boolean;
  reason: string;
  stakePct: number;
}

export interface LiveModelPick {
  pickKey: string;
  officialMatchId: string;
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

export interface LiveMatchOdds {
  officialMatchId: string;
  matchId: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string;
  quoteTimestamp: string;
  marketType: "1x2" | "total";
  line: number | null;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  overOdds: number | null;
  underOdds: number | null;
  sourceType: "current" | "live";
  quoteAgeMinutes: number;
  isFresh: boolean;
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
  odds: LiveMatchOdds[];
}

export interface ArchivedPrematchModelMarket {
  runId: string;
  modelRow?: LiveModelSlateRow;
  odds: LiveMatchOdds[];
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

function mapSlateRow(row: Record<string, unknown>): LiveModelSlateRow {
  return {
    officialMatchId: String(row.official_match_id),
    matchId: String(row.match_id),
    matchDate: String(row.match_date),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    sportsbook: row.sportsbook ? String(row.sportsbook) : null,
    quoteTimestamp: row.quote_timestamp ? String(row.quote_timestamp) : null,
    line: nullableNumber(row.line),
    overOdds: nullableNumber(row.over_odds),
    underOdds: nullableNumber(row.under_odds),
    modelProbability: nullableNumber(row.model_probability),
    marketNoVigProbability: nullableNumber(row.market_no_vig_probability),
    probabilityEdge: nullableNumber(row.probability_edge),
    expectedValue: nullableNumber(row.expected_value),
    confidence: nullableNumber(row.confidence),
    quoteAgeMinutes: nullableNumber(row.quote_age_minutes),
    quoteIsFresh:
      row.quote_is_fresh === null ? null : Boolean(row.quote_is_fresh),
    firstSeenContractOk:
      row.first_seen_contract_ok === null
        ? null
        : Boolean(row.first_seen_contract_ok),
    actionable: Boolean(row.actionable),
    reason: String(row.reason),
    stakePct: numberValue(row.stake_pct),
  };
}

function mapOddsRow(row: Record<string, unknown>): LiveMatchOdds {
  return {
    officialMatchId: String(row.official_match_id),
    matchId: String(row.match_id),
    matchDate: String(row.match_date),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    sportsbook: String(row.sportsbook),
    quoteTimestamp: String(row.quote_timestamp),
    marketType: row.market_type as "1x2" | "total",
    line: nullableNumber(row.line),
    homeOdds: nullableNumber(row.home_odds),
    drawOdds: nullableNumber(row.draw_odds),
    awayOdds: nullableNumber(row.away_odds),
    overOdds: nullableNumber(row.over_odds),
    underOdds: nullableNumber(row.under_odds),
    sourceType: row.source_type as "current" | "live",
    quoteAgeMinutes: numberValue(row.quote_age_minutes),
    isFresh: Boolean(row.is_fresh),
  };
}

export async function getArchivedPrematchModelMarket({
  matchId,
  officialMatchId,
}: {
  matchId: string;
  officialMatchId?: string;
}): Promise<ArchivedPrematchModelMarket | null> {
  if (!hasSupabaseServerConfig()) return null;

  const supabase = getSupabaseServerClient();
  const lookupValues: Array<{
    column: "official_match_id" | "match_id";
    value: string;
  }> = [
    ...(officialMatchId
      ? [{ column: "official_match_id" as const, value: officialMatchId }]
      : []),
    { column: "match_id", value: matchId },
  ];

  for (const lookup of lookupValues) {
    const latestResult = await supabase
      .from("nwsl_model_odds_snapshots")
      .select("run_id")
      .eq(lookup.column, lookup.value)
      .eq("source_type", "current")
      .order("quote_timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResult.error) {
      console.error("Unable to locate archived NWSL prematch odds", {
        code: latestResult.error.code,
        message: latestResult.error.message,
      });
      return null;
    }
    if (!latestResult.data) continue;

    const runId = String(latestResult.data.run_id);
    const [oddsResult, slateResult] = await Promise.all([
      supabase
        .from("nwsl_model_odds_snapshots")
        .select(
          "official_match_id,match_id,match_date,home_team,away_team,sportsbook,quote_timestamp,market_type,line,home_odds,draw_odds,away_odds,over_odds,under_odds,source_type,quote_age_minutes,is_fresh"
        )
        .eq("run_id", runId)
        .eq(lookup.column, lookup.value)
        .eq("source_type", "current")
        .order("sportsbook", { ascending: true })
        .order("market_type", { ascending: true })
        .order("line", { ascending: true }),
      supabase
        .from("nwsl_model_slate_rows")
        .select(
          "official_match_id,match_id,match_date,home_team,away_team,sportsbook,quote_timestamp,line,over_odds,under_odds,model_probability,market_no_vig_probability,probability_edge,expected_value,confidence,quote_age_minutes,quote_is_fresh,first_seen_contract_ok,actionable,reason,stake_pct"
        )
        .eq("run_id", runId)
        .eq(lookup.column, lookup.value)
        .limit(1)
        .maybeSingle(),
    ]);
    if (oddsResult.error || slateResult.error) {
      console.error("Unable to load archived NWSL prematch odds", {
        oddsCode: oddsResult.error?.code,
        slateCode: slateResult.error?.code,
      });
      return null;
    }

    return {
      runId,
      modelRow: slateResult.data
        ? mapSlateRow(slateResult.data as Record<string, unknown>)
        : undefined,
      odds: (oddsResult.data ?? []).map((row) =>
        mapOddsRow(row as Record<string, unknown>)
      ),
    };
  }

  return null;
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

  const [slateResult, picksResult, oddsResult] = await Promise.all([
    supabase
      .from("nwsl_model_slate_rows")
      .select(
        "official_match_id,match_id,match_date,home_team,away_team,sportsbook,quote_timestamp,line,over_odds,under_odds,model_probability,market_no_vig_probability,probability_edge,expected_value,confidence,quote_age_minutes,quote_is_fresh,first_seen_contract_ok,actionable,reason,stake_pct"
      )
      .eq("run_id", run.id)
      .order("match_date", { ascending: true }),
    supabase
      .from("nwsl_model_picks")
      .select(
        "pick_key,official_match_id,match_id,match_date,home_team,away_team,sportsbook,line,over_odds,expected_value,confidence,stake_pct,locked_at,settlement_status,result,pnl_units"
      )
      .eq("policy_id", POLICY_ID)
      .order("match_date", { ascending: false })
      .limit(200),
    supabase
      .from("nwsl_model_odds_snapshots")
      .select(
        "official_match_id,match_id,match_date,home_team,away_team,sportsbook,quote_timestamp,market_type,line,home_odds,draw_odds,away_odds,over_odds,under_odds,source_type,quote_age_minutes,is_fresh"
      )
      .eq("run_id", run.id)
      .order("match_date", { ascending: true })
      .order("sportsbook", { ascending: true }),
  ]);

  if (slateResult.error || picksResult.error || oddsResult.error) {
    console.error("Unable to load the NWSL model board rows", {
      slateCode: slateResult.error?.code,
      picksCode: picksResult.error?.code,
      oddsCode: oddsResult.error?.code,
    });
    return null;
  }

  const slate: LiveModelSlateRow[] = (slateResult.data ?? []).map((row) =>
    mapSlateRow(row as Record<string, unknown>)
  );
  const picks: LiveModelPick[] = (picksResult.data ?? []).map((row) => ({
    pickKey: String(row.pick_key),
    officialMatchId: String(row.official_match_id),
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
  const odds: LiveMatchOdds[] = (oddsResult.data ?? []).map((row) =>
    mapOddsRow(row as Record<string, unknown>)
  );

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
    odds,
  };
}
