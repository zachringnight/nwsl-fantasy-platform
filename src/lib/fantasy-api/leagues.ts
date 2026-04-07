"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getFantasyLeagueModeFields,
} from "@/lib/fantasy-modes";
import {
  getFantasyDefaultLockAt,
} from "@/lib/fantasy-slate-engine";
import type {
  FantasyExperienceLevel,
  FantasyGameVariant,
  FantasyLeagueDetails,
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyLeagueSummary,
  FantasyProfile,
} from "@/types/fantasy";
import {
  assertErrorMessage,
  createLeagueCode,
  requireUser,
} from "./shared";

export async function ensureHostedSession() {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(assertErrorMessage(error, "Unable to start a hosted session."));
  }

  return data.user;
}

export async function fetchCurrentProfile() {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session?.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("fantasy_profiles")
    .select("user_id, email, display_name, favorite_club, experience_level, onboarding_complete, created_at, updated_at")
    .eq("user_id", sessionData.session.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load the current profile."));
  }

  return data as FantasyProfile | null;
}

export async function upsertFantasyProfile(input: {
  displayName: string;
  favoriteClub?: string;
  experienceLevel?: FantasyExperienceLevel;
  onboardingComplete: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const normalizedEmail = user.email?.trim() ? user.email : null;
  const payload = {
    user_id: user.id,
    email: normalizedEmail,
    display_name: input.displayName.trim(),
    favorite_club: input.favoriteClub?.trim() || null,
    experience_level: input.experienceLevel ?? null,
    onboarding_complete: input.onboardingComplete,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("fantasy_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, email, display_name, favorite_club, experience_level, onboarding_complete, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to save the hosted profile."));
  }

  return data as FantasyProfile;
}

export async function loadMyLeagues(options?: { limit?: number; offset?: number }) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const { data, error } = await supabase
    .from("fantasy_league_memberships")
    .select(`
      role,
      league:fantasy_leagues!inner (
        id,
        name,
        code,
        privacy,
        status,
        game_variant,
        roster_build_mode,
        player_ownership_mode,
        contest_horizon,
        salary_cap_amount,
        manager_count_target,
        draft_at,
        commissioner_user_id
      )
    `)
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load your leagues."));
  }

  const rawMemberships = (data ?? []).map((membership) => {
    const leagueRecord = Array.isArray(membership.league)
      ? membership.league[0]
      : membership.league;

    return {
      league: leagueRecord as FantasyLeagueRecord,
      membershipRole: membership.role as "commissioner" | "manager",
    };
  });

  const leagueIds = rawMemberships.map((membership) => membership.league.id);

  if (leagueIds.length === 0) {
    return [] satisfies FantasyLeagueSummary[];
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("fantasy_league_memberships")
    .select("league_id")
    .in("league_id", leagueIds);

  if (memberError) {
    throw new Error(assertErrorMessage(memberError, "Unable to count league members."));
  }

  const memberCountMap = (memberRows ?? []).reduce<Record<string, number>>((accumulator, row) => {
    const leagueId = row.league_id as string;
    accumulator[leagueId] = (accumulator[leagueId] ?? 0) + 1;
    return accumulator;
  }, {});

  return rawMemberships.map((membership) => ({
    league: membership.league,
    memberCount: memberCountMap[membership.league.id] ?? 1,
    membershipRole: membership.membershipRole,
  }));
}

export async function loadLeagueById(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const { data: league, error: leagueError } = await supabase
    .from("fantasy_leagues")
    .select("id, name, code, privacy, status, game_variant, roster_build_mode, player_ownership_mode, contest_horizon, salary_cap_amount, manager_count_target, draft_at, commissioner_user_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) {
    throw new Error(assertErrorMessage(leagueError, "Unable to load that league."));
  }

  if (!league) {
    return null;
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("fantasy_league_memberships")
    .select("id, league_id, user_id, role, display_name, team_name, joined_at, draft_slot, waiver_priority")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });

  if (membershipsError) {
    throw new Error(assertErrorMessage(membershipsError, "Unable to load league members."));
  }

  const typedMemberships = (memberships ?? []) as FantasyLeagueMembershipRecord[];

  return {
    currentMembership:
      typedMemberships.find((membership) => membership.user_id === user.id) ?? null,
    league: league as FantasyLeagueRecord,
    memberships: typedMemberships,
  } satisfies FantasyLeagueDetails;
}

