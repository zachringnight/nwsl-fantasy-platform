"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FantasyProfile } from "@/types/fantasy";

export interface FantasyAuthContextValue {
  authError: string | null;
  hasHydrated: boolean;
  profile: FantasyProfile | null;
  session: Session | null;
  signOut: () => Promise<void>;
  supabaseReady: boolean;
  user: User | null;
  refreshProfile: () => Promise<FantasyProfile | null>;
}

const FantasyAuthContext = createContext<FantasyAuthContextValue | null>(null);

export interface FantasyAuthProviderProps {
  children: ReactNode;
}

export function FantasyAuthProvider({ children }: FantasyAuthProviderProps) {
  const dataClient = useFantasyDataClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<FantasyProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(true);

  function getAuthErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }

  async function syncAuthState(nextSession?: Session | null): Promise<FantasyProfile | null> {
    let supabase;

    try {
      supabase = getSupabaseBrowserClient();
      setSupabaseReady(true);
      setAuthError(null);
    } catch (error) {
      setSupabaseReady(false);
      setAuthError(getAuthErrorMessage(error, "Hosted account services are unavailable."));
      setSession(null);
      setProfile(null);
      setHasHydrated(true);
      return null;
    }

    const activeSession =
      nextSession ?? (await supabase.auth.getSession()).data.session ?? null;

    setSession(activeSession);

    if (!activeSession?.user) {
      setAuthError(null);
      setProfile(null);
      setHasHydrated(true);
      return null;
    }

    if (activeSession.user.is_anonymous) {
      await supabase.auth.signOut();
      setAuthError(null);
      setSession(null);
      setProfile(null);
      setHasHydrated(true);
      return null;
    }

    try {
      let nextProfile = await dataClient.fetchCurrentProfile();

      if (!nextProfile) {
        nextProfile = await dataClient.ensureCurrentProfile();
      }

      setAuthError(null);
      setProfile(nextProfile);
      setHasHydrated(true);
      return nextProfile;
    } catch (error) {
      setAuthError(getAuthErrorMessage(error, "Unable to load your account right now."));
      setProfile(null);
      setHasHydrated(true);
      return null;
    }
  }

  const handleAuthSync = useEffectEvent(async (nextSession?: Session | null) => {
    await syncAuthState(nextSession);
  });

  useEffect(() => {
    let unsubscribed = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const initialize = async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        await handleAuthSync();

        subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (unsubscribed) {
            return;
          }

          void handleAuthSync(nextSession);
        }).data.subscription;
      } catch (error) {
        if (!unsubscribed) {
          setSupabaseReady(false);
          setAuthError(getAuthErrorMessage(error, "Hosted account services are unavailable."));
          setSession(null);
          setProfile(null);
          setHasHydrated(true);
        }
      }
    };

    void initialize();

    return () => {
      unsubscribed = true;
      subscription?.unsubscribe();
    };
  }, []);

  async function signOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      setAuthError(null);
      setSession(null);
      setProfile(null);
    }
  }

  return (
    <FantasyAuthContext.Provider
      value={{
        authError,
        hasHydrated,
        profile,
        session,
        signOut,
        supabaseReady,
        user: session?.user ?? null,
        refreshProfile: async () => {
          return syncAuthState();
        },
      }}
    >
      {children}
    </FantasyAuthContext.Provider>
  );
}

export function useFantasyAuth() {
  const context = useContext(FantasyAuthContext);

  if (!context) {
    throw new Error("useFantasyAuth must be used inside FantasyAuthProvider.");
  }

  return context;
}
