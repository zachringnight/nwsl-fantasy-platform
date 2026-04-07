"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cachedFantasyDataClient } from "@/lib/cached-data-client";
import type { FantasyDataClient } from "@/lib/fantasy-data-client";

const FantasyDataContext = createContext<FantasyDataClient>(cachedFantasyDataClient);

export interface FantasyDataProviderProps {
  children: ReactNode;
  client?: FantasyDataClient;
}

export function FantasyDataProvider({
  children,
  client,
}: FantasyDataProviderProps) {
  return (
    <FantasyDataContext.Provider value={client ?? cachedFantasyDataClient}>
      {children}
    </FantasyDataContext.Provider>
  );
}

export function useFantasyDataClient() {
  return useContext(FantasyDataContext);
}
