"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { ThemedLineChart } from "@/components/analytics/charts/themed-line-chart";
import { ThemedBarChart } from "@/components/analytics/charts/themed-bar-chart";
import { ThemedRadarChart } from "@/components/analytics/charts/themed-radar-chart";
import {
  getPlayerDetail,
  getPlayerForm,
  getPlayerMatchLog,
} from "@/lib/analytics/analytics-data";

export default function PlayerDetailPage() {
  const params = useParams<{ playerId: string }>();
  const playerId = params.playerId;

  const player = useMemo(() => getPlayerDetail(playerId), [playerId]);
  const form = useMemo(() => getPlayerForm(playerId), [playerId]);
  const matchLog = useMemo(() => getPlayerMatchLog(playerId), [playerId]);

  if (!player) {
    return (
      <AppShell eyebrow="Player Analytics" title="Not Found" description="Player not found.">
        <Link href="/analytics/players" className="text-sm text-brand-strong hover:underline">
          Back to rankings
        </Link>
      </AppShell>
    );
  }

  // Radar chart data - normalize to 0-100 scale
  const maxStats = { goals: 10, assists: 8, shots: 40, tackles: 40, interceptions: 30, passAccuracy: 100 };
  const radarData = [
    { subject: "Goals", value: Math.min(100, (player.goals / maxStats.goals) * 100) },
    { subject: "Assists", value: Math.min(100, (player.assists / maxStats.assists) * 100) },
    { subject: "Shots", value: Math.min(100, (player.shots / maxStats.shots) * 100) },
    { subject: "Tackles", value: Math.min(100, (player.tackles / maxStats.tackles) * 100) },
    { subject: "Interceptions", value: Math.min(100, (player.interceptions / maxStats.interceptions) * 100) },
    { subject: "Pass Acc.", value: player.passAccuracy },
  ];

  // Scoring breakdown
  const breakdown = [
    { category: "Goals", points: player.goals * 8 },
    { category: "Assists", points: player.assists * 5 },
    { category: "Clean Sheets", points: player.cleanSheets * 4 },
    { category: "Saves", points: Math.round(player.saves * 1.5) },
    { category: "Appearances", points: player.appearances * 2 },
    { category: "Cards", points: -(player.yellowCards * 2 + player.redCards * 5) },
  ].filter((b) => b.points !== 0);

  return (
    <AppShell
      eyebrow={player.team}
      title={player.name}
      description={`${player.position} · ${player.appearances} appearances · ${player.minutes} minutes`}
      actions={
        <Link
          href="/analytics/players"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All Players
        </Link>
      }
    >
      {/* Key Stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricTile label="Goals" value={player.goals} detail={`xG: ${player.xg.toFixed(1)}`} tone="brand" />
        <MetricTile label="Assists" value={player.assists} detail={`xA: ${player.xa.toFixed(1)}`} tone="brand" />
        <MetricTile label="Fantasy Pts" value={player.fantasyPoints} detail={`${player.pointsPer90}/90`} tone="accent" />
        <MetricTile label="Minutes" value={player.minutes} detail={`${player.appearances} apps`} />
        <MetricTile label="Pass Acc." value={`${player.passAccuracy.toFixed(0)}%`} />
        <MetricTile
          label="Discipline"
          value={
            <span className="flex items-center gap-2">
              <span className="text-warning">{player.yellowCards}</span>
              <span className="text-xs text-muted">/</span>
              <span className="text-danger">{player.redCards}</span>
            </span>
          }
          detail="Y / R cards"
        />
      </section>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fantasy Points Over Time */}
        {form.length > 0 ? (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Fantasy Points Trend
            </h3>
            <ThemedLineChart
              data={form.map((f) => ({
                matchday: `MD ${f.matchday}`,
                points: f.fantasyPoints,
              }))}
              xKey="matchday"
              lines={[
                { dataKey: "points", label: "Fantasy Pts", color: "#00e1ff" },
              ]}
            />
          </section>
        ) : (
          <section className="glass-card rounded-[1.4rem] border border-dashed border-line bg-white/4 p-5 flex flex-col items-center justify-center text-center">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Fantasy Points Trend
            </h3>
            <p className="text-sm text-muted">
              Per-match data will appear here once API-Football fixture sync is configured.
            </p>
          </section>
        )}

        {/* Performance Radar */}
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Performance Profile
          </h3>
          <ThemedRadarChart
            data={radarData}
            radars={[
              { dataKey: "value", label: player.name, color: "#00e1ff" },
            ]}
          />
        </section>

        {/* Scoring Breakdown */}
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Scoring Breakdown
          </h3>
          <ThemedBarChart
            data={breakdown}
            xKey="category"
            bars={[{ dataKey: "points", label: "Points", color: "#0522ff" }]}
            colorByValue
            positiveColor="#00e1ff"
            negativeColor="#ff3c22"
          />
        </section>

        {/* Minutes Per Match */}
        {matchLog.length > 0 ? (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Minutes Per Match
            </h3>
            <ThemedBarChart
              data={matchLog.map((m, i) => ({
                match: `MD ${i + 1}`,
                minutes: m.minutes,
              }))}
              xKey="match"
              bars={[{ dataKey: "minutes", label: "Minutes", color: "#0522ff" }]}
            />
          </section>
        ) : (
          <section className="glass-card rounded-[1.4rem] border border-dashed border-line bg-white/4 p-5 flex flex-col items-center justify-center text-center">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Minutes Per Match
            </h3>
            <p className="text-sm text-muted">
              Per-match minutes data will appear here once API-Football fixture sync is configured.
            </p>
          </section>
        )}
      </div>

      {/* Match Log Table */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Match Log
        </h3>
        {matchLog.length > 0 ? (
          <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Opponent</th>
                  <th className="px-4 py-3">H/A</th>
                  <th className="px-4 py-3 text-right">Min</th>
                  <th className="px-4 py-3 text-right">G</th>
                  <th className="px-4 py-3 text-right">A</th>
                  <th className="px-4 py-3 text-right">Shots</th>
                  <th className="px-4 py-3 text-right">Pass%</th>
                  <th className="px-4 py-3 text-right">FP</th>
                </tr>
              </thead>
              <tbody>
                {matchLog.map((m) => (
                  <tr key={m.matchId} className="border-b border-line/50 transition hover:bg-white/4">
                    <td className="px-4 py-3 text-muted">{m.date}</td>
                    <td className="px-4 py-3 text-foreground">{m.opponent}</td>
                    <td className="px-4 py-3">
                      <Pill tone={m.home ? "brand" : "default"}>
                        {m.home ? "H" : "A"}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{m.minutes}</td>
                    <td className="px-4 py-3 text-right font-mono">{m.goals}</td>
                    <td className="px-4 py-3 text-right font-mono">{m.assists}</td>
                    <td className="px-4 py-3 text-right font-mono">{m.shots}</td>
                    <td className="px-4 py-3 text-right font-mono">{m.passAccuracy.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-brand-strong">
                      {m.fantasyPoints.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-6 text-center">
            <p className="text-sm text-muted">
              Match-by-match performance data will appear here once API-Football fixture sync is configured.
            </p>
            <p className="mt-1 text-xs text-muted/60">
              Set the <code className="font-mono text-brand-strong">API_FOOTBALL_KEY</code> environment variable to enable per-match stats.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
