"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { FormIndicator } from "@/components/analytics/form-indicator";
import { ThemedRadarChart } from "@/components/analytics/charts/themed-radar-chart";
import { getTeamDetail, getLeagueTable } from "@/lib/analytics/analytics-data";

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const data = useMemo(() => getTeamDetail(teamId), [teamId]);

  if (!data.standing) {
    return (
      <AppShell eyebrow="Team Analytics" title="Not Found" description="Team not found.">
        <Link href="/analytics/teams" className="text-sm text-brand-strong hover:underline">
          Back to table
        </Link>
      </AppShell>
    );
  }

  const { standing, stats, rating, matches, players } = data;

  // Radar data for team profile
  const radarData = stats
    ? [
        { subject: "Goals", value: Math.min(100, (standing.goalsFor / Math.max(standing.played, 1)) * 40) },
        { subject: "Defense", value: Math.min(100, Math.max(0, 90 - (standing.goalsAgainst / Math.max(standing.played, 1)) * 30)) },
        { subject: "Shots", value: Math.min(100, (stats.shots / 200) * 100) },
        { subject: "Shooting Acc.", value: stats.shots > 0 ? (stats.shotsOnTarget / stats.shots) * 100 : 0 },
        { subject: "Tackles", value: Math.min(100, (stats.tackles / 200) * 100) },
        { subject: "Pressing", value: Math.min(100, ((stats.tackles + stats.interceptions) / 400) * 100) },
      ]
    : [];

  // Top players
  const topPlayers = [...players].sort((a, b) => b.fantasyPoints - a.fantasyPoints).slice(0, 5);

  // Match data (empty until API-Football is connected)
  const completedMatches = matches.filter((m) => m.status === "completed");

  return (
    <AppShell
      eyebrow="Team Analytics"
      title={standing.team}
      description={`${standing.points} points · ${standing.played} played · GD ${standing.goalDifference >= 0 ? "+" : ""}${standing.goalDifference}`}
      actions={
        <Link
          href="/analytics/teams"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          League Table
        </Link>
      }
    >
      {/* Key Stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricTile label="Position" value={`#${getStandingPosition(standing.teamId)}`} tone="brand" />
        <MetricTile label="Points" value={standing.points} detail={`${standing.won}W ${standing.drawn}D ${standing.lost}L`} tone="brand" />
        <MetricTile label="Goals For" value={standing.goalsFor} detail={`${standing.played} games`} />
        <MetricTile label="Goals Against" value={standing.goalsAgainst} detail={`GD: ${standing.goalDifference >= 0 ? "+" : ""}${standing.goalDifference}`} />
        <MetricTile label="Clean Sheets" value={stats?.cleanSheets ?? 0} />
        <MetricTile
          label="Form"
          value={<FormIndicator form={standing.form} />}
        />
      </section>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Profile Radar */}
        {radarData.length > 0 && (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Team Profile
            </h3>
            <ThemedRadarChart
              data={radarData}
              radars={[
                { dataKey: "value", label: standing.team, color: "#00e1ff" },
              ]}
            />
          </section>
        )}

        {/* Model Rating */}
        {rating && (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Model Rating
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <MetricTile label="Overall" value={rating.overallRating.toFixed(1)} tone="brand" />
              <MetricTile label="Attack" value={rating.attackRating.toFixed(1)} />
              <MetricTile label="Defense" value={rating.defenseRating.toFixed(1)} />
              <MetricTile label="Home Adv." value={`+${(rating.homeAdvantage * 100).toFixed(0)}%`} />
            </div>
          </section>
        )}

        {/* Team Stats Detail */}
        {stats && (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Season Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile label="Total Shots" value={stats.shots} />
              <MetricTile label="On Target" value={stats.shotsOnTarget} />
              <MetricTile label="Tackles" value={stats.tackles} />
              <MetricTile label="Interceptions" value={stats.interceptions} />
              <MetricTile label="Clean Sheets" value={stats.cleanSheets} />
              <MetricTile label="Shot Acc." value={stats.shots > 0 ? `${Math.round((stats.shotsOnTarget / stats.shots) * 100)}%` : "—"} />
            </div>
          </section>
        )}
      </div>

      {/* Top Players */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Top Players
        </h3>
        {topPlayers.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {topPlayers.map((player, i) => (
              <Link
                key={player.playerId}
                href={`/analytics/players/${player.playerId}`}
                className="glass-card rounded-xl border border-line bg-white/4 p-4 transition hover:border-brand/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand-strong">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{player.name}</p>
                    <div className="flex items-center gap-2">
                      <Pill tone="default">{player.position}</Pill>
                      <span className="text-xs text-muted">{player.fantasyPoints} FP</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted">
                  <span>{player.goals}G</span>
                  <span>{player.assists}A</span>
                  <span>{player.appearances} app</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No player data available for this team.</p>
        )}
      </section>

      {/* Recent Results */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Recent Matches
        </h3>
        {completedMatches.length > 0 ? (
          <div className="space-y-2">
            {completedMatches.slice(-5).reverse().map((match) => {
              const isHome = match.homeTeamId === teamId;
              const gf = isHome ? match.homeGoals : match.awayGoals;
              const ga = isHome ? match.awayGoals : match.homeGoals;
              const result = gf > ga ? "W" : gf < ga ? "L" : "D";
              const opponent = isHome ? match.awayTeam : match.homeTeam;

              return (
                <Link
                  key={match.matchId}
                  href={`/analytics/matches/${match.matchId}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-white/4 px-4 py-3 transition hover:border-brand/30"
                >
                  <div className="flex items-center gap-3">
                    <Pill tone={result === "W" ? "success" : result === "L" ? "accent" : "default"}>
                      {result}
                    </Pill>
                    <span className="text-sm text-foreground">
                      {isHome ? "vs" : "@"} {opponent}
                    </span>
                  </div>
                  <span className="font-mono text-lg font-semibold text-foreground">
                    {match.homeGoals} - {match.awayGoals}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-white/4 p-6 text-center">
            <p className="text-sm text-muted">
              Match results will appear here once API-Football fixture sync is configured.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function getStandingPosition(teamId: string): number | string {
  const table = getLeagueTable();
  const idx = table.findIndex((t) => t.teamId === teamId);
  return idx >= 0 ? idx + 1 : "—";
}
