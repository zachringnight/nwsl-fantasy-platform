import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeFantasyLeagueCode } from "@/lib/fantasy-league-inputs";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const joinLeagueSchema = z.object({
  code: z.string(),
});

function getBearerToken(request: NextRequest) {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("Sign in before joining a league.");
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  try {
    const payload = joinLeagueSchema.parse(await request.json());
    const code = normalizeFantasyLeagueCode(payload.code);
    const supabase = getSupabaseServerClient();
    const accessToken = getBearerToken(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user || user.is_anonymous) {
      throw userError ?? new Error("Sign in before joining a league.");
    }

    const { data: profile, error: profileError } = await supabase
      .from("fantasy_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.display_name) {
      throw new Error("Create a hosted profile before joining a league.");
    }

    const { data: league, error: leagueError } = await supabase
      .from("fantasy_leagues")
      .select("id, code, manager_count_target")
      .eq("code", code)
      .maybeSingle();

    if (leagueError) {
      throw leagueError;
    }

    if (!league) {
      throw new Error("That league code does not exist.");
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("fantasy_league_memberships")
      .select("user_id")
      .eq("league_id", league.id);

    if (membershipsError) {
      throw membershipsError;
    }

    if ((memberships ?? []).some((membership) => membership.user_id === user.id)) {
      return NextResponse.json({
        code: league.code,
        id: league.id,
      });
    }

    if ((memberships ?? []).length >= league.manager_count_target) {
      throw new Error("That league is already full.");
    }

    const { error: insertError } = await supabase
      .from("fantasy_league_memberships")
      .insert({
        display_name: profile.display_name,
        league_id: league.id,
        role: "manager",
        team_name: `${profile.display_name} FC`,
        user_id: user.id,
      });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      code: league.code,
      id: league.id,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Enter the 6-character league code."
        : error instanceof Error
          ? error.message
          : "Unable to join that league.";

    const status =
      message === "Sign in before joining a league."
        ? 401
        : message === "That league code does not exist."
          ? 404
          : message === "That league is already full."
            ? 409
            : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
