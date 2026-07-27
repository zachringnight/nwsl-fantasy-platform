import "server-only";

import { unstable_cache } from "next/cache";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";
import {
  mapNwslPublicRows,
  validateNwslPublicRows,
  type LiveNwslPublicData,
  type NwslPublicRow,
  type NwslPublicRows,
} from "./nwsl-public-data-mapper";

const PAGE_SIZE = 1_000;

interface OrderField {
  field: string;
  ascending?: boolean;
}

async function fetchRunRows(
  table: string,
  runId: string,
  orderFields: OrderField[]
): Promise<NwslPublicRow[]> {
  const supabase = getSupabaseServerClient();
  const rows: NwslPublicRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("data_run_id", runId)
      .range(from, from + PAGE_SIZE - 1);

    for (const order of orderFields) {
      query = query.order(order.field, {
        ascending: order.ascending ?? true,
      });
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`${table}: ${error.code} ${error.message}`);
    }

    const page = (data ?? []) as NwslPublicRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadLiveNwslPublicData(): Promise<LiveNwslPublicData | null> {
  const supabase = getSupabaseServerClient();
  const { data: run, error: runError } = await supabase
    .from("nwsl_data_runs")
    .select("*")
    .eq("season", 2026)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    if (runError.code === "PGRST116") return null;
    throw new Error(
      `nwsl_data_runs: ${runError.code} ${runError.message}`
    );
  }
  if (!run) return null;

  const runId = String(run.id);
  const [
    teams,
    players,
    matches,
    playerSeasonStats,
    teamSeasonStats,
    playerMatchStats,
  ] = await Promise.all([
    fetchRunRows("nwsl_teams", runId, [{ field: "id" }]),
    fetchRunRows("nwsl_players", runId, [{ field: "id" }]),
    fetchRunRows("nwsl_matches", runId, [
      { field: "kickoff_at" },
      { field: "id" },
    ]),
    fetchRunRows("nwsl_player_season_stats", runId, [
      { field: "player_id" },
    ]),
    fetchRunRows("nwsl_team_season_stats", runId, [{ field: "team_id" }]),
    fetchRunRows("nwsl_player_match_stats", runId, [
      { field: "player_id" },
      { field: "match_id" },
    ]),
  ]);

  const rows: NwslPublicRows = {
    run: run as NwslPublicRow,
    teams,
    players,
    matches,
    playerSeasonStats,
    teamSeasonStats,
    playerMatchStats,
  };
  const issues = validateNwslPublicRows(rows);
  if (issues.length > 0) {
    throw new Error(
      `Rejected incomplete NWSL public-data run ${runId}: ${issues.join("; ")}`
    );
  }

  return mapNwslPublicRows(rows);
}

const getCachedLiveNwslPublicData = unstable_cache(
  loadLiveNwslPublicData,
  ["nwsl-public-data-v1", "2026"],
  {
    revalidate: 300,
    tags: ["nwsl-public-data"],
  }
);

export async function getLiveNwslPublicData(): Promise<LiveNwslPublicData | null> {
  if (!hasSupabaseServerConfig()) return null;

  try {
    return await getCachedLiveNwslPublicData();
  } catch (error) {
    console.error("Unable to load NWSL public data", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
