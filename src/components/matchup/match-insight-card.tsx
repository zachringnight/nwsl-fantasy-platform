"use client";

interface MatchInsightCardProps {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  lambdaHome: number;
  lambdaAway: number;
  projectedHomeGoals: number;
  projectedAwayGoals: number;
  scoreMatrix: number[][];
  homeClubName: string;
  awayClubName: string;
}

export function MatchInsightCard({
  homeWinProb,
  drawProb,
  awayWinProb,
  lambdaHome,
  lambdaAway,
  projectedHomeGoals,
  projectedAwayGoals,
  scoreMatrix,
  homeClubName,
  awayClubName,
}: MatchInsightCardProps) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const scorelines: { home: number; away: number; prob: number }[] = [];
  for (let h = 0; h < scoreMatrix.length; h++) {
    for (let a = 0; a < scoreMatrix[h].length; a++) {
      scorelines.push({ home: h, away: a, prob: scoreMatrix[h][a] });
    }
  }
  scorelines.sort((a, b) => b.prob - a.prob);
  const top5 = scorelines.slice(0, 5);

  return (
    <div className="glass-card rounded-2xl border border-line bg-panel-strong p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
        Model Insight
      </h3>
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-white/60">
          <span>{homeClubName}</span>
          <span>Draw</span>
          <span>{awayClubName}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: pct(homeWinProb) }}
          />
          <div
            className="bg-white/20 transition-all"
            style={{ width: pct(drawProb) }}
          />
          <div
            className="bg-blue-500 transition-all"
            style={{ width: pct(awayWinProb) }}
          />
        </div>
        <div className="flex justify-between text-sm font-semibold text-white">
          <span>{pct(homeWinProb)}</span>
          <span>{pct(drawProb)}</span>
          <span>{pct(awayWinProb)}</span>
        </div>
      </div>
      <div className="flex justify-center items-baseline gap-3 py-2">
        <span className="text-3xl font-bold text-white">
          {projectedHomeGoals}
        </span>
        <span className="text-white/30 text-lg">-</span>
        <span className="text-3xl font-bold text-white">
          {projectedAwayGoals}
        </span>
      </div>
      <div className="flex justify-between text-xs text-white/50">
        <span>{lambdaHome.toFixed(1)} xG expected</span>
        <span>{lambdaAway.toFixed(1)} xG expected</span>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-white/50 uppercase tracking-wider">
          Most Likely Scores
        </p>
        <div className="flex gap-2 flex-wrap">
          {top5.map((s, i) => (
            <span
              key={i}
              className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70"
            >
              {s.home}-{s.away}{" "}
              <span className="text-white/40">{pct(s.prob)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
