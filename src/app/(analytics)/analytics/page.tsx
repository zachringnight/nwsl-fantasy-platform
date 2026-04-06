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
          value={leader?.team ?? "—"}
          detail={`${leader?.points ?? 0} pts · ${leader?.played ?? 0} played`}
          tone="brand"
        />
        <MetricTile
          label="Top Scorer"
          value={topScorer?.name ?? "—"}
          detail={`${topScorer?.goals ?? 0} goals · ${topScorer?.team}`}
          tone="accent"
        />
        <MetricTile
          label="Most Assists"
          value={topAssister?.name ?? "—"}
          detail={`${topAssister?.assists ?? 0} assists · ${topAssister?.team}`}
        />
        <MetricTile
          label="Fantasy Leader"
          value={topFP?.name ?? "—"}
          detail={`${topFP?.fantasyPoints ?? 0} pts · ${topFP?.pointsPer90 ?? 0}/90`}
          tone="brand"
        />
      </section>

      {/* Quick-access sections */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* League Table Preview */}
        <Link
          href="/analytics/teams"
          className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
              League Table
            </h2>
            <Pill tone="brand">View all</Pill>
          </div>
          <div className="space-y-2">
            {standings.slice(0, 5).map((team, i) => (
              <div
                key={team.teamId}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-3">
                  <span className="w-5 text-center font-mono text-muted">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{team.team}</span>
                </span>
                <span className="font-mono text-muted">{team.points} pts</span>
              </div>
            ))}
          </div>
        </Link>

        {/* Top Players Preview */}
        <Link
          href="/analytics/players"
          className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Top Players
            </h2>
            <Pill tone="brand">{playerCount} players</Pill>
          </div>
          <div className="space-y-2">
            {players.slice(0, 5).map((player, i) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between text-sm"
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
              </div>
            ))}
          </div>
        </Link>

        {/* Predictions or Data Status */}
        {predictions.length > 0 ? (
          <Link
            href="/analytics/predictions"
            className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
                Predictions
              </h2>
              <Pill tone="accent">AI Model</Pill>
            </div>
            <div className="space-y-3">
              {predictions.slice(0, 4).map((pred) => (
                <div key={pred.matchId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{pred.homeTeam}</span>
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
                    <span className="text-foreground">{pred.awayTeam}</span>
                    <span className="font-mono text-accent">
                      {(pred.awayProb * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Link>
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
                <span>Player stats</span>
                <Pill tone="success">{playerCount} loaded</Pill>
              </div>
              <div className="flex items-center justify-between">
                <span>Team standings</span>
                <Pill tone="success">{teamCount} teams</Pill>
              </div>
              <div className="flex items-center justify-between">
                <span>Match results</span>
                <Pill tone="success">{matches.length} from ESPN</Pill>
              </div>
              <div className="flex items-center justify-between">
                <span>Model predictions</span>
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
              <Link
                key={match.matchId}
                href={`/analytics/matches/${match.matchId}`}
                className="glass-card rounded-xl border border-line bg-white/6 p-4 transition hover:border-brand/30"
              >
                <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-widest text-muted">
                  Matchday {match.matchday}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{match.homeTeam}</span>
                  <span className="font-mono text-lg font-semibold text-foreground">
                    {match.homeGoals}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{match.awayTeam}</span>
                  <span className="font-mono text-lg font-semibold text-foreground">
                    {match.awayGoals}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted/70">{match.venue}</div>
              </Link>
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
