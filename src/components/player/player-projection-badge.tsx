const VALUE_LABELS: Record<string, { label: string; color: string }> = {
  elite_value: {
    label: "Elite Value",
    color: "text-emerald-400 bg-emerald-400/10",
  },
  good_value: {
    label: "Good Value",
    color: "text-green-400 bg-green-400/10",
  },
  fair: { label: "Fair", color: "text-white/60 bg-white/5" },
  overpriced: { label: "Overpriced", color: "text-red-400 bg-red-400/10" },
};

interface PlayerProjectionBadgeProps {
  projectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  valueRating: string;
  confidence: number;
}

export function PlayerProjectionBadge({
  projectedPoints,
  floorPoints,
  ceilingPoints,
  valueRating,
  confidence,
}: PlayerProjectionBadgeProps) {
  const rating = VALUE_LABELS[valueRating] ?? VALUE_LABELS.fair;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-white">
          {projectedPoints.toFixed(1)}
        </span>
        <span className="text-xs text-white/40">
          proj pts ({floorPoints.toFixed(1)}&ndash;{ceilingPoints.toFixed(1)})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${rating.color}`}
        >
          {rating.label}
        </span>
        <span className="text-xs text-white/40">
          {Math.round(confidence * 100)}% conf
        </span>
      </div>
    </div>
  );
}
