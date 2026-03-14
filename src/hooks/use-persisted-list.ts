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
  const { session } = useFantasyAuth();
  const userId = session?.user?.id;

  // Initialize from localStorage synchronously to avoid flash of empty state
  const [items, setItems] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Track whether the user has made local mutations before the backend loads
  const hasMutatedRef = useRef(false);

  // Keep refs in sync for use inside callbacks
  const userIdRef = useRef(userId);
  const keyRef = useRef(key);
  const storageKeyRef = useRef(storageKey);

  useEffect(() => {
    userIdRef.current = userId;
    keyRef.current = key;
    storageKeyRef.current = storageKey;
  }, [userId, key, storageKey]);

  // Sync from Supabase when authenticated
  useEffect(() => {
    if (!userId) return;

    // Reset mutation tracking on each backend sync attempt
    hasMutatedRef.current = false;

    async function loadFromBackend() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase
          .from("user_lists")
          .select("item_ids")
          .eq("user_id", userId!)
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
  }, [userId, key, storageKey]);

  // Persist helper ref — stable function that reads latest values from refs
  const persistRef = useRef((nextItems: string[]) => {
    hasMutatedRef.current = true;
    window.localStorage.setItem(storageKeyRef.current, JSON.stringify(nextItems));

    if (!userIdRef.current) return;

    const supabase = getSupabaseBrowserClient();
    void supabase
      .from("user_lists")
      .upsert(
        {
          user_id: userIdRef.current,
          list_key: keyRef.current,
          item_ids: nextItems,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,list_key" }
      )
      .then(
        () => {},
        () => {}
      );
  });

  const toggle = useCallback(
    (itemId: string) => {
      setItems((current) => {
        const next = current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : maxItems && current.length >= maxItems
            ? [...current.slice(1), itemId]
            : [...current, itemId];
        persistRef.current(next);
        return next;
      });
    },
    [maxItems]
  );

  const add = useCallback(
    (itemId: string) => {
      setItems((current) => {
        if (current.includes(itemId)) return current;
        const next =
          maxItems && current.length >= maxItems
            ? [...current.slice(1), itemId]
            : [...current, itemId];
        persistRef.current(next);
        return next;
      });
    },
    [maxItems]
  );

  const remove = useCallback((itemId: string) => {
    setItems((current) => {
      const next = current.filter((id) => id !== itemId);
      persistRef.current(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    persistRef.current([]);
  }, []);

  const has = useCallback(
    (itemId: string) => items.includes(itemId),
    [items]
  );

  return { items, toggle, add, remove, clear, has, hasLoaded: true };
}
