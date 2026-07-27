import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { ThemedLineChart } from "@/components/analytics/charts/themed-line-chart";
import { ThemedBarChart } from "@/components/analytics/charts/themed-bar-chart";
import { ThemedRadarChart } from "@/components/analytics/charts/themed-radar-chart";
import { getPlayerDetail } from "@/lib/analytics/analytics-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import {
  analyticsMatchHref,
  analyticsPlayerHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import { calculateAggregateFantasyScore } from "@/lib/scoring/scoring-engine";
import type {
  PlayerMatchLog,
  PlayerSeasonStats,
} from "@/types/analytics";

const breakdownLabels: Record<string, string> = {
  appearance: "Appearances",
  minutes60Plus: "60+ Minutes",
  goals: "Goals",
  assists: "Assists",
  shots: "Shots",
  shotsOnTarget: "Shots on Target",
  chancesCreated: "Chances Created",
  successfulPasses: "Successful Passes",
  successfulCrosses: "Successful Crosses",
  foulsWon: "Fouls Won",
  foulsCommitted: "Fouls Committed",
  tacklesWon: "Tackles Won",
  interceptions: "Interceptions",
  blocks: "Blocks",
  cleanSheets: "Clean Sheets",
  saves: "Saves",
  goalsConceded: "Goals Conceded",
  yellowCards: "Yellow Cards",
  redCards: "Red Cards",
  penaltySaves: "Penalty Saves",
  penaltyMisses: "Penalty Misses",
  penaltyConceded: "Penalties Conceded",
  ownGoals: "Own Goals",
  goalkeeperWins: "Goalkeeper Wins",
  goalkeeperDraws: "Goalkeeper Draws",
};

