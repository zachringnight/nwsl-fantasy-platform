import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { ScoringTrends } from "@/components/analytics/scoring-trends";
import {
  getLeagueTable,
  getPlayerRankings,
  getMatchResults,
  getMatchPredictions,
} from "@/lib/analytics/analytics-data";
import { getRealPlayerCount, getRealTeamNames } from "@/lib/analytics/analytics-real-data";
import {
  analyticsMatchHref,
  analyticsPlayerHref,
  analyticsPredictionHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";

export const metadata = {
  title: "Analytics",
  description: "NWSL player stats, team analytics, match predictions, and model-driven insights.",
};

export default function AnalyticsPage() {
  const standings = getLeagueTable();
  const players = getPlayerRankings();
  const matches = getMatchResults();
  const predictions = getMatchPredictions();
  const playerCount = getRealPlayerCount();
  const teamCount = getRealTeamNames().length;

  const leader = standings[0];
  const topScorer = [...players].sort((a, b) => b.goals - a.goals)[0];
  const topAssister = [...players].sort((a, b) => b.assists - a.assists)[0];
  const topFP = players[0];

  return (
    <AppShell
      eyebrow="NWSL Analytics"
      title="The Pulse"
      description={`Real stats from ${playerCount} players, ${teamCount} teams, and ${matches.length} matches. Powered by official NWSL data and ESPN.`}
    >
      {/* Key metrics */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile
          label="Table Leader"
          value={
            leader ? (
              <Link href={analyticsTeamHref(leader.teamId)} className="hover:underline">
                {leader.team}
              </Link>
            ) : (
              "—"
            )
          }
          detail={`${leader?.points ?? 0} pts · ${leader?.played ?? 0} played`}
          tone="brand"
        />
        <MetricTile
          label="Top Scorer"
          value={
            topScorer ? (
              <Link
                href={analyticsPlayerHref(topScorer.playerId)}
                className="hover:underline"
              >
                {topScorer.name}
              </Link>
            ) : (
              "—"
            )
          }
          detail={
            topScorer ? (
              <>
                {topScorer.goals} goals ·{" "}
                <Link
                  href={analyticsTeamHref(topScorer.teamId)}
                  className="hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {topScorer.team}
                </Link>
              </>
            ) : (
              "0 goals"
            )
          }
          tone="accent"
        />
        <MetricTile
          label="Most Assists"
          value={
            topAssister ? (
              <Link
                href={analyticsPlayerHref(topAssister.playerId)}
                className="hover:underline"
              >
                {topAssister.name}
              </Link>
            ) : (
              "—"
            )
          }
          detail={
            topAssister ? (
              <>
                {topAssister.assists} assists ·{" "}
                <Link
                  href={analyticsTeamHref(topAssister.teamId)}
                  className="hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {topAssister.team}
                </Link>
              </>
            ) : (
              "0 assists"
            )
          }
        />
        <MetricTile
          label="Fantasy Leader"
          value={
            topFP ? (
              <Link href={analyticsPlayerHref(topFP.playerId)} className="hover:underline">
                {topFP.name}
              </Link>
            ) : (
              "—"
            )
          }
          detail={`${topFP?.fantasyPoints ?? 0} pts · ${topFP?.pointsPer90 ?? 0}/90`}
          tone="brand"
        />
      </section>

      {/* Quick-access sections */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* League Table Preview */}
        <section
          className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
        >
          <div className="mb-4 flex items-center justify-between">
            <Link
              href="/analytics/teams"
              className="text-sm font-semibold uppercase tracking-widest text-brand-strong hover:underline hover:underline-offset-4"
            >
              League Table
            </Link>
            <Link href="/analytics/teams" aria-label="View all teams">
              <Pill tone="brand">View all</Pill>
            </Link>
          </div>
          <div className="space-y-2">
            {standings.slice(0, 5).map((team, i) => (
              <Link
                key={team.teamId}
                href={analyticsTeamHref(team.teamId)}
                className="flex items-center justify-between rounded-lg text-sm transition hover:bg-white/5 hover:text-brand-strong"
              >
                <span className="flex items-center gap-3">
                  <span className="w-5 text-center font-mono text-muted">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{team.team}</span>
                </span>
                <span className="font-mono text-muted">{team.points} pts</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Top Players Preview */}
        <section
          className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
        >
          <div className="mb-4 flex items-center justify-between">
            <Link
              href="/analytics/players"
              className="text-sm font-semibold uppercase tracking-widest text-brand-strong hover:underline hover:underline-offset-4"
            >
              Top Players
            </Link>
            <Link href="/analytics/players" aria-label={`View all ${playerCount} players`}>
              <Pill tone="brand">{playerCount} players</Pill>
            </Link>
          </div>
          <div className="space-y-2">
            {players.slice(0, 5).map((player, i) => (
              <Link
                key={player.playerId}
                href={analyticsPlayerHref(player.playerId)}
                className="flex items-center justify-between rounded-lg text-sm transition hover:bg-white/5"
              >
                <span className="flex items-center gap-3">
                  <span className="w-5 text-center font-mono text-muted">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{player.name}</span>
                  <Pill tone="default">{player.position}</Pill>
                </span>
                <span className="font-mono text-muted">
                  {player.fantasyPoints} fp
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Predictions or Data Status */}
        {predictions.length > 0 ? (
          <section
            className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
          >
            <div className="mb-4 flex items-center justify-between">
              <Link
                href="/analytics/predictions"
                className="text-sm font-semibold uppercase tracking-widest text-brand-strong hover:underline hover:underline-offset-4"
              >
                Predictions
              </Link>
              <Pill tone="accent">AI Model</Pill>
            </div>
            <div className="space-y-3">
              {predictions.slice(0, 4).map((pred) => (
                <article key={pred.matchId} className="space-y-1 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <Link
                      href={analyticsTeamHref(pred.homeTeamId)}
                      className="text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {pred.homeTeam}
                    </Link>
                    <span className="font-mono text-brand-strong">
                      {(pred.homeProb * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full">
                    <div className="bg-brand-strong" style={{ width: `${pred.homeProb * 100}%` }} />
                    <div className="bg-muted/40" style={{ width: `${pred.drawProb * 100}%` }} />
                    <div className="bg-accent" style={{ width: `${pred.awayProb * 100}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <Link
                      href={analyticsTeamHref(pred.awayTeamId)}
                      className="text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {pred.awayTeam}
                    </Link>
                    <span className="font-mono text-accent">
                      {(pred.awayProb * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-end gap-3 pt-1 text-[0.65rem]">
                    <Link
                      href={analyticsMatchHref(pred.matchId)}
                      className="text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      Match
                    </Link>
                    <Link
                      href={analyticsPredictionHref(pred.matchId)}
                      className="font-semibold text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      Prediction
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <div className="glass-card rounded-[1.4rem] border border-line bg-white/6 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
                Data Pipeline
              </h2>
              <Pill tone="default">Status</Pill>
            </div>
            <div className="space-y-3 text-sm text-muted">
              <div className="flex items-center justify-between">
                <Link
                  href="/analytics/players"
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Player stats
                </Link>
                <Pill tone="success">{playerCount} loaded</Pill>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href="/analytics/teams"
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Team standings
                </Link>
                <Pill tone="success">{teamCount} teams</Pill>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href="/analytics/matches"
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Match results
                </Link>
                <Pill tone="success">{matches.length} from ESPN</Pill>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href="/analytics/predictions"
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Model predictions
                </Link>
                <Pill tone="default">Awaiting model run</Pill>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* League-wide Scoring Trends */}
      {matches.length > 0 && (
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Scoring Trends
          </h3>
          <ScoringTrends matches={matches} />
        </section>
      )}

      {/* Recent Results or Empty State */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Recent Results
          </h2>
          {matches.length > 0 && (
            <Link
              href="/analytics/matches"
              className="text-sm text-muted transition hover:text-brand-strong"
            >
              All matches
            </Link>
          )}
        </div>
        {matches.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {matches.filter((m) => m.status === "completed").slice(-8).reverse().map((match) => (
              <article
                key={match.matchId}
                className="glass-card rounded-xl border border-line bg-white/6 p-4 transition hover:border-brand/30"
              >
                <Link
                  href={analyticsMatchHref(match.matchId)}
                  aria-label={`Open ${match.homeTeam} vs ${match.awayTeam}`}
                  className="mb-2 inline-flex text-[0.65rem] font-medium uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Matchday {match.matchday}
                </Link>
                <div className="flex items-center justify-between">
                  <Link
                    href={analyticsTeamHref(match.homeTeamId)}
                    className="text-sm text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {match.homeTeam}
                  </Link>
                  <span className="font-mono text-lg font-semibold text-foreground">
                    {match.homeGoals}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <Link
                    href={analyticsTeamHref(match.awayTeamId)}
                    className="text-sm text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {match.awayTeam}
                  </Link>
                  <span className="font-mono text-lg font-semibold text-foreground">
                    {match.awayGoals}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted/70">{match.venue}</span>
                  <Link
                    href={analyticsMatchHref(match.matchId)}
                    className="shrink-0 font-medium text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    Details
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
            <p className="text-sm text-muted">
              Match results will appear here once the API-Football fixture sync is configured.
            </p>
            <p className="mt-1 text-xs text-muted/60">
              Set the <code className="font-mono text-brand-strong">API_FOOTBALL_KEY</code> environment variable to enable live match data.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
