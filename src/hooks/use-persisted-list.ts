"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_PREFIX = "nwsl-fantasy-";

interface UsePersistedListOptions {
  key: string;
  maxItems?: number;
}

/**
 * Manages a list of IDs that syncs to Supabase when authenticated
 * and falls back to localStorage for unauthenticated users.
 */
export function usePersistedList({ key, maxItems }: UsePersistedListOptions) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const { session, user } = useFantasyAuth();
  const [items, setItems] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Track whether the user has made local mutations before the backend loads
  const hasMutatedRef = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setItems(JSON.parse(stored) as string[]);
      }
    } catch {
      // ignore parse errors
    }
    setHasLoaded(true);
  }, [storageKey]);

  // Sync to Supabase when authenticated
  useEffect(() => {
    if (!session?.user?.id || !hasLoaded) return;

    // Reset mutation tracking on each backend sync attempt
    hasMutatedRef.current = false;

    async function loadFromBackend() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase
          .from("user_lists")
          .select("item_ids")
          .eq("user_id", session!.user.id)
          .eq("list_key", key)
          .single();

        if (data?.item_ids && !hasMutatedRef.current) {
          const backendItems = data.item_ids as string[];
          setItems(backendItems);
          window.localStorage.setItem(storageKey, JSON.stringify(backendItems));
        }
      } catch {
        // Table may not exist yet — fall back to localStorage
      }
    }

    void loadFromBackend();
  }, [session?.user?.id, key, storageKey, hasLoaded]);

  // Persist changes to localStorage and optionally Supabase
  const persistItems = useCallback(
    async (nextItems: string[]) => {
      hasMutatedRef.current = true;
      window.localStorage.setItem(storageKey, JSON.stringify(nextItems));

      if (!session?.user?.id) return;

      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.from("user_lists").upsert(
          {
            user_id: session.user.id,
            list_key: key,
            item_ids: nextItems,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,list_key" }
        );
      } catch {
        // Supabase sync is best-effort
      }
    },
    [key, session?.user?.id, storageKey]
  );

  const toggle = useCallback(
    (itemId: string) => {
      setItems((current) => {
        const next = current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : maxItems && current.length >= maxItems
            ? [...current.slice(1), itemId]
            : [...current, itemId];
        void persistItems(next);
        return next;
      });
    },
    [maxItems, persistItems]
  );

  const add = useCallback(
    (itemId: string) => {
      setItems((current) => {
        if (current.includes(itemId)) return current;
        const next =
          maxItems && current.length >= maxItems
            ? [...current.slice(1), itemId]
            : [...current, itemId];
        void persistItems(next);
        return next;
      });
    },
    [maxItems, persistItems]
  );

  const remove = useCallback(
    (itemId: string) => {
      setItems((current) => {
        const next = current.filter((id) => id !== itemId);
        void persistItems(next);
        return next;
      });
    },
    [persistItems]
  );

  const clear = useCallback(() => {
    setItems([]);
    void persistItems([]);
  }, [persistItems]);

  const has = useCallback(
    (itemId: string) => items.includes(itemId),
    [items]
  );

  return { items, toggle, add, remove, clear, has, hasLoaded };
}
