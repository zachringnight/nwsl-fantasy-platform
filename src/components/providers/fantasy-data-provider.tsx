"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  supabaseFantasyDataClient,
  type FantasyDataClient,
} from "@/lib/fantasy-data-client";

const FantasyDataContext = createContext<FantasyDataClient>(supabaseFantasyDataClient);

export interface FantasyDataProviderProps {
  children: ReactNode;
  client?: FantasyDataClient;
}

export function FantasyDataProvider({
  children,
  client,
}: FantasyDataProviderProps) {
  return (
    <FantasyDataContext.Provider value={client ?? supabaseFantasyDataClient}>
      {children}
    </FantasyDataContext.Provider>
  );
}

export function useFantasyDataClient() {
  return useContext(FantasyDataContext);
}
