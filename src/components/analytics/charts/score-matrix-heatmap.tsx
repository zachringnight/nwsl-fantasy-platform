"use client";

import { cn } from "@/lib/utils";

interface ScoreMatrixHeatmapProps {
  matrix: number[][];
  homeTeam: string;
  awayTeam: string;
  maxGoals?: number;
}

function getHeatColor(value: number, max: number): string {
  const intensity = value / max;
  if (intensity > 0.8) return "bg-brand-strong/90 text-night";
  if (intensity > 0.6) return "bg-brand-strong/60 text-white";
  if (intensity > 0.4) return "bg-brand/50 text-white";
  if (intensity > 0.2) return "bg-brand/30 text-white";
  if (intensity > 0.05) return "bg-brand/15 text-muted";
  return "bg-white/4 text-muted/50";
}

export function ScoreMatrixHeatmap({
  matrix,
  homeTeam,
  awayTeam,
  maxGoals = 5,
}: ScoreMatrixHeatmapProps) {
  const display = matrix.slice(0, maxGoals + 1).map((row) => row.slice(0, maxGoals + 1));
  const maxVal = Math.max(...display.flat());

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-[320px]">
        {/* Header - away goals */}
        <div className="mb-1 text-center text-xs font-medium uppercase tracking-widest text-muted">
          {awayTeam} Goals
        </div>
        <div className="flex">
          {/* Y-axis label */}
          <div className="flex w-10 flex-col items-center justify-center">
            <span className="text-xs font-medium uppercase tracking-widest text-muted [writing-mode:vertical-lr] rotate-180">
              {homeTeam}
            </span>
          </div>
          <div>
            {/* Column headers */}
            <div className="flex gap-1 pb-1 pl-10">
              {Array.from({ length: maxGoals + 1 }, (_, j) => (
                <div
                  key={j}
                  className="flex size-11 items-center justify-center text-xs font-mono text-muted"
                >
                  {j}
                </div>
              ))}
            </div>
            {/* Matrix rows */}
            {display.map((row, i) => (
              <div key={i} className="flex gap-1">
                {/* Row header */}
                <div className="flex size-11 items-center justify-center text-xs font-mono text-muted">
                  {i}
                </div>
                {row.map((val, j) => (
                  <div
                    key={j}
                    className={cn(
                      "flex size-11 items-center justify-center rounded-md text-xs font-mono transition-colors",
                      getHeatColor(val, maxVal)
                    )}
                    title={`${homeTeam} ${i} - ${awayTeam} ${j}: ${(val * 100).toFixed(1)}%`}
                  >
                    {(val * 100).toFixed(1)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
