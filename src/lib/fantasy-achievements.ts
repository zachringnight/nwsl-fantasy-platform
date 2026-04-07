"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AchievementKey, AchievementRecord, StreakRecord } from "@/types/fantasy";

const ACHIEVEMENT_CATALOG: Record<AchievementKey, { label: string; description: string; icon: string }> = {
  FIRST_DRAFT_PICK: { label: "First Blood", description: "Made your first draft pick", icon: "crown" },
  WIN_STREAK_3: { label: "Hat Trick", description: "Won 3 matchups in a row", icon: "flame" },
  WIN_STREAK_5: { label: "On Fire", description: "Won 5 matchups in a row", icon: "fire" },
  WIN_STREAK_7: { label: "Unstoppable", description: "Won 7 matchups in a row", icon: "rocket" },
  POINTS_100_WEEK: { label: "Century Club", description: "Scored 100+ points in a single week", icon: "target" },
  POINTS_150_WEEK: { label: "Record Breaker", description: "Scored 150+ points in a single week", icon: "trophy" },
  PERFECT_LINEUP: { label: "Perfect XI", description: "Every starter outscored their average", icon: "star" },
  WAIVER_WIRE_HERO: { label: "Wire Wizard", description: "Won 3 waiver claims in a season", icon: "zap" },
  COMEBACK_WIN: { label: "Comeback Queen", description: "Won a matchup after trailing at halftime", icon: "rotate-ccw" },
  SEASON_CHAMPION: { label: "Champion", description: "Won the league championship", icon: "medal" },
  CLEAN_SWEEP: { label: "Clean Sweep", description: "Won every matchup in a week", icon: "shield-check" },
  TOP_SCORER_WEEK: { label: "Top Scorer", description: "Had the highest score in the league for a week", icon: "award" },
  TRADE_PARTNER: { label: "Dealmaker", description: "Completed your first trade", icon: "handshake" },
  CHAT_STARTER: { label: "Trash Talker", description: "Sent your first message in league chat", icon: "message-circle" },
};

export function getAchievementMeta(key: AchievementKey) {
  return ACHIEVEMENT_CATALOG[key];
}

export function getAllAchievementKeys(): AchievementKey[] {
  return Object.keys(ACHIEVEMENT_CATALOG) as AchievementKey[];
}

export async function loadMyAchievements(leagueId?: string): Promise<AchievementRecord[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  let query = supabase
    .from("fantasy_achievements")
    .select("id, user_id, league_id, key, label, description, earned_at, metadata")
    .eq("user_id", user.id)
    .order("earned_at", { ascending: false });

  if (leagueId) {
    query = query.or(`league_id.eq.${leagueId},league_id.is.null`);
  }

  const { data, error } = await query;

  if (error) return [];
  return (data ?? []) as AchievementRecord[];
}

export async function loadLeagueAchievements(leagueId: string): Promise<AchievementRecord[]> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("fantasy_achievements")
    .select("id, user_id, league_id, key, label, description, earned_at, metadata")
    .eq("league_id", leagueId)
    .order("earned_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as AchievementRecord[];
}

export async function awardAchievement(
  userId: string,
  key: AchievementKey,
  leagueId?: string,
  metadata?: Record<string, unknown>
): Promise<AchievementRecord | null> {
  const supabase = getSupabaseBrowserClient();
  const meta = ACHIEVEMENT_CATALOG[key];

  const { data, error } = await supabase
    .from("fantasy_achievements")
    .upsert(
      {
        user_id: userId,
        league_id: leagueId ?? null,
        key,
        label: meta.label,
        description: meta.description,
        earned_at: new Date().toISOString(),
        metadata: metadata ?? null,
      },
      { onConflict: "user_id,league_id,key" }
    )
    .select("id, user_id, league_id, key, label, description, earned_at, metadata")
    .single();

  if (error) return null;
  return data as AchievementRecord;
}

export async function loadStreaks(leagueId: string, userId: string): Promise<StreakRecord[]> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("fantasy_streaks")
    .select("id, user_id, league_id, fantasy_team_id, streak_type, current_count, best_count, last_updated_at")
    .eq("league_id", leagueId)
    .eq("user_id", userId);

  if (error) return [];
  return (data ?? []) as StreakRecord[];
}

export async function updateStreak(
  userId: string,
  leagueId: string,
  fantasyTeamId: string,
  streakType: string,
  won: boolean
): Promise<StreakRecord | null> {
  const supabase = getSupabaseBrowserClient();

  const { data: existing } = await supabase
    .from("fantasy_streaks")
    .select("id, current_count, best_count")
    .eq("user_id", userId)
    .eq("league_id", leagueId)
    .eq("streak_type", streakType)
    .maybeSingle();

  const currentCount = won ? (existing?.current_count ?? 0) + 1 : 0;
  const bestCount = Math.max(currentCount, existing?.best_count ?? 0);

  const { data, error } = await supabase
    .from("fantasy_streaks")
    .upsert(
      {
        id: existing?.id,
        user_id: userId,
        league_id: leagueId,
        fantasy_team_id: fantasyTeamId,
        streak_type: streakType,
        current_count: currentCount,
        best_count: bestCount,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,league_id,streak_type" }
    )
    .select("id, user_id, league_id, fantasy_team_id, streak_type, current_count, best_count, last_updated_at")
    .single();

  if (error) return null;

  // Auto-award streak achievements
  if (currentCount === 3) await awardAchievement(userId, "WIN_STREAK_3", leagueId);
  if (currentCount === 5) await awardAchievement(userId, "WIN_STREAK_5", leagueId);
  if (currentCount === 7) await awardAchievement(userId, "WIN_STREAK_7", leagueId);

  return data as StreakRecord;
}
