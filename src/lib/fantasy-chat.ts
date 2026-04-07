"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatMessageRecord } from "@/types/fantasy";

export async function loadChatMessages(
  leagueId: string,
  options?: { limit?: number; before?: string }
): Promise<ChatMessageRecord[]> {
  const supabase = getSupabaseBrowserClient();
  const limit = options?.limit ?? 50;

  let query = supabase
    .from("fantasy_chat_messages")
    .select(`
      id,
      league_id,
      user_id,
      body,
      created_at,
      profile:fantasy_profiles!inner ( display_name )
    `)
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;

  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    league_id: row.league_id as string,
    user_id: row.user_id as string,
    display_name: ((row.profile as Record<string, string>)?.display_name) ?? "Unknown",
    body: row.body as string,
    created_at: row.created_at as string,
  })).reverse();
}

export async function sendChatMessage(
  leagueId: string,
  body: string
): Promise<ChatMessageRecord | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to send a message.");
  if (!body.trim()) throw new Error("Message cannot be empty.");
  if (body.length > 500) throw new Error("Message is too long (max 500 characters).");

  const { data, error } = await supabase
    .from("fantasy_chat_messages")
    .insert({
      league_id: leagueId,
      user_id: user.id,
      body: body.trim(),
    })
    .select("id, league_id, user_id, body, created_at")
    .single();

  if (error) {
    throw new Error("Unable to send message.");
  }

  // Fetch display name
  const { data: profile } = await supabase
    .from("fantasy_profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    ...data,
    display_name: profile?.display_name ?? "You",
  } as ChatMessageRecord;
}
