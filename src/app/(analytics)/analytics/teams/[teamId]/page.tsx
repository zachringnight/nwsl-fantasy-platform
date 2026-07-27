import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { FormIndicator } from "@/components/analytics/form-indicator";
import { ThemedRadarChart } from "@/components/analytics/charts/themed-radar-chart";
import { ScoringTrends } from "@/components/analytics/scoring-trends";
import {
  getLeagueTableBySeason,
  getPlayerRankings,
  getTeamRatings,
  getTeamStats,
  type Season,
} from "@/lib/analytics/analytics-data";
import { getMatchResultsBySeason } from "@/lib/analytics/analytics-real-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import {
  analyticsMatchHref,
  analyticsPlayerHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const [{ teamId }, query] = await Promise.all([params, searchParams]);
  const season: Season = query.season === "2025" ? "2025" : "2026";
  const live = season === "2026" ? await getLiveNwslPublicData() : null;
  const standings = live?.standings ?? getLeagueTableBySeason(season);
  const allMatches = live?.matches ?? getMatchResultsBySeason(season);
  const standing = standings.find((candidate) => candidate.teamId === teamId);
  const stats =
    live?.teamStats.find((candidate) => candidate.teamId === teamId) ??
    (season === "2026"
      ? getTeamStats().find((candidate) => candidate.teamId === teamId)
      : undefined);
  const rating =
    live?.teamRatings.find((candidate) => candidate.teamId === teamId) ??
    (season === "2026"
      ? getTeamRatings().find((candidate) => candidate.teamId === teamId)
      : undefined);
  const players =
    live?.players.filter((candidate) => candidate.teamId === teamId) ??
    (season === "2026"
      ? getPlayerRankings().filter((candidate) => candidate.teamId === teamId)
      : []);
  const matches = allMatches.filter(
    (match) => match.homeTeamId === teamId || match.awayTeamId === teamId
  );

  if (!standing) {
    return (
      <AppShell eyebrow="Team Analytics" title="Not Found" description="Team not found.">
        <Link
          href={`/analytics/teams?season=${season}`}
          className="text-sm text-brand-strong hover:underline"
        >
          Back to table
        </Link>
      </AppShell>
    );
  }

  const radarData = stats
    ? [
        {
          subject: "Goals",
          value: Math.min(
            100,
            (standing.goalsFor / Math.max(standing.played, 1)) * 40
          ),
        },
        {
          subject: "Defense",
          value: Math.min(
            100,
            Math.max(
              0,
              90 -
                (standing.goalsAgainst / Math.max(standing.played, 1)) * 30
            )
          ),
        },
        { subject: "Shots", value: Math.min(100, (stats.shots / 250) * 100) },
        {
          subject: "Shooting Acc.",
          value:
            stats.shots > 0 ? (stats.shotsOnTarget / stats.shots) * 100 : 0,
        },
        {
          subject: "Possession",
          value: Math.min(100, Math.max(0, stats.possession)),
        },
        {
          subject: "Pressing",
          value: Math.min(
            100,
            ((stats.tackles + stats.interceptions) / 400) * 100
          ),
        },
      ]
    : [];
  const topPlayers = [...players]
    .sort((left, right) => right.fantasyPoints - left.fantasyPoints)
    .slice(0, 5);
  const completedMatches = matches.filter((match) => match.status === "completed");
  const upcomingMatches = matches
    .filter(
      (match) => match.status === "upcoming" || match.status === "live"
    )
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 5);
  const tablePosition =
    standings.findIndex((candidate) => candidate.teamId === teamId) + 1;
  const source = live?.provenance.source ?? "ESPN and official NWSL snapshot";

  return (
    <AppShell
      eyebrow="Team Analytics"
      title={standing.team}
      description={`${season} · ${standing.points} points · ${standing.played} played · GD ${standing.goalDifference >= 0 ? "+" : ""}${standing.goalDifference} · ${source}`}
      actions={
        <Link
          href={`/analytics/teams?season=${season}`}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          League Table
        </Link>
      }
    >
      {live?.provenance.isStale && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          The last complete official snapshot is older than 36 hours. It remains
          visible while the next automated refresh retries.
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricTile
          label="Position"
          value={tablePosition > 0 ? `#${tablePosition}` : "—"}
          tone="brand"
        />
        <MetricTile
          label="Points"
          value={standing.points}
          detail={`${standing.won}W ${standing.drawn}D ${standing.lost}L`}
          tone="brand"
        />
        <MetricTile
          label="Goals For"
          value={standing.goalsFor}
          detail={`${standing.played} games`}
        />
        <MetricTile
          label="Goals Against"
          value={standing.goalsAgainst}
          detail={`GD: ${standing.goalDifference >= 0 ? "+" : ""}${standing.goalDifference}`}
        />
        <MetricTile label="Clean Sheets" value={stats?.cleanSheets ?? "—"} />
        <MetricTile label="Form" value={<FormIndicator form={standing.form} />} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
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

        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Goals Per Match
          </h3>
          <ScoringTrends matches={allMatches} teamId={teamId} />
        </section>

        {rating && (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Model Rating
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <MetricTile
                label="Overall"
                value={rating.overallRating.toFixed(1)}
                tone="brand"
              />
              <MetricTile label="Attack" value={rating.attackRating.toFixed(1)} />
              <MetricTile label="Defense" value={rating.defenseRating.toFixed(1)} />
              <MetricTile
                label="Home Adv."
                value={`+${(rating.homeAdvantage * 100).toFixed(0)}%`}
              />
            </div>
          </section>
        )}

        {stats && (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Season Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile label="Total Shots" value={stats.shots} />
              <MetricTile label="On Target" value={stats.shotsOnTarget} />
              <MetricTile label="Possession" value={stats.possession ? `${stats.possession.toFixed(1)}%` : "—"} />
              <MetricTile label="Pass Accuracy" value={stats.passAccuracy ? `${stats.passAccuracy.toFixed(1)}%` : "—"} />
              <MetricTile label="Tackles Won" value={stats.tackles} />
              <MetricTile label="Interceptions" value={stats.interceptions} />
              <MetricTile label="Corners" value={stats.corners || "—"} />
              <MetricTile
                label="Shot Accuracy"
                value={
                  stats.shots > 0
                    ? `${Math.round((stats.shotsOnTarget / stats.shots) * 100)}%`
                    : "—"
                }
              />
            </div>
          </section>
        )}
      </div>

      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          {season} Players
        </h3>
        {topPlayers.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {topPlayers.map((player, index) => (
              <Link
                key={player.playerId}
                href={analyticsPlayerHref(player.playerId, season)}
                className="glass-card rounded-xl border border-line bg-white/4 p-4 transition hover:border-brand/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand-strong">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {player.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <Pill tone="default">{player.position}</Pill>
                      <span className="text-xs text-muted">
                        {player.fantasyPoints} FP
                      </span>
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
          <p className="text-sm text-muted">
            Player season data is not available for this archived season.
          </p>
        )}
      </section>

      {upcomingMatches.length > 0 && (
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Upcoming Matches
          </h3>
          <div className="space-y-2">
            {upcomingMatches.map((match) => {
              const isHome = match.homeTeamId === teamId;
              const opponent = isHome ? match.awayTeam : match.homeTeam;
              const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
              return (
                <article
                  key={match.officialMatchId ?? match.matchId}
                  className="flex items-center justify-between rounded-xl border border-line bg-white/4 px-4 py-3 transition hover:border-brand/30"
                >
                  <div className="flex items-center gap-3">
                    <Pill tone={match.status === "live" ? "accent" : "default"}>
                      {match.status === "live" ? "LIVE" : match.date}
                    </Pill>
                    <span className="text-sm text-muted">{isHome ? "vs" : "@"}</span>
                    <Link
                      href={analyticsTeamHref(opponentId, season)}
                      className="text-sm text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {opponent}
                    </Link>
                  </div>
                  <Link
                    href={analyticsMatchHref(match.matchId, season)}
                    className="text-sm font-semibold text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    Matchup
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Recent Matches
        </h3>
        {completedMatches.length > 0 ? (
          <div className="space-y-2">
            {[...completedMatches]
              .sort((left, right) => right.date.localeCompare(left.date))
              .slice(0, 5)
              .map((match) => {
                const isHome = match.homeTeamId === teamId;
                const goalsFor = isHome ? match.homeGoals : match.awayGoals;
                const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
                const result =
                  goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";
                const opponent = isHome ? match.awayTeam : match.homeTeam;
                const opponentId = isHome ? match.awayTeamId : match.homeTeamId;

                return (
                  <article
                    key={match.officialMatchId ?? match.matchId}
                    className="flex items-center justify-between rounded-xl border border-line bg-white/4 px-4 py-3 transition hover:border-brand/30"
                  >
                    <div className="flex items-center gap-3">
                      <Pill
                        tone={
                          result === "W"
                            ? "success"
                            : result === "L"
                              ? "accent"
                              : "default"
                        }
                      >
                        {result}
                      </Pill>
                      <span className="text-sm text-muted">
                        {isHome ? "vs" : "@"}
                      </span>
                      <Link
                        href={analyticsTeamHref(opponentId, season)}
                        className="text-sm text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {opponent}
                      </Link>
                    </div>
                    <Link
                      href={analyticsMatchHref(match.matchId, season)}
                      aria-label={`Open ${match.homeTeam} vs ${match.awayTeam}`}
                      className="font-mono text-lg font-semibold text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {match.homeGoals} - {match.awayGoals}
                    </Link>
                  </article>
                );
              })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-white/4 p-6 text-center">
            <p className="text-sm text-muted">
              No completed matches are available for this season.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
