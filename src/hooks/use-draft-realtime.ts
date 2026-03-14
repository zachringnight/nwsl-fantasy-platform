"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface UseDraftRealtimeOptions {
  leagueId: string;
  enabled: boolean;
  onDraftUpdate: () => void;
}

/**
 * Subscribes to Supabase Realtime changes on draft-related tables.
 * Calls `onDraftUpdate` whenever a draft pick, queue change, or status update occurs,
 * so the draft room can refresh state without manual polling.
 */
export function useDraftRealtime({ leagueId, enabled, onDraftUpdate }: UseDraftRealtimeOptions) {
  const callbackRef = useRef(onDraftUpdate);
  callbackRef.current = onDraftUpdate;

  useEffect(() => {
    if (!enabled || !leagueId) return;

    const supabase = getSupabaseBrowserClient();
    const channelName = `draft-room:${leagueId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fantasy_draft_picks",
          filter: `league_id=eq.${leagueId}`,
        },
        () => callbackRef.current()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "fantasy_drafts",
          filter: `league_id=eq.${leagueId}`,
        },
        () => callbackRef.current()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId, enabled]);
}
