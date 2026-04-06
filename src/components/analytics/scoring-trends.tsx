"use client";

import { useMemo } from "react";
import { ThemedLineChart } from "@/components/analytics/charts/themed-line-chart";
import { ThemedBarChart } from "@/components/analytics/charts/themed-bar-chart";
import type { MatchResult } from "@/types/analytics";

interface ScoringTrendsProps {
  matches: MatchResult[];
  teamId?: string;
}

export function ScoringTrends({ matches, teamId }: ScoringTrendsProps) {
  const data = useMemo(() => {
    const completed = matches
      .filter((m) => m.status === "completed")
      .sort((a, b) => a.date.localeCompare(b.date));

    if (teamId) {
      // Per-team goals per match
      return completed
        .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
        .map((m, i) => {
          const isHome = m.homeTeamId === teamId;
          return {
            match: `M${i + 1}`,
            scored: isHome ? m.homeGoals : m.awayGoals,
            conceded: isHome ? m.awayGoals : m.homeGoals,
          };
        });
    }

    // League-wide: goals per matchday
    const byDate = new Map<string, { total: number; count: number }>();
    for (const m of completed) {
      const entry = byDate.get(m.date) ?? { total: 0, count: 0 };
      entry.total += m.homeGoals + m.awayGoals;
      entry.count++;
      byDate.set(m.date, entry);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, count }], i) => ({
        match: `MD${i + 1}`,
        scored: Math.round((total / count) * 10) / 10,
        conceded: 0,
      }));
  }, [matches, teamId]);

  if (data.length === 0) return null;

  if (teamId) {
    return (
      <ThemedBarChart
        data={data}
        xKey="match"
        bars={[
          { dataKey: "scored", label: "Scored", color: "#00e1ff" },
          { dataKey: "conceded", label: "Conceded", color: "#ff3c22" },
        ]}
        height={250}
      />
    );
  }

  return (
    <ThemedLineChart
      data={data}
      xKey="match"
      lines={[
        { dataKey: "scored", label: "Avg Goals/Match", color: "#00e1ff" },
      ]}
      height={250}
    />
  );
}
