"use client";

import { useEffect, useState } from "react";
import { readLocalAppState, subscribeToLocalAppState } from "@/lib/local-mode-store";
import type { LocalAppState } from "@/types/local-mode";

const initialLocalModeState: LocalAppState = {
  currentUserId: null,
  users: [],
  leagues: [],
};

export function useLocalModeState() {
  const [state, setState] = useState<LocalAppState>(initialLocalModeState);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const syncState = () => {
      setState(readLocalAppState());
      setHasHydrated(true);
    };

    syncState();

    return subscribeToLocalAppState(syncState);
  }, []);

  const currentUser = state.users.find((user) => user.id === state.currentUserId) ?? null;
  const currentUserLeagues = currentUser
    ? state.leagues.filter((league) =>
        league.members.some((member) => member.userId === currentUser.id)
      )
    : [];

  return {
    hasHydrated,
    state,
    currentUser,
    currentUserLeagues,
  };
}
