"use client";

import { useMemo } from "react";
import { buildLeagueLinks } from "@/lib/league-links";

export function useLeagueLinks(leagueId: string) {
  return useMemo(() => buildLeagueLinks(leagueId), [leagueId]);
}
