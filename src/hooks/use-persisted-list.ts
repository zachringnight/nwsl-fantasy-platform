"use client";

import { useEffect, useRef, useState } from "react";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_PREFIX = "nwsl-fantasy-";

interface UsePersistedListOptions {
  key: string;
  maxItems?: number;
}

function readStoredItems(storageKey: string) {
  const stored = window.localStorage.getItem(storageKey);
  return stored ? (JSON.parse(stored) as string[]) : null;
}

/**
 * Manages a list of IDs that syncs to Supabase when authenticated
 * and falls back to localStorage for unauthenticated users.
 */
export function usePersistedList({ key, maxItems }: UsePersistedListOptions) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const { session } = useFantasyAuth();
  const [items, setItems] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const sessionUserId = session?.user?.id ?? null;

  // Track whether the user has made local mutations before the backend loads
  const hasMutatedRef = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    let timeoutId: number | null = null;
    let storedItems: string[] | null = null;

    try {
      storedItems = readStoredItems(storageKey);
    } catch {
      // ignore parse errors
    }

    timeoutId = window.setTimeout(() => {
      if (storedItems) {
          setItems(storedItems);
      }
      setHasLoaded(true);
    }, 0);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [storageKey]);

  // Sync to Supabase when authenticated
  useEffect(() => {
    if (!sessionUserId || !hasLoaded) return;

    // Reset mutation tracking on each backend sync attempt
    hasMutatedRef.current = false;

    async function loadFromBackend() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase
          .from("user_lists")
          .select("item_ids")
          .eq("user_id", sessionUserId)
          .eq("list_key", key)
          .maybeSingle();

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
  }, [sessionUserId, key, storageKey, hasLoaded]);

  // Persist changes to localStorage and optionally Supabase
  async function persistItems(nextItems: string[]) {
    hasMutatedRef.current = true;
    window.localStorage.setItem(storageKey, JSON.stringify(nextItems));

    if (!sessionUserId) return;

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("user_lists").upsert(
        {
          user_id: sessionUserId,
          list_key: key,
          item_ids: nextItems,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,list_key" }
      );
    } catch {
      // Supabase sync is best-effort
    }
  }

  function toggle(itemId: string) {
    setItems((current) => {
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : maxItems && current.length >= maxItems
          ? [...current.slice(1), itemId]
          : [...current, itemId];
      void persistItems(next);
      return next;
    });
  }

  function add(itemId: string) {
    setItems((current) => {
      if (current.includes(itemId)) return current;
      const next =
        maxItems && current.length >= maxItems
          ? [...current.slice(1), itemId]
          : [...current, itemId];
      void persistItems(next);
      return next;
    });
  }

  function remove(itemId: string) {
    setItems((current) => {
      const next = current.filter((id) => id !== itemId);
      void persistItems(next);
      return next;
    });
  }

  function clear() {
    setItems([]);
    void persistItems([]);
  }

  function has(itemId: string) {
    return items.includes(itemId);
  }

  return { items, toggle, add, remove, clear, has, hasLoaded };
}