export async function createHostedLeague(input: {
  draftAt?: string;
  gameVariant: FantasyGameVariant;
  managerCountTarget: number;
  name: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const profile = await fetchCurrentProfile();
  const modeFields = getFantasyLeagueModeFields(input.gameVariant);

  if (!profile) {
    throw new Error("Create a hosted profile before creating a league.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createLeagueCode();
    const scheduledAt = modeFields.roster_build_mode === "salary_cap"
      ? getFantasyDefaultLockAt(input.gameVariant)
      : input.draftAt
        ? new Date(input.draftAt).toISOString()
        : null;

    if (!scheduledAt) {
      throw new Error("Choose a draft date and time for this classic league.");
    }

    const { data: league, error: leagueError } = await supabase
      .from("fantasy_leagues")
      .insert({
        code,
        commissioner_user_id: user.id,
        contest_horizon: modeFields.contest_horizon,
        draft_at: scheduledAt,
        game_variant: input.gameVariant,
        manager_count_target: input.managerCountTarget,
        name: input.name.trim(),
        player_ownership_mode: modeFields.player_ownership_mode,
        roster_build_mode: modeFields.roster_build_mode,
        salary_cap_amount: modeFields.salary_cap_amount,
        updated_at: new Date().toISOString(),
      })
      .select("id, code")
      .single();

    if (leagueError) {
      if (leagueError.code === "23505") {
        continue;
      }

      throw new Error(assertErrorMessage(leagueError, "Unable to create that league."));
    }

    const { error: membershipError } = await supabase
      .from("fantasy_league_memberships")
      .insert({
        display_name: profile.display_name,
        league_id: league.id,
        role: "commissioner",
        team_name: `${profile.display_name} FC`,
        user_id: user.id,
      });

    if (membershipError) {
      await supabase.from("fantasy_leagues").delete().eq("id", league.id);
      throw new Error(assertErrorMessage(membershipError, "Unable to add the commissioner to the league."));
    }

    return {
      code: league.code as string,
      id: league.id as string,
    };
  }

  throw new Error("Unable to generate a unique league code.");
}

export async function updateLeagueSettings(
  leagueId: string,
  updates: { name?: string; draftAt?: string; managerCountTarget?: number }
) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();

  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("commissioner_user_id")
    .eq("id", leagueId)
    .single();

  if (!league || league.commissioner_user_id !== user.id) {
    throw new Error("Only the commissioner can update league settings.");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.draftAt !== undefined) patch.draft_at = new Date(updates.draftAt).toISOString();
  if (updates.managerCountTarget !== undefined) patch.manager_count_target = updates.managerCountTarget;

  const { error } = await supabase
    .from("fantasy_leagues")
    .update(patch)
    .eq("id", leagueId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to save league settings."));
  }
}

export async function loadLeaguePlayerListings(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { league, memberships } = await (await import("./shared")).fetchLeagueContext(leagueId);
  const { getFantasyPlayerPool } = await import("@/lib/fantasy-player-pool");
  const draftedByPlayerId = new Map<
    string,
    { displayName: string | null; userId: string | null }
  >();

  if (league.player_ownership_mode === "exclusive") {
    const { data: rosterRows, error: rosterError } = await supabase
      .from("fantasy_roster_slots")
      .select("player_id, user_id")
      .eq("league_id", leagueId);

    if (rosterError) {
      throw new Error(
        assertErrorMessage(rosterError, "Unable to load league player ownership.")
      );
    }

    const displayNameByUserId = new Map(
      memberships.map((membership) => [membership.user_id, membership.display_name])
    );

    (rosterRows ?? []).forEach((row) => {
      draftedByPlayerId.set(row.player_id as string, {
        displayName: displayNameByUserId.get(row.user_id as string) ?? null,
        userId: (row.user_id as string) ?? null,
      });
    });
  }

  return {
    league,
    players: getFantasyPlayerPool().map((player) => {
      const draftedBy = draftedByPlayerId.get(player.id);

      return {
        player,
        ownership_status: draftedBy
          ? "drafted"
          : league.player_ownership_mode === "shared"
            ? "shared_pool"
            : "available",
        rostered_by_display_name: draftedBy?.displayName ?? null,
        rostered_by_user_id: draftedBy?.userId ?? null,
      } satisfies import("@/types/fantasy").FantasyLeaguePlayerListing;
    }),
  };
}

export async function removeLeagueMember(leagueId: string, membershipId: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();

  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("commissioner_user_id")
    .eq("id", leagueId)
    .single();

  if (!league || league.commissioner_user_id !== user.id) {
    throw new Error("Only the commissioner can remove members.");
  }

  const { error } = await supabase
    .from("fantasy_league_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("league_id", leagueId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to remove that member."));
  }
}

export async function joinHostedLeagueByCode(codeInput: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const profile = await fetchCurrentProfile();

  if (!profile) {
    throw new Error("Create a hosted profile before joining a league.");
  }

  const code = codeInput.trim().toUpperCase();
  const { data: league, error: leagueError } = await supabase
    .from("fantasy_leagues")
    .select("id, code, manager_count_target")
    .eq("code", code)
    .maybeSingle();

  if (leagueError) {
    throw new Error(assertErrorMessage(leagueError, "Unable to look up that league."));
  }

  if (!league) {
    throw new Error("That league code does not exist.");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("fantasy_league_memberships")
    .select("user_id")
    .eq("league_id", league.id);

  if (membershipsError) {
    throw new Error(assertErrorMessage(membershipsError, "Unable to load current league members."));
  }

  const isExistingMember = (memberships ?? []).some(
    (membership) => membership.user_id === user.id
  );

  if (isExistingMember) {
    return {
      code: league.code as string,
      id: league.id as string,
    };
  }

  if ((memberships ?? []).length >= (league.manager_count_target as number)) {
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
    throw new Error(assertErrorMessage(insertError, "Unable to join that league."));
  }

  return {
    code: league.code as string,
    id: league.id as string,
  };
}
