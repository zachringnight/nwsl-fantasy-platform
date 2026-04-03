"use client";

interface ProbabilityBarProps {
  homeProb: number;
  drawProb: number;
  awayProb: number;
  homeLabel?: string;
  awayLabel?: string;
  showPercentages?: boolean;
}

export function ProbabilityBar({
  homeProb,
  drawProb,
  awayProb,
  homeLabel = "Home",
  awayLabel = "Away",
  showPercentages = true,
}: ProbabilityBarProps) {
  return (
    <div className="space-y-2">
      {showPercentages && (
        <div className="flex justify-between text-sm">
          <span className="font-mono text-brand-strong">
            {homeLabel} {(homeProb * 100).toFixed(0)}%
          </span>
          <span className="font-mono text-muted">
            Draw {(drawProb * 100).toFixed(0)}%
          </span>
          <span className="font-mono text-accent">
            {awayLabel} {(awayProb * 100).toFixed(0)}%
          </span>
        </div>
      )}
      <div className="flex h-3 overflow-hidden rounded-full">
        <div
          className="bg-brand-strong transition-all"
          style={{ width: `${homeProb * 100}%` }}
        />
        <div
          className="bg-muted/40 transition-all"
          style={{ width: `${drawProb * 100}%` }}
        />
        <div
          className="bg-accent transition-all"
          style={{ width: `${awayProb * 100}%` }}
        />
      </div>
    </div>
  );
}