function aggregateFantasyBreakdown(
  player: PlayerSeasonStats,
  matchLog: PlayerMatchLog[]
): Record<string, number> {
  if (matchLog.some((match) => Object.keys(match.fantasyBreakdown ?? {}).length)) {
    const total: Record<string, number> = {};
    for (const match of matchLog) {
      for (const [key, value] of Object.entries(match.fantasyBreakdown ?? {})) {
        total[key] = (total[key] ?? 0) + value;
      }
    }
    return total;
  }

  return calculateAggregateFantasyScore({
    position: player.position,
    appearances: player.appearances,
    sixtyPlusAppearances: player.starts ?? 0,
    goals: player.goals,
    assists: player.assists,
    cleanSheets: player.cleanSheets,
    saves: player.saves,
    goalsConceded: player.goalsConceded ?? 0,
    yellowCards: player.yellowCards,
    redCards: player.redCards,
    penaltySaves: player.penaltySaves ?? 0,
    penaltyMisses: 0,
    shots: player.shots,
    shotsOnTarget: player.shotsOnTarget,
    chancesCreated: player.chancesCreated,
    successfulPasses: player.successfulPasses,
    successfulCrosses: player.crosses,
    foulsWon: player.foulsWon,
    foulsCommitted: player.foulsCommitted,
    tacklesWon: player.tackles,
    interceptions: player.interceptions,
    blocks: player.blocks,
  }).breakdown;
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const [{ playerId }, query] = await Promise.all([params, searchParams]);
  const season = query.season === "2025" ? "2025" : "2026";
  const live = season === "2026" ? await getLiveNwslPublicData() : null;
  const player =
    season === "2026"
      ? live?.players.find((candidate) => candidate.playerId === playerId) ??
        getPlayerDetail(playerId)
      : undefined;
  const form = live?.playerForms[playerId] ?? [];
  const matchLog = live?.playerMatchLogs[playerId] ?? [];

  if (!player) {
    return (
      <AppShell
        eyebrow="Player Analytics"
        title={season === "2025" ? "Player Archive Unavailable" : "Not Found"}
        description={
          season === "2025"
            ? "Verified player-level records are not available for the 2025 archive."
            : "Player not found."
        }
      >
        <Link
          href={`/analytics/players?season=${season}`}
          className="text-sm text-brand-strong hover:underline"
        >
          Back to rankings
        </Link>
      </AppShell>
    );
  }

  const maxStats = {
    goals: 10,
    assists: 8,
    shots: 40,
    tackles: 40,
    interceptions: 30,
  };
  const radarData = [
    { subject: "Goals", value: Math.min(100, (player.goals / maxStats.goals) * 100) },
    {
      subject: "Assists",
      value: Math.min(100, (player.assists / maxStats.assists) * 100),
    },
    { subject: "Shots", value: Math.min(100, (player.shots / maxStats.shots) * 100) },
    {
      subject: "Tackles",
      value: Math.min(100, (player.tackles / maxStats.tackles) * 100),
    },
    {
      subject: "Interceptions",
      value: Math.min(
        100,
        (player.interceptions / maxStats.interceptions) * 100
      ),
    },
    { subject: "Pass Acc.", value: player.passAccuracy },
  ];
  const breakdown = Object.entries(
    aggregateFantasyBreakdown(player, matchLog)
  )
    .map(([key, points]) => ({
      category: breakdownLabels[key] ?? key,
      points: Math.round(points * 10) / 10,
    }))
    .filter((item) => item.points !== 0);
  const sourceAsOf = live?.provenance.generatedAt
    ? new Date(live.provenance.generatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "the latest checked-in snapshot";
  const matchStatsAppearances = Math.max(
    0,
    Math.round(player.matchStatsAppearances ?? matchLog.length)
  );
  const matchStatsIncomplete = player.matchStatsComplete === false;

  return (
    <AppShell
      eyebrow={
        player.teamId ? (
          <Link
            href={analyticsTeamHref(player.teamId, season)}
            className="hover:underline hover:underline-offset-4"
          >
            {player.team}
          </Link>
        ) : (
          player.team
        )
      }
      title={player.name}
      description={`${player.position} · ${player.appearances} appearances · ${player.minutes} minutes · Official 2026 NWSL data through ${sourceAsOf}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/players/${encodeURIComponent(player.playerId)}`}
            className="inline-flex items-center rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
          >
            Fantasy player card
          </Link>
          {player.teamId && (
            <Link
              href={analyticsTeamHref(player.teamId, season)}
              className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm text-brand-strong transition hover:border-brand-strong/50"
            >
              {player.team} profile
            </Link>
          )}
          <Link
            href={`/analytics/players?season=${season}`}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All Players
          </Link>
        </div>
      }
    >
      {matchStatsIncomplete ? (
        <aside
          aria-label="Match-by-match source coverage"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3"
        >
          <Pill tone="default">Partial match log</Pill>
          <p className="text-sm leading-6 text-muted">
            Official season totals remain available, but match-by-match detail is
            available for {matchStatsAppearances} of {player.appearances}{" "}
            appearances. Tracked fantasy totals reflect only those matches.
          </p>
        </aside>
      ) : null}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricTile
          label="Goals"
          value={player.goals}
          detail={`${player.shots} shots · ${player.xg > 0 ? `${player.xg.toFixed(1)} xG` : "xG —"}`}
          tone="brand"
        />
        <MetricTile
          label="Assists"
          value={player.assists}
          detail={`${player.chancesCreated ?? 0} chances created`}
          tone="brand"
        />
        <MetricTile
          label="Fantasy Pts"
          value={player.fantasyPoints}
          detail={`${player.pointsPer90}/90`}
          tone="accent"
        />
        <MetricTile
          label="Minutes"
          value={player.minutes}
          detail={`${player.starts ?? 0} starts · ${player.appearances} apps`}
        />
        <MetricTile
          label="Pass Acc."
          value={player.passes ? `${player.passAccuracy.toFixed(0)}%` : "—"}
          detail={
            player.passes
              ? `${player.successfulPasses ?? 0}/${player.passes} complete`
              : undefined
          }
        />
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

      <div className="grid gap-6 lg:grid-cols-2">
        {form.length > 0 ? (
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Fantasy Points Trend
            </h3>
            <ThemedLineChart
              data={form.map((point) => ({
                matchday: `MD ${point.matchday}`,
                points: point.fantasyPoints,
              }))}
              xKey="matchday"
              lines={[
                { dataKey: "points", label: "Fantasy Pts", color: "#00e1ff" },
              ]}
            />
          </section>
        ) : (
          <section className="glass-card flex flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-line bg-white/4 p-5 text-center">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Fantasy Points Trend
            </h3>
            <p className="text-sm text-muted">
              No official 2026 match breakdown has been recorded for this player.
            </p>
          </section>
        )}

        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Performance Profile
          </h3>
          <ThemedRadarChart
            data={radarData}
            radars={[{ dataKey: "value", label: player.name, color: "#00e1ff" }]}
          />
        </section>

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

        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Season Detail
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Shots on Target" value={player.shotsOnTarget} />
            <MetricTile label="Chances Created" value={player.chancesCreated ?? 0} />
            <MetricTile label="Tackles Won" value={player.tackles} />
            <MetricTile label="Interceptions" value={player.interceptions} />
            <MetricTile label="Clean Sheets" value={player.cleanSheets} />
            <MetricTile
              label={player.position === "GK" ? "Saves" : "Blocks"}
              value={player.position === "GK" ? player.saves : player.blocks ?? 0}
            />
          </div>
        </section>
      </div>

      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Match Log
        </h3>
        {matchLog.length > 0 ? (
          <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
            <table className="w-full min-w-[800px] text-sm">
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
                {[...matchLog].reverse().map((match) => (
                  <tr
                    key={match.officialMatchId ?? match.matchId}
                    className="border-b border-line/50 transition hover:bg-white/4"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={analyticsMatchHref(match.matchId, season)}
                        className="text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {match.date}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {match.opponentId ? (
                        <Link
                          href={analyticsTeamHref(match.opponentId, season)}
                          className="text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                        >
                          {match.opponent}
                        </Link>
                      ) : (
                        match.opponent
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={match.home ? "brand" : "default"}>
                        {match.home ? "H" : "A"}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{match.minutes}</td>
                    <td className="px-4 py-3 text-right font-mono">{match.goals}</td>
                    <td className="px-4 py-3 text-right font-mono">{match.assists}</td>
                    <td className="px-4 py-3 text-right font-mono">{match.shots}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {match.passes > 0 ? `${match.passAccuracy.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-brand-strong">
                      {match.fantasyPoints.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-6 text-center">
            <p className="text-sm text-muted">
              This player has no official match-by-match record in the current
              2026 snapshot.
            </p>
            <Link
              href={analyticsPlayerHref(player.playerId, season)}
              className="mt-2 inline-flex text-xs text-brand-strong hover:underline"
            >
              Refresh this player page
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
