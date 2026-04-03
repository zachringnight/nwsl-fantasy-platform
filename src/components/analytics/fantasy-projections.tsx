"use client";

import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";

interface FantasyProjectionsProps {
  playerName: string;
  position: string;
  nextOpponent: string;
  isHome: boolean;
  projectedPoints: number;
  recentAverage: number;
  opponentDefenseRating: number;
  confidence: "high" | "medium" | "low";
}

export function FantasyProjections({
  playerName,
  position,
  nextOpponent,
  isHome,
  projectedPoints,
  recentAverage,
  opponentDefenseRating,
  confidence,
}: FantasyProjectionsProps) {
  const confidenceColors = {
    high: "success",
    medium: "brand",
    low: "accent",
  } as const;

  const diff = projectedPoints - recentAverage;
  const diffLabel = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);

  return (
    <div className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Fantasy Projection
        </h3>
        <Pill tone={confidenceColors[confidence]}>
          {confidence} confidence
        </Pill>
      </div>

      <div className="mb-4">
        <p className="text-sm text-muted">
          {isHome ? "vs" : "@"} {nextOpponent}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricTile
          label="Projected"
          value={projectedPoints.toFixed(1)}
          detail="fantasy points"
          tone="brand"
        />
        <MetricTile
          label="Recent Avg"
          value={recentAverage.toFixed(1)}
          detail={diffLabel}
        />
        <MetricTile
          label="Opp Defense"
          value={opponentDefenseRating.toFixed(0)}
          detail="rating"
        />
      </div>
    </div>
  );
}
