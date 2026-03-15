import type { FantasyDataClient } from "@/lib/fantasy-data-client";
import { supabaseFantasyDataClient } from "@/lib/fantasy-data-client";

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  promise?: Promise<T>;
};

const DEFAULT_TTL_MS = 30_000; // 30 seconds

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function getCacheKey(method: string, args: unknown[]): string {
  return `${method}:${JSON.stringify(args)}`;
}

function withDedup<TArgs extends unknown[], TReturn>(
  method: string,
  fn: (...args: TArgs) => Promise<TReturn>,
  ttl = DEFAULT_TTL_MS
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const key = getCacheKey(method, args);

    // Return cached value if still valid
    const cached = cache.get(key) as CacheEntry<TReturn> | undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Deduplicate in-flight requests
    const existing = inflight.get(key) as Promise<TReturn> | undefined;
    if (existing) {
      return existing;
    }

    const promise = fn(...args).then((result) => {
      cache.set(key, { data: result, expiresAt: Date.now() + ttl });
      inflight.delete(key);
      return result;
    }).catch((error) => {
      inflight.delete(key);
      throw error;
    });

    inflight.set(key, promise);
    return promise;
  };
}

/** Invalidate all cached data (call after mutations) */
export function invalidateCache(methodPrefix?: string) {
  if (methodPrefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${methodPrefix}:`)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

/**
 * Wraps the Supabase data client with request deduplication and short-lived caching.
 * Read methods are cached for 30s and deduplicated when multiple components
 * request the same data concurrently. Write methods pass through and invalidate
 * relevant caches.
 */
export const cachedFantasyDataClient: FantasyDataClient = {
  // Read methods — cached and deduplicated
  loadLeagueById: withDedup("loadLeagueById", supabaseFantasyDataClient.loadLeagueById),
  loadLeagueMatchup: withDedup("loadLeagueMatchup", supabaseFantasyDataClient.loadLeagueMatchup),
  loadLeaguePlayerListings: withDedup("loadLeaguePlayerListings", supabaseFantasyDataClient.loadLeaguePlayerListings),
  loadLeagueStandings: withDedup("loadLeagueStandings", supabaseFantasyDataClient.loadLeagueStandings),
  loadMyLeagues: withDedup("loadMyLeagues", supabaseFantasyDataClient.loadMyLeagues),
  loadRosterState: withDedup("loadRosterState", supabaseFantasyDataClient.loadRosterState),
  loadSalaryCapEntryState: withDedup("loadSalaryCapEntryState", supabaseFantasyDataClient.loadSalaryCapEntryState),
  loadDraftState: withDedup("loadDraftState", supabaseFantasyDataClient.loadDraftState),
  loadTransactionHub: withDedup("loadTransactionHub", supabaseFantasyDataClient.loadTransactionHub),
  fetchCurrentProfile: withDedup("fetchCurrentProfile", supabaseFantasyDataClient.fetchCurrentProfile),

  // Write methods — pass through and invalidate relevant caches
  addPlayerToDraftQueue: async (...args) => {
    const result = await supabaseFantasyDataClient.addPlayerToDraftQueue(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  autopickCurrentDraftTurn: async (...args) => {
    const result = await supabaseFantasyDataClient.autopickCurrentDraftTurn(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  autofillRosterLineup: async (...args) => {
    const result = await supabaseFantasyDataClient.autofillRosterLineup(...args);
    invalidateCache("loadRosterState");
    return result;
  },
  autofillSalaryCapEntry: async (...args) => {
    const result = await supabaseFantasyDataClient.autofillSalaryCapEntry(...args);
    invalidateCache("loadSalaryCapEntryState");
    return result;
  },
  cancelWaiverClaim: async (...args) => {
    const result = await supabaseFantasyDataClient.cancelWaiverClaim(...args);
    invalidateCache("loadTransactionHub");
    return result;
  },
  clearSalaryCapEntry: async (...args) => {
    const result = await supabaseFantasyDataClient.clearSalaryCapEntry(...args);
    invalidateCache("loadSalaryCapEntryState");
    return result;
  },
  createHostedLeague: async (...args) => {
    const result = await supabaseFantasyDataClient.createHostedLeague(...args);
    invalidateCache("loadMyLeagues");
    return result;
  },
  ensureHostedSession: supabaseFantasyDataClient.ensureHostedSession,
  joinHostedLeagueByCode: async (...args) => {
    const result = await supabaseFantasyDataClient.joinHostedLeagueByCode(...args);
    invalidateCache("loadMyLeagues");
    return result;
  },
  makeDraftPick: async (...args) => {
    const result = await supabaseFantasyDataClient.makeDraftPick(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  moveDraftQueueItem: async (...args) => {
    const result = await supabaseFantasyDataClient.moveDraftQueueItem(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  processWaiverClaims: async (...args) => {
    const result = await supabaseFantasyDataClient.processWaiverClaims(...args);
    invalidateCache("loadTransactionHub");
    invalidateCache("loadRosterState");
    return result;
  },
  revealDraftOrder: async (...args) => {
    const result = await supabaseFantasyDataClient.revealDraftOrder(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  removeLeagueMember: async (...args) => {
    const result = await supabaseFantasyDataClient.removeLeagueMember(...args);
    invalidateCache("loadLeagueById");
    invalidateCache("loadMyLeagues");
    return result;
  },
  removePlayerFromDraftQueue: async (...args) => {
    const result = await supabaseFantasyDataClient.removePlayerFromDraftQueue(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  reopenSalaryCapEntry: async (...args) => {
    const result = await supabaseFantasyDataClient.reopenSalaryCapEntry(...args);
    invalidateCache("loadSalaryCapEntryState");
    return result;
  },
  saveRosterLineup: async (...args) => {
    const result = await supabaseFantasyDataClient.saveRosterLineup(...args);
    invalidateCache("loadRosterState");
    return result;
  },
  saveSalaryCapEntry: async (...args) => {
    const result = await supabaseFantasyDataClient.saveSalaryCapEntry(...args);
    invalidateCache("loadSalaryCapEntryState");
    return result;
  },
  submitWaiverClaim: async (...args) => {
    const result = await supabaseFantasyDataClient.submitWaiverClaim(...args);
    invalidateCache("loadTransactionHub");
    return result;
  },
  submitSalaryCapEntry: async (...args) => {
    const result = await supabaseFantasyDataClient.submitSalaryCapEntry(...args);
    invalidateCache("loadSalaryCapEntryState");
    return result;
  },
  updateDraftStatus: async (...args) => {
    const result = await supabaseFantasyDataClient.updateDraftStatus(...args);
    invalidateCache("loadDraftState");
    return result;
  },
  updateLeagueSettings: async (...args) => {
    const result = await supabaseFantasyDataClient.updateLeagueSettings(...args);
    invalidateCache("loadLeagueById");
    return result;
  },
  upsertFantasyProfile: async (...args) => {
    const result = await supabaseFantasyDataClient.upsertFantasyProfile(...args);
    invalidateCache("fetchCurrentProfile");
    return result;
  },
};
