"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { ThemedBarChart } from "@/components/analytics/charts/themed-bar-chart";
import { getTeamRatings } from "@/lib/analytics/analytics-data";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

export default function RatingsPage() {
  const ratings = useMemo(() => getTeamRatings(), []);

  const best = ratings[0];
  const bestAttack = [...ratings].sort((a, b) => b.attackRating - a.attackRating)[0];
  const bestDefense = [...ratings].sort((a, b) => b.defenseRating - a.defenseRating)[0];

  const chartData = ratings.map((r) => ({
    team: r.team.length > 15 ? r.team.slice(0, 12) + "..." : r.team,
    Attack: r.attackRating,
    Defense: r.defenseRating,
  }));

  return (
    <AppShell
      eyebrow="Predictive Models"
      title="Power Ratings"
      description="Team strength ratings derived from real 2026 season results — goals scored, goals conceded, and recent form."
    >
      {/* Summary */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile
          label="Top Rated"
          value={best?.team ?? "—"}
          detail={`Rating: ${best?.overallRating.toFixed(1)}`}
          tone="brand"
        />
        <MetricTile
          label="Best Attack"
          value={bestAttack?.team ?? "—"}
          detail={`Attack: ${bestAttack?.attackRating.toFixed(1)}`}
          tone="accent"
        />
        <MetricTile
          label="Best Defense"
          value={bestDefense?.team ?? "—"}
          detail={`Defense: ${bestDefense?.defenseRating.toFixed(1)}`}
        />
      </section>

      {/* Attack vs Defense Chart */}
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Attack vs Defense Ratings
        </h3>
        <ThemedBarChart
          data={chartData}
          xKey="team"
          bars={[
            { dataKey: "Attack", label: "Attack", color: "#00e1ff" },
            { dataKey: "Defense", label: "Defense", color: "#0522ff" },
          ]}
          height={400}
        />
      </section>

      {/* Power Rankings Table */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Full Rankings
        </h3>
        <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3 text-right">Overall</th>
                <th className="px-4 py-3 text-right">Attack</th>
                <th className="px-4 py-3 text-right">Defense</th>
                <th className="px-4 py-3 text-right">Home Adv.</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((team) => {
                const movement = team.previousRank - team.currentRank;
                return (
                  <tr
                    key={team.teamId}
                    className="border-b border-line/50 transition hover:bg-white/4"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-brand-strong">
                      {team.currentRank}
                    </td>
                    <td className="px-2 py-3">
                      {movement > 0 ? (
                        <span className="flex items-center gap-0.5 text-xs text-brand-lime">
                          <ArrowUp className="size-3" />
                          {movement}
                        </span>
                      ) : movement < 0 ? (
                        <span className="flex items-center gap-0.5 text-xs text-danger">
                          <ArrowDown className="size-3" />
                          {Math.abs(movement)}
                        </span>
                      ) : (
                        <Minus className="size-3 text-muted/50" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{team.team}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono font-semibold text-foreground">
                        {team.overallRating.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RatingBar value={team.attackRating} color="bg-brand-strong" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RatingBar value={team.defenseRating} color="bg-brand" />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      +{(team.homeAdvantage * 100).toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function RatingBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono text-sm text-foreground">{value.toFixed(1)}</span>
      <div className="h-2 w-16 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
