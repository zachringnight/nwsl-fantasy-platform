import { NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const selectColumns =
  "id, player_id, player_name, match_id, original_points, corrected_points, reason, status, created_by, created_at";

export async function GET() {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({
      overrides: [],
      unavailable: "Scoring overrides are unavailable until Supabase is configured.",
    });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("fantasy_scoring_overrides")
    .select(selectColumns)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load scoring overrides." },
      { status: 500 }
    );
  }

  return NextResponse.json({ overrides: data ?? [] });
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Scoring overrides are unavailable until Supabase is configured." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    playerId?: string;
    playerName?: string;
    matchId?: string;
    correctedPoints?: number;
    reason?: string;
    createdBy?: string;
  };

  if (
    !body.playerId?.trim() ||
    !body.playerName?.trim() ||
    !body.matchId?.trim() ||
    !Number.isFinite(Number(body.correctedPoints)) ||
    !body.reason?.trim()
  ) {
    return NextResponse.json(
      { error: "Player, match, corrected points, and reason are required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data: snapshot, error: snapshotError } = await supabase
    .from("fantasy_point_snapshots")
    .select("points")
    .eq("player_id", body.playerId.trim())
    .eq("match_id", body.matchId.trim())
    .maybeSingle();

  if (snapshotError || !snapshot) {
    return NextResponse.json(
      { error: "No point snapshot exists for that player and match." },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("fantasy_scoring_overrides")
    .insert({
      player_id: body.playerId.trim(),
      player_name: body.playerName.trim(),
      match_id: body.matchId.trim(),
      original_points: Number(snapshot.points),
      corrected_points: Number(body.correctedPoints),
      reason: body.reason.trim(),
      created_by: body.createdBy?.trim() || null,
    })
    .select(selectColumns)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Unable to persist scoring override." },
      { status: 500 }
    );
  }

  return NextResponse.json({ override: data }, { status: 201 });
}
