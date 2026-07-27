import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { ScoringTrends } from "@/components/analytics/scoring-trends";
import {
  getLeagueTable,
  getLeagueTableBySeason,
  getPlayerRankings,
} from "@/lib/analytics/analytics-data";
import { getMatchPredictions } from "@/lib/analytics/general-predictions-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import { getMatchResultsBySeason } from "@/lib/analytics/analytics-real-data";
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

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const query = await searchParams;
  const season = query.season === "2025" ? "2025" : "2026";
  const live = season === "2026" ? await getLiveNwslPublicData() : null;
  const standings =
    live?.standings ??
    (season === "2026" ? getLeagueTable() : getLeagueTableBySeason(season));
  const players =
    season === "2026"
      ? live?.players ?? getPlayerRankings()
      : [];
  const matches = live?.matches ?? getMatchResultsBySeason(season);
  const predictions = (await getMatchPredictions()).filter((prediction) =>
    prediction.date.startsWith(season)
  );
  const playerCount = players.length;
  const teamCount = live?.teams.length ?? standings.length;
  const source =
    live?.provenance.source ??
    (season === "2026" ? "the official NWSL snapshot and ESPN" : "the ESPN archive");
  const teamLabel = `${teamCount} ${teamCount === 1 ? "team" : "teams"}`;
  const matchLabel = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;

  const leader = standings[0];
  const topScorer = [...players].sort((a, b) => b.goals - a.goals)[0];
  const topAssister = [...players].sort((a, b) => b.assists - a.assists)[0];
  const topFP = players[0];

  return (
    <AppShell
      eyebrow="NWSL Analytics"
      title="The Pulse"
      description={`${season} stats from ${playerCount > 0 ? `${playerCount} players, ` : ""}${teamLabel} and ${matchLabel}. Powered by ${source}.`}
    >
      {/* Key metrics */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile
          label="Table Leader"
          value={
            leader ? (
              <Link
                href={analyticsTeamHref(leader.teamId, season)}
                className="hover:underline"
              >
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
                href={analyticsPlayerHref(topScorer.playerId, season)}
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
                  href={analyticsTeamHref(topScorer.teamId, season)}
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
                href={analyticsPlayerHref(topAssister.playerId, season)}
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
                  href={analyticsTeamHref(topAssister.teamId, season)}
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
              <Link
                href={analyticsPlayerHref(topFP.playerId, season)}
                className="hover:underline"
              >
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
              href={`/analytics/teams?season=${season}`}
              className="text-sm font-semibold uppercase tracking-widest text-brand-strong hover:underline hover:underline-offset-4"
            >
              League Table
            </Link>
            <Link
              href={`/analytics/teams?season=${season}`}
              aria-label="View all teams"
            >
              <Pill tone="brand">View all</Pill>
            </Link>
          </div>
          <div className="space-y-2">
            {standings.slice(0, 5).map((team, i) => (
              <Link
                key={team.teamId}
                href={analyticsTeamHref(team.teamId, season)}
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
              href={`/analytics/players?season=${season}`}
              className="text-sm font-semibold uppercase tracking-widest text-brand-strong hover:underline hover:underline-offset-4"
            >
              Top Players
            </Link>
            <Link
              href={`/analytics/players?season=${season}`}
              aria-label={`View ${season} player rankings`}
            >
              <Pill tone={playerCount > 0 ? "brand" : "default"}>
                {playerCount > 0 ? `${playerCount} players` : "Unavailable"}
              </Pill>
            </Link>
          </div>
          <div className="space-y-2">
            {players.slice(0, 5).map((player, i) => (
              <Link
                key={player.playerId}
                href={analyticsPlayerHref(player.playerId, season)}
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
            {players.length === 0 && (
              <p className="text-sm leading-6 text-muted">
                Verified player-level rankings are not available for the {season}
                archive.
              </p>
            )}
          </div>
        </section>

        {/* Predictions or Data Status */}
        {predictions.length > 0 ? (
          <section
            className="group glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
          >
            <div className="mb-4 flex items-center justify-between">
              <Link
                href={`/analytics/predictions?season=${season}`}
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
                      href={analyticsTeamHref(pred.homeTeamId, season)}
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
                      href={analyticsTeamHref(pred.awayTeamId, season)}
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
                      href={analyticsMatchHref(pred.matchId, season)}
                      className="text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      Match
                    </Link>
                    <Link
                      href={analyticsPredictionHref(pred.matchId, season)}
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
                  href={`/analytics/players?season=${season}`}
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Player stats
                </Link>
                <Pill tone={playerCount > 0 ? "success" : "default"}>
                  {playerCount > 0 ? `${playerCount} loaded` : "Unavailable"}
                </Pill>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href={`/analytics/teams?season=${season}`}
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Team standings
                </Link>
                <Pill tone="success">{teamCount} teams</Pill>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href={`/analytics/matches?season=${season}`}
                  className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Match results
                </Link>
                <Pill tone="success">{matches.length} from ESPN</Pill>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href={`/analytics/predictions?season=${season}`}
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
              href={`/analytics/matches?season=${season}`}
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
                  href={analyticsMatchHref(match.matchId, season)}
                  aria-label={`Open ${match.homeTeam} vs ${match.awayTeam}`}
                  className="mb-2 inline-flex text-[0.65rem] font-medium uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Matchday {match.matchday}
                </Link>
                <div className="flex items-center justify-between">
                  <Link
                    href={analyticsTeamHref(match.homeTeamId, season)}
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
                    href={analyticsTeamHref(match.awayTeamId, season)}
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
                    href={analyticsMatchHref(match.matchId, season)}
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
              No match results are available for the {season} season.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
