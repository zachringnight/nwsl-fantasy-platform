import Link from "next/link";
import { ArrowUpRight, BookOpenText, CalendarRange, Shield, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { Pill } from "@/components/ui/pill";
import type {
  TeamAnalyticsRecord,
  TeamGameLogEntry,
} from "@/lib/analytics/fbref";
import type { MatchupPreviewRecord, PredictiveHubData } from "@/lib/analytics/predictive";

const MENU_ITEMS = [
  {
    id: "player-overview",
    title: "Projection Board",
    description: "Compare the players most likely to drive goals, chances, progression, and defensive points.",
  },
  {
    id: "player-quick-reference",
    title: "Fantasy Targets",
    description: "Quick position-by-position shortlists for lineup builds and prop research.",
  },
  {
    id: "player-game-log",
    title: "Form & Minutes",
    description: "See recent minutes, production, and involvement before lock.",
  },
  {
    id: "player-leaders",
    title: "Player Edges",
    description: "Find the finishers, creators, carriers, and ball-winners shaping fantasy ceilings and prop volume.",
  },
  {
    id: "team-overview",
    title: "Team Ratings",
    description: "See who is controlling games, creating chances, and showing the most stable team strength.",
  },
  {
    id: "team-offense",
    title: "Attack Signals",
    description: "Compare the clubs creating pressure, shots, and goal-scoring environments.",
  },
  {
    id: "team-defense",
    title: "Defense Signals",
    description: "See which clubs suppress chances, protect clean sheets, and lower opponent ceilings.",
  },
  {
    id: "team-leaders",
    title: "Team Edges",
    description: "A quick leaderboard view for the strongest teams in attack, defense, and control.",
  },
  {
    id: "team-game-log",
    title: "Club Results",
    description: "Every club's recent results, venues, and scorelines in one place.",
  },
  {
    id: "game-preview",
    title: "Matchup Previews",
    description: "Get a fast preview of upcoming games using season form, team style, and likely edge.",
  },
  {
    id: "game-recap",
    title: "Result Recaps",
    description: "Catch the latest scorelines and see whether the pre-match read held up.",
  },
  {
    id: "goalkeepers",
    title: "Keeper Outlook",
    description: "Shot-stopping, clean sheets, and the keepers shaping fantasy and prop markets.",
  },
  {
    id: "glossary",
    title: "Model Notes",
    description: "Plain-English help for the scores, terms, and leaderboards behind the projections.",
  },
  {
    id: "official-live",
    title: "Standings & Fixtures",
    description: "Standings, leaders, recent results, and the next matches that can move projections and prices.",
  },
  {
    id: "historical-archive",
    title: "Historical Baselines",
    description: "Zoom out and use league history as context for team strength, player roles, and long-run production.",
  },
  {
    id: "open-data",
    title: "xG & Shot Quality",
    description: "A closer look at shot quality and xG for matchup research and market context.",
  },
] as const;

const PLAYER_LEADER_METRICS = [
  { title: "Goals/90", key: "goalsPer90", formatter: formatDecimal },
  { title: "Playmaker", key: "playmakerIndex", formatter: formatSigned },
  { title: "SCA/90", key: "scaPer90", formatter: formatDecimal },
  { title: "Progression", key: "progressionIndex", formatter: formatSigned },
  { title: "Ball-winning", key: "ballWinningIndex", formatter: formatSigned },
  { title: "Usage", key: "usageIndex", formatter: formatSigned },
] as const;

const TEAM_LEADER_METRICS = [
  { title: "Attack", key: "offenseIndex", formatter: formatSigned },
  { title: "Defense", key: "defenseIndex", formatter: formatSigned },
  { title: "Control", key: "controlIndex", formatter: formatSigned },
  { title: "Points", key: "points", formatter: formatInteger },
  { title: "Goal Diff", key: "goalDifference", formatter: formatSignedInteger },
  { title: "Save %", key: "savePct", formatter: formatPercent },
] as const;

function formatInteger(value: number) {
  return Math.round(value).toLocaleString();
}

function formatSignedInteger(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatDecimal(value: number) {
  return value.toFixed(2);
}

function formatSigned(value: number) {
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatProbability(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatShortDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatMatchDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function topRows<T, K extends keyof T>(
  rows: T[],
  key: K,
  limit = 5,
  filter?: (row: T) => boolean
) {
  return [...rows]
    .filter((row) => (filter ? filter(row) : true))
    .sort((left, right) => Number(right[key] ?? 0) - Number(left[key] ?? 0))
    .slice(0, limit);
}

function formatResultPills(sequence: string) {
  if (!sequence) return "No recent sample";
  return sequence.split("").join(" ");
}

function formatSourceLabel(source: string) {
  switch (source) {
    case "Official NWSL API":
      return "Official NWSL";
    case "nwslR archive":
      return "League Archive";
    case "StatsBomb Open Data":
      return "StatsBomb";
    default:
      return source;
  }
}

function MetricLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-full border border-line bg-white/5 px-4 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <Pill tone="brand">{eyebrow}</Pill>
      <div className="space-y-2">
        <h2 className="font-display text-4xl uppercase leading-[0.9] text-foreground sm:text-5xl">
          {title}
        </h2>
        <p className="max-w-4xl text-sm leading-7 text-muted sm:text-base">{description}</p>
      </div>
    </div>
  );
}

function LeaderboardCard<T, K extends keyof T>({
  title,
  rows,
  metricKey,
  formatter,
  subtitle,
}: {
  title: string;
  rows: T[];
  metricKey: K;
  formatter: (value: number) => string;
  subtitle: (row: T) => string;
}) {
  return (
    <SurfaceCard className="h-full" title={title} eyebrow="Leaderboard">
      <div className="space-y-3">
        {rows.map((row, index) => {
          const label =
            typeof row === "object" && row !== null && "player" in row
              ? String(row.player)
              : typeof row === "object" && row !== null && "team" in row
                ? String(row.team)
                : "";
          return (
            <div
              key={`${label}-${index}`}
              className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-line bg-white/5 px-4 py-3"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-brand-strong">#{index + 1}</p>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted">{subtitle(row)}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-3xl uppercase text-foreground">
                  {formatter(Number(row[metricKey] ?? 0))}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

function TeamLogSummary({ team }: { team: TeamAnalyticsRecord }) {
  return (
    <details className="rounded-[1.6rem] border border-line bg-white/5 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-foreground">{team.team}</p>
            <p className="text-sm text-muted">
              {team.points} pts • {team.wins}-{team.draws}-{team.losses} • {team.goalDifference >= 0 ? "+" : ""}
              {team.goalDifference} GD
            </p>
          </div>
          <Pill tone="default">{formatResultPills(team.lastFive)}</Pill>
        </div>
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.24em] text-muted">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Opp</th>
              <th className="px-2 py-2">Venue</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {team.gameLog.slice(-8).reverse().map((entry: TeamGameLogEntry) => (
              <tr key={`${team.team}-${entry.matchKey}`} className="border-t border-line/60 text-foreground">
                <td className="px-2 py-2">{entry.date}</td>
                <td className="px-2 py-2">{entry.opponent}</td>
                <td className="px-2 py-2">{entry.venue}</td>
                <td className="px-2 py-2">
                  {entry.goalsFor === null || entry.goalsAgainst === null
                    ? "TBD"
                    : `${entry.goalsFor}-${entry.goalsAgainst}`}
                </td>
                <td className="px-2 py-2">{entry.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CompactLeaderboardCard({
  eyebrow,
  title,
  description,
  rows,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rows: Array<{ label: string; sublabel: string; value: string; meta?: string }>;
}) {
  return (
    <SurfaceCard eyebrow={eyebrow} title={title} description={description}>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={`${title}-${row.label}-${index}`}
            className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-line bg-white/5 px-4 py-3"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-brand-strong">#{index + 1}</p>
              <p className="text-sm font-semibold text-foreground">{row.label}</p>
              <p className="text-xs text-muted">{row.sublabel}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl uppercase text-foreground">{row.value}</p>
              {row.meta ? <p className="text-xs text-muted">{row.meta}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function OfficialPlayerLogCard({
  player,
}: {
  player: PredictiveHubData["official"]["currentPlayerLogs"][number];
}) {
  return (
    <details className="rounded-[1.6rem] border border-line bg-white/5 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-foreground">{player.player}</p>
            <p className="text-sm text-muted">
              {player.team} • {player.role} • {formatInteger(player.gamesPlayed)} GP • {formatInteger(player.minutesPlayed)} mins
            </p>
          </div>
          <Pill tone="brand">{formatDecimal(player.xg)} xG</Pill>
        </div>
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.24em] text-muted">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Opp</th>
              <th className="px-2 py-2">Venue</th>
              <th className="px-2 py-2">Result</th>
              <th className="px-2 py-2">Mins</th>
              <th className="px-2 py-2">G+A</th>
              <th className="px-2 py-2">xG</th>
              <th className="px-2 py-2">Passes</th>
              <th className="px-2 py-2">Tkl Won</th>
            </tr>
          </thead>
          <tbody>
            {player.recentMatches.map((match) => (
              <tr
                key={`${player.playerId}-${match.matchDateUtc}-${match.opponentTeamName}`}
                className="border-t border-line/60 text-foreground"
              >
                <td className="px-2 py-2">{formatShortDate(match.matchDateUtc)}</td>
                <td className="px-2 py-2">{match.opponentTeamName}</td>
                <td className="px-2 py-2">{match.venue}</td>
                <td className="px-2 py-2">
                  {match.result} {match.goalsFor}-{match.goalsAgainst}
                </td>
                <td className="px-2 py-2">{formatInteger(match.minutesPlayed)}</td>
                <td className="px-2 py-2">{formatInteger(match.goals + match.assists)}</td>
                <td className="px-2 py-2">{formatDecimal(match.xg)}</td>
                <td className="px-2 py-2">{formatInteger(match.totalPasses)}</td>
                <td className="px-2 py-2">{formatInteger(match.tacklesWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function OfficialFixtureListCard({
  eyebrow,
  title,
  description,
  fixtures,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  fixtures: PredictiveHubData["official"]["recentFixtures"];
  emptyMessage: string;
}) {
  return (
    <SurfaceCard eyebrow={eyebrow} title={title} description={description}>
      {fixtures.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {fixtures.map((fixture) => (
            <div
              key={`${title}-${fixture.matchId}`}
              className="rounded-[1.4rem] border border-line bg-white/5 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {fixture.homeTeam} vs {fixture.awayTeam}
                  </p>
                  <p className="text-xs text-muted">{formatMatchDateTime(fixture.matchDateUtc)}</p>
                </div>
                <Pill tone={fixture.status === "FINISHED" ? "accent" : "brand"}>
                  {fixture.status === "FINISHED"
                    ? `${fixture.homeScore}-${fixture.awayScore}`
                    : fixture.status.replace(/_/g, " ")}
                </Pill>
              </div>
              <p className="mt-3 text-xs text-muted">
                {fixture.stadium || "Venue TBD"}
                {fixture.city ? ` • ${fixture.city}` : ""}
                {fixture.round ? ` • ${fixture.round}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}

function AnalyticsMatchupCard({ matchup }: { matchup: MatchupPreviewRecord }) {
  const favoriteIsHome = matchup.homeWinProb >= matchup.awayWinProb;
  const favoriteTeam = favoriteIsHome ? matchup.homeTeam : matchup.awayTeam;
  const favoriteProb = favoriteIsHome ? matchup.homeWinProb : matchup.awayWinProb;

  return (
    <SurfaceCard
      eyebrow={matchup.matchDateLabel}
      title={`${matchup.homeTeam} vs ${matchup.awayTeam}`}
      description={matchup.summary}
      tone={favoriteProb >= 0.56 ? "brand" : "default"}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Pill tone={favoriteProb >= 0.56 ? "brand" : "accent"}>
            {favoriteTeam} {formatProbability(favoriteProb)}
          </Pill>
          <Pill tone="default">{matchup.tempoLabel}</Pill>
          <Pill tone="default">{matchup.volatilityLabel}</Pill>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricLine label="Home / draw / away" value={`${formatProbability(matchup.homeWinProb)} / ${formatProbability(matchup.drawProb)} / ${formatProbability(matchup.awayWinProb)}`} />
          <MetricLine label="xG" value={`${matchup.lambdaHome.toFixed(1)} - ${matchup.lambdaAway.toFixed(1)}`} />
          <MetricLine label="Over 2.5 / BTTS" value={`${formatProbability(matchup.over25Prob)} / ${formatProbability(matchup.bttsYesProb)}`} />
          <MetricLine label="Clean sheets" value={`${formatProbability(matchup.homeCleanSheetProb)} / ${formatProbability(matchup.awayCleanSheetProb)}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {matchup.fairPrices.slice(0, 3).map((price) => (
            <Pill key={`${matchup.matchKey}-${price.label}`} tone="default">
              {price.label}: {price.decimalOdds.toFixed(2)}
            </Pill>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.3rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Home targets
            </p>
            <div className="mt-3 space-y-2">
              {matchup.homeTargets.slice(0, 2).map((player) => (
                <div key={`${matchup.matchKey}-${player.id}`} className="rounded-full border border-line px-4 py-2 text-sm text-foreground">
                  {player.player} • {player.projection.toFixed(1)}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.3rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Away targets
            </p>
            <div className="mt-3 space-y-2">
              {matchup.awayTargets.slice(0, 2).map((player) => (
                <div key={`${matchup.matchKey}-${player.id}`} className="rounded-full border border-line px-4 py-2 text-sm text-foreground">
                  {player.player} • {player.projection.toFixed(1)}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted">
          {matchup.angles.map((angle) => (
            <span key={`${matchup.matchKey}-${angle}`}>{angle}</span>
          ))}
        </div>
      </div>
    </SurfaceCard>
  );
}

export function AnalyticsHub({ data }: { data: PredictiveHubData }) {
  if (data.availableSeasons.length === 0) {
    return (
      <AppShell
        eyebrow="Research Hub"
        title="Research tools are on the way"
        description="We're still loading league data for this page. Check back once the latest season stats are available."
      >
        <EmptyState
          title="No research data available yet"
          description="Once season data is loaded, you'll be able to compare players, clubs, fixtures, and league trends here."
        />
      </AppShell>
    );
  }

  const quickReferenceGroups = [
    {
      title: "Forwards",
      rows: data.predictive.playerBoard
        .filter((player) => player.position === "FWD")
        .slice(0, 4),
    },
    {
      title: "Midfielders",
      rows: data.predictive.playerBoard
        .filter((player) => player.position === "MID")
        .slice(0, 4),
    },
    {
      title: "Defenders",
      rows: data.predictive.playerBoard
        .filter((player) => player.position === "DEF")
        .slice(0, 4),
    },
    {
      title: "Goalkeepers",
      rows: data.predictive.playerBoard
        .filter((player) => player.position === "GK")
        .slice(0, 4),
    },
  ];

  const predictiveLeaders = data.predictive.playerBoard.slice(0, 18);
  const predictiveMatchups = data.predictive.matchups.slice(0, 6);
  const fairPriceRows = data.predictive.matchups.slice(0, 4).flatMap((matchup) =>
    matchup.fairPrices.slice(0, 2).map((price) => ({
      matchup,
      price,
    }))
  );
  const topTeams = data.teams.slice(0, 8);
  const officialArchiveRows = data.official.archive.slice(0, 6);
  const officialStandings = data.official.standings.slice(0, 8);
  const officialPlayerLeaders = data.official.playerLeaders.slice(0, 12);
  const officialRecentFixtures = data.official.recentFixtures.slice(0, 6);
  const officialUpcomingFixtures = data.official.upcomingFixtures.slice(0, 6);
  const statsbombPlayerRows = data.statsbomb.playerXgLeaders.map((row) => ({
    label: row.label,
    sublabel: row.team,
    value: formatDecimal(row.value),
    meta: `${formatInteger(row.secondaryValue)} G • ${formatInteger(row.tertiaryValue)} shots`,
  }));
  const statsbombTeamRows = data.statsbomb.teamXgLeaders.map((row) => ({
    label: row.label,
    sublabel: "2018 season sample",
    value: formatDecimal(row.value),
    meta: `${formatInteger(row.secondaryValue)} G • ${formatInteger(row.tertiaryValue)} shots`,
  }));
  const nwslrScorerRows = data.nwslr.careerScorers.map((row) => ({
    label: row.label,
    sublabel: `${row.team} • 2013-2019 archive`,
    value: formatInteger(row.value),
    meta: `${formatInteger(row.secondaryValue)} matches`,
  }));
  const nwslrPlaymakerRows = data.nwslr.careerPlaymakers.map((row) => ({
    label: row.label,
    sublabel: `${row.team} • 2013-2019 archive`,
    value: formatInteger(row.value),
    meta: `${formatInteger(row.secondaryValue)} matches`,
  }));
  const nwslrKeeperRows = data.nwslr.careerKeepers.map((row) => ({
    label: row.label,
    sublabel: `${row.team} • 2013-2019 archive`,
    value: formatInteger(row.value),
    meta: `${formatInteger(row.secondaryValue)} saves`,
  }));
  const nwslrBallWinnerRows = data.nwslr.archiveBallWinners.map((row) => ({
    label: row.label,
    sublabel: `${row.team} • 2016-2019 archive`,
    value: formatInteger(row.value),
    meta: `${formatInteger(row.secondaryValue)} minutes`,
  }));
  const sourcePills = (
    <div className="flex flex-wrap gap-2">
      {data.dataSources.map((source) => (
        <Pill key={source} tone="default">
          {formatSourceLabel(source)}
        </Pill>
      ))}
    </div>
  );

  const seasonLinks = (
    <div className="flex flex-wrap gap-2">
      {data.availableSeasons.map((season) => (
        <Link
          key={season}
          href={`/analytics?season=${season}`}
          className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${
            season === data.season
              ? "border-brand bg-brand text-white"
              : "border-line bg-white/6 text-foreground hover:border-brand-strong/40 hover:bg-white/10"
          }`}
        >
          {season}
        </Link>
      ))}
    </div>
  );

  return (
    <AppShell
      eyebrow="Research Hub"
      title={`${data.season} NWSL research hub`}
      description="Use player form, team strength, fixtures, and league trends to build sharper fantasy projections, betting reads, and matchup previews."
      actions={
        <div className="space-y-3">
          {seasonLinks}
          {sourcePills}
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard
          eyebrow="At a glance"
          title="Built for picks, projections, and previews"
          description="Move from player targets to team form, matchup edges, and historical context without leaving the page."
          tone="brand"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricLine label="Players tracked" value={formatInteger(data.players.length)} />
            <MetricLine label="Teams tracked" value={formatInteger(data.teams.length)} />
            <MetricLine label="Goalkeepers tracked" value={formatInteger(data.goalkeepers.length)} />
            <MetricLine label="Matches tracked" value={formatInteger(data.fixtures.length)} />
          </div>
        </SurfaceCard>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={`#${item.id}`}
              className="group rounded-[1.8rem] border border-line bg-panel px-5 py-5 transition hover:-translate-y-0.5 hover:border-brand-strong/40 hover:bg-white/8"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-brand-strong">
                    Jump to
                  </p>
                  <h2 className="font-display text-2xl uppercase leading-tight text-foreground">
                    {item.title}
                  </h2>
                </div>
                <ArrowUpRight className="size-5 text-brand-strong transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="player-overview" className="space-y-5">
        <SectionHeader
          eyebrow="Players"
          title="Projection board"
          description="This is the consumer-facing board: matchup-adjusted fantasy projections, floor/ceiling ranges, and the role notes behind them."
        />
        <SurfaceCard title="Top projected players" description="The next-slate board blends historical fantasy output with the current team environment, role stability, clean-sheet equity, and projected pace.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Player</th>
                  <th className="px-2 py-3">Team</th>
                  <th className="px-2 py-3">Opp</th>
                  <th className="px-2 py-3">Proj</th>
                  <th className="px-2 py-3">Floor</th>
                  <th className="px-2 py-3">Ceiling</th>
                  <th className="px-2 py-3">Value</th>
                  <th className="px-2 py-3">Confidence</th>
                  <th className="px-2 py-3">Tag</th>
                </tr>
              </thead>
              <tbody>
                {predictiveLeaders.map((player) => (
                  <tr key={player.id} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3">
                      <div>
                        <p className="font-semibold">{player.player}</p>
                        <p className="text-xs text-muted">
                          {player.position} • {player.reasons[0] ?? player.trendLabel}
                        </p>
                      </div>
                    </td>
                    <td className="px-2 py-3">{player.team}</td>
                    <td className="px-2 py-3">{player.opponent ?? "TBD"}</td>
                    <td className="px-2 py-3 font-semibold">{player.projection.toFixed(1)}</td>
                    <td className="px-2 py-3">{player.floor.toFixed(1)}</td>
                    <td className="px-2 py-3">{player.ceiling.toFixed(1)}</td>
                    <td className="px-2 py-3">{player.valueScore.toFixed(2)}</td>
                    <td className="px-2 py-3">{formatProbability(player.confidence)}</td>
                    <td className="px-2 py-3">
                      <Pill tone="default">{player.matchupTag}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </section>

      <section id="player-quick-reference" className="space-y-5">
        <SectionHeader
          eyebrow="Players"
          title="Fantasy targets"
          description="Position-by-position quick lists for lineup builds, props, and same-day research."
        />
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          {quickReferenceGroups.map((group) => (
            <SurfaceCard
              key={group.title}
              eyebrow="Quick reference"
              title={group.title}
              description="Four names worth checking before you lock anything in."
            >
              <div className="space-y-3">
                {group.rows.map((player) => (
                  <div
                    key={player.id}
                    className="rounded-[1.5rem] border border-line bg-white/6 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{player.player}</p>
                        <p className="text-xs text-muted">
                          {player.team} • {player.position}
                        </p>
                      </div>
                      <Pill tone={player.position === "GK" ? "accent" : "brand"}>
                        {player.projection.toFixed(1)}
                      </Pill>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <MetricLine label="Floor / ceiling" value={`${player.floor.toFixed(1)} / ${player.ceiling.toFixed(1)}`} />
                      <MetricLine
                        label={player.position === "GK" ? "Clean sheet" : "Value"}
                        value={
                          player.position === "GK" && player.cleanSheetChance != null
                            ? formatProbability(player.cleanSheetChance)
                            : player.valueScore.toFixed(2)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section id="player-game-log" className="space-y-5">
        <SectionHeader
          eyebrow="Players"
          title="Form and minutes"
          description="See who is holding minutes, staying involved, and carrying usable form into the next matchday."
        />
        {data.official.currentPlayerLogs.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.official.currentPlayerLogs.map((player) => (
              <OfficialPlayerLogCard key={`official-log-${player.playerId}`} player={player} />
            ))}
          </div>
        ) : null}
        <SurfaceCard title="Usage board" description="Minutes-and-role context for the rest of the player pool.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Player</th>
                  <th className="px-2 py-3">Team</th>
                  <th className="px-2 py-3">Starts</th>
                  <th className="px-2 py-3">90s</th>
                  <th className="px-2 py-3">Pts/Game</th>
                  <th className="px-2 py-3">+/- per 90</th>
                  <th className="px-2 py-3">Usage</th>
                </tr>
              </thead>
              <tbody>
                {data.playerUsageBoard.map((player) => (
                  <tr key={`usage-${player.key}`} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3 font-semibold">{player.player}</td>
                    <td className="px-2 py-3">{player.team}</td>
                    <td className="px-2 py-3">{formatInteger(player.starts)}</td>
                    <td className="px-2 py-3">{formatDecimal(player.minutes90)}</td>
                    <td className="px-2 py-3">{formatDecimal(player.pointsPerGame)}</td>
                    <td className="px-2 py-3">{formatSigned(player.plusMinusPer90)}</td>
                    <td className="px-2 py-3 font-semibold">{formatSigned(player.usageIndex)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </section>

      <section id="player-leaders" className="space-y-5">
        <SectionHeader
          eyebrow="Players"
          title="Player edges"
          description="The fastest way to find the names driving fantasy ceilings, prop volume, and all-around production."
        />
        <div className="grid gap-5 xl:grid-cols-3">
          {PLAYER_LEADER_METRICS.map((metric) => (
            <LeaderboardCard
              key={metric.title}
              title={metric.title}
              rows={topRows(
                data.players,
                metric.key,
                5,
                (player) => Number(player.minutes90) >= 5 || Number(player.goalkeeperMinutes90) >= 4
              )}
              metricKey={metric.key}
              formatter={metric.formatter}
              subtitle={(row) => `${String(row.team)} • ${String(row.position)}`}
            />
          ))}
        </div>
      </section>

      <section id="team-overview" className="space-y-5">
        <SectionHeader
          eyebrow="Teams"
          title="Team ratings"
          description="A team-level read on strength, style, and lineup stability before you price the matchup."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          {topTeams.map((team) => (
            <SurfaceCard
              key={team.team}
              eyebrow="Club profile"
              title={team.team}
              description={`${team.points} points • ${team.wins}-${team.draws}-${team.losses} • ${team.lastFive ? `last five ${formatResultPills(team.lastFive)}` : "season profile"}`}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricLine label="Overall" value={formatSigned(team.overallIndex)} />
                <MetricLine label="Possession" value={formatPercent(team.possession)} />
                <MetricLine label="Goals/90" value={formatDecimal(team.goalsPer90)} />
                <MetricLine label="GA/90" value={formatDecimal(team.goalsAgainstPer90)} />
              </div>
              <details className="mt-4 rounded-[1.5rem] border border-line bg-white/6 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  Roster by minutes
                </summary>
                <div className="mt-4 grid gap-2">
                  {team.roster.slice(0, 10).map((player) => (
                    <div
                      key={`roster-${team.team}-${player.key}`}
                      className="flex items-center justify-between gap-4 rounded-full border border-line px-4 py-2 text-sm"
                    >
                      <span className="text-foreground">{player.player}</span>
                      <span className="text-muted">
                        {player.position} • {formatDecimal(player.minutes90)} 90s
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section id="team-offense" className="space-y-5">
        <SectionHeader
          eyebrow="Teams"
          title="Attack signals"
          description="Compare the clubs most likely to generate shots, chances, and strong fantasy scoring environments."
        />
        <SurfaceCard title="Offense board" description="A quick ranking of the league's most dangerous attacking environments.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Team</th>
                  <th className="px-2 py-3">Goals/90</th>
                  <th className="px-2 py-3">Shots/90</th>
                  <th className="px-2 py-3">SCA/90</th>
                  <th className="px-2 py-3">GCA/90</th>
                  <th className="px-2 py-3">Passes to final 3rd</th>
                  <th className="px-2 py-3">Offense</th>
                </tr>
              </thead>
              <tbody>
                {topRows(data.teams, "offenseIndex", data.teams.length).map((team) => (
                  <tr key={`offense-${team.team}`} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3 font-semibold">{team.team}</td>
                    <td className="px-2 py-3">{formatDecimal(team.goalsPer90)}</td>
                    <td className="px-2 py-3">{formatDecimal(team.shotsPer90)}</td>
                    <td className="px-2 py-3">{formatDecimal(team.scaPer90)}</td>
                    <td className="px-2 py-3">{formatDecimal(team.gcaPer90)}</td>
                    <td className="px-2 py-3">{formatInteger(team.passesIntoFinalThird)}</td>
                    <td className="px-2 py-3 font-semibold">{formatSigned(team.offenseIndex)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </section>

      <section id="team-defense" className="space-y-5">
        <SectionHeader
          eyebrow="Teams"
          title="Defense signals"
          description="See which clubs limit danger, protect clean-sheet chances, and lower opponent ceilings."
        />
        <SurfaceCard title="Defense board" description="A quick ranking of the teams most likely to make life difficult for opponents.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Team</th>
                  <th className="px-2 py-3">GA/90</th>
                  <th className="px-2 py-3">Save %</th>
                  <th className="px-2 py-3">Clean sheet %</th>
                  <th className="px-2 py-3">Interceptions</th>
                  <th className="px-2 py-3">Errors</th>
                  <th className="px-2 py-3">Defense</th>
                </tr>
              </thead>
              <tbody>
                {topRows(data.teams, "defenseIndex", data.teams.length).map((team) => (
                  <tr key={`defense-${team.team}`} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3 font-semibold">{team.team}</td>
                    <td className="px-2 py-3">{formatDecimal(team.goalsAgainstPer90)}</td>
                    <td className="px-2 py-3">{formatPercent(team.savePct)}</td>
                    <td className="px-2 py-3">{formatPercent(team.cleanSheetsPct)}</td>
                    <td className="px-2 py-3">{formatInteger(team.interceptions)}</td>
                    <td className="px-2 py-3">{formatInteger(team.errors)}</td>
                    <td className="px-2 py-3 font-semibold">{formatSigned(team.defenseIndex)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </section>

      <section id="team-leaders" className="space-y-5">
        <SectionHeader
          eyebrow="Teams"
          title="Team edges"
          description="Quick-hit leaderboards for the strongest teams in attack, defense, and overall matchup strength."
        />
        <div className="grid gap-5 xl:grid-cols-3">
          {TEAM_LEADER_METRICS.map((metric) => (
            <LeaderboardCard
              key={metric.title}
              title={metric.title}
              rows={topRows(data.teams, metric.key, 5)}
              metricKey={metric.key}
              formatter={metric.formatter}
              subtitle={(row) => `${String(row.points)} pts • ${String(row.lastFive || "no recent form")}`}
            />
          ))}
        </div>
      </section>

      <section id="team-game-log" className="space-y-5">
        <SectionHeader
          eyebrow="Teams"
          title="Club results"
          description="Every club's recent scorelines, venues, and results in one easy scan before preview work."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {data.teams.map((team) => (
            <TeamLogSummary key={`log-${team.team}`} team={team} />
          ))}
        </div>
      </section>

      <section id="game-preview" className="space-y-5">
        <SectionHeader
          eyebrow="Matches"
          title="Matchup previews"
          description="This is the pre-match layer: win probabilities, fair prices, projected totals, clean-sheet odds, and the top player targets in each game."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          {predictiveMatchups.map((matchup) => (
            <AnalyticsMatchupCard key={`predictive-${matchup.matchKey}`} matchup={matchup} />
          ))}
        </div>
        <SurfaceCard
          eyebrow="Fair price board"
          title="Quick research prices"
          description="Model prices to compare against sportsbook numbers before you place a bet or build a same-game stack."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Matchup</th>
                  <th className="px-2 py-3">Market</th>
                  <th className="px-2 py-3">Prob</th>
                  <th className="px-2 py-3">Fair decimal</th>
                  <th className="px-2 py-3">Fair American</th>
                </tr>
              </thead>
              <tbody>
                {fairPriceRows.map(({ matchup, price }) => (
                  <tr
                    key={`${matchup.matchKey}-${price.label}`}
                    className="border-t border-line/60 text-foreground"
                  >
                    <td className="px-2 py-3 font-semibold">
                      {matchup.homeTeam} vs {matchup.awayTeam}
                    </td>
                    <td className="px-2 py-3">{price.label}</td>
                    <td className="px-2 py-3">{formatProbability(price.probability)}</td>
                    <td className="px-2 py-3">{price.decimalOdds.toFixed(2)}</td>
                    <td className="px-2 py-3">{price.americanOdds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Link href="/matchups" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-strong">
              Open full matchup board
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section id="game-recap" className="space-y-5">
        <SectionHeader
          eyebrow="Matches"
          title="Result recaps"
          description="Catch the latest scorelines and see whether the pre-match angle held up."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          {data.recentRecaps.map((fixture) => (
            <SurfaceCard
              key={`recap-${fixture.matchKey}`}
              eyebrow={fixture.dateLabel}
              title={`${fixture.homeTeam} ${fixture.resultLabel} ${fixture.awayTeam}`}
              description={`${fixture.recapTag} • ${fixture.profileEdge}`}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricLine label="Venue" value={fixture.venue ?? "TBD"} />
                <MetricLine label="Attendance" value={fixture.attendance ? formatInteger(fixture.attendance) : "N/A"} />
                <MetricLine label="Round" value={fixture.round ?? "Regular season"} />
                <MetricLine label="Winner" value={fixture.winner ?? "TBD"} />
              </div>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section id="official-live" className="space-y-5">
        <SectionHeader
          eyebrow="Live View"
          title="Standings and fixtures"
          description={`Track standings, leaders, recent results, and the next fixtures for ${data.official.selectedSeason ?? "this season"}, with recent player logs from ${data.official.latestSeason ?? "the latest campaign"}.`}
        />
        <div className="grid gap-5 xl:grid-cols-2">
          <SurfaceCard
            eyebrow="Standings"
            title={`${data.official.selectedSeason ?? "Current"} table`}
            description="Table context for form, urgency, and matchup pressure."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                  <tr>
                    <th className="px-2 py-3">Team</th>
                    <th className="px-2 py-3">Pts</th>
                    <th className="px-2 py-3">W-D-L</th>
                    <th className="px-2 py-3">GD</th>
                    <th className="px-2 py-3">Poss</th>
                    <th className="px-2 py-3">Pass %</th>
                  </tr>
                </thead>
                <tbody>
                  {officialStandings.map((team) => (
                    <tr key={`official-standings-${team.team}`} className="border-t border-line/60 text-foreground">
                      <td className="px-2 py-3 font-semibold">{team.team}</td>
                      <td className="px-2 py-3">{formatInteger(team.points)}</td>
                      <td className="px-2 py-3">
                        {formatInteger(team.wins)}-{formatInteger(team.draws)}-{formatInteger(team.losses)}
                      </td>
                      <td className="px-2 py-3">{formatSignedInteger(team.goalDifference)}</td>
                      <td className="px-2 py-3">{formatPercent(team.possession)}</td>
                      <td className="px-2 py-3">{formatPercent(team.passAccuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Leaders"
            title={`${data.official.selectedSeason ?? "Current"} player leaders`}
            description="The official leaders driving goals, assists, xG, passing volume, and defensive work."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                  <tr>
                    <th className="px-2 py-3">Player</th>
                    <th className="px-2 py-3">Team</th>
                    <th className="px-2 py-3">Role</th>
                    <th className="px-2 py-3">G</th>
                    <th className="px-2 py-3">A</th>
                    <th className="px-2 py-3">xG</th>
                    <th className="px-2 py-3">Passes</th>
                    <th className="px-2 py-3">Tkl Won</th>
                  </tr>
                </thead>
                <tbody>
                  {officialPlayerLeaders.map((player) => (
                    <tr key={`official-player-${player.playerId}`} className="border-t border-line/60 text-foreground">
                      <td className="px-2 py-3 font-semibold">{player.player}</td>
                      <td className="px-2 py-3">{player.team}</td>
                      <td className="px-2 py-3">{player.role}</td>
                      <td className="px-2 py-3">{formatInteger(player.goals)}</td>
                      <td className="px-2 py-3">{formatInteger(player.assists)}</td>
                      <td className="px-2 py-3">{formatDecimal(player.xg)}</td>
                      <td className="px-2 py-3">{formatInteger(player.totalPasses)}</td>
                      <td className="px-2 py-3">{formatInteger(player.tacklesWon)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <OfficialFixtureListCard
            eyebrow="Results"
            title={`${data.official.selectedSeason ?? "Current"} recent official fixtures`}
            description="The latest finals feeding your form read."
            fixtures={officialRecentFixtures}
            emptyMessage="Final scores will show up here once this season gets underway."
          />
          <OfficialFixtureListCard
            eyebrow="Schedule"
            title={`${data.official.selectedSeason ?? "Current"} upcoming official fixtures`}
            description="The next matches on the board."
            fixtures={officialUpcomingFixtures}
            emptyMessage="There are no upcoming matches listed for this season right now."
          />
        </div>
      </section>

      <section id="goalkeepers" className="space-y-5">
        <SectionHeader
          eyebrow="Goalkeepers"
          title="Keeper outlook"
          description="Save volume, clean-sheet chances, and goals allowed for fantasy builds and prop research."
        />
        <SurfaceCard title="Goalkeeper board" description="A clear ranking of the keepers most likely to matter on the slate.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Keeper</th>
                  <th className="px-2 py-3">Team</th>
                  <th className="px-2 py-3">90s</th>
                  <th className="px-2 py-3">Save %</th>
                  <th className="px-2 py-3">CS %</th>
                  <th className="px-2 py-3">GA/90</th>
                  <th className="px-2 py-3">Index</th>
                </tr>
              </thead>
              <tbody>
                {topRows(
                  data.goalkeepers,
                  "goalkeeperIndex",
                  data.goalkeepers.length,
                  (keeper) => Number(keeper.goalkeeperMinutes90) >= 4
                ).map((keeper) => (
                  <tr key={`gk-${keeper.key}`} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3 font-semibold">{keeper.player}</td>
                    <td className="px-2 py-3">{keeper.team}</td>
                    <td className="px-2 py-3">{formatDecimal(keeper.goalkeeperMinutes90)}</td>
                    <td className="px-2 py-3">{formatPercent(keeper.savePct)}</td>
                    <td className="px-2 py-3">{formatPercent(keeper.cleanSheetsPct)}</td>
                    <td className="px-2 py-3">{formatDecimal(keeper.goalsAgainstPer90)}</td>
                    <td className="px-2 py-3 font-semibold">{formatSigned(keeper.goalkeeperIndex)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </section>

      <section id="glossary" className="space-y-5">
        <SectionHeader
          eyebrow="Glossary"
          title="Model notes"
          description="Plain-English definitions for the scores and stats behind the projections and previews."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          {data.glossary.map((entry) => (
            <SurfaceCard
              key={entry.term}
              eyebrow="Definition"
              title={entry.term}
              description={entry.definition}
            >
              <div className="flex items-center gap-3 text-sm text-muted">
                <BookOpenText className="size-4" />
                Built from season-long league data used throughout the models and previews on this page.
              </div>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section id="historical-archive" className="space-y-5">
        <SectionHeader
          eyebrow="Archive"
          title="Historical baselines"
          description="Use league history as context for team strength, player roles, and long-run production."
        />
        <div className="grid gap-5 xl:grid-cols-4">
          <SurfaceCard eyebrow="Seasons" title={`${data.official.archive.length} seasons tracked`} description="Season snapshots currently available for historical context.">
            <MetricLine label="Latest season" value={String(data.official.latestSeason ?? "N/A")} />
          </SurfaceCard>
          <SurfaceCard eyebrow="Clubs" title={`${formatInteger(data.nwslr.franchiseCount)} club history records`} description="Franchise history and naming across earlier seasons." />
          <SurfaceCard eyebrow="Venues" title={`${formatInteger(data.nwslr.stadiumCount)} stadium records`} description="Venue history across earlier league seasons." />
          <SurfaceCard eyebrow="Awards" title={`${formatInteger(data.nwslr.awardCount)} award records`} description="Past award winners from earlier seasons." />
        </div>
        <SurfaceCard
          eyebrow="Season by season"
          title="League snapshot"
          description="A year-by-year look at the team on top and the player who led the scoring race."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Season</th>
                  <th className="px-2 py-3">Teams</th>
                  <th className="px-2 py-3">Matches</th>
                  <th className="px-2 py-3">Completed</th>
                  <th className="px-2 py-3">Top team</th>
                  <th className="px-2 py-3">Top scorer</th>
                </tr>
              </thead>
              <tbody>
                {officialArchiveRows.map((season) => (
                  <tr key={`official-archive-${season.season}`} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3 font-semibold">{season.season}</td>
                    <td className="px-2 py-3">{formatInteger(season.teams)}</td>
                    <td className="px-2 py-3">{formatInteger(season.matches)}</td>
                    <td className="px-2 py-3">{formatInteger(season.completedMatches)}</td>
                    <td className="px-2 py-3">
                      {season.topTeam} ({formatInteger(season.topTeamPoints)} pts)
                    </td>
                    <td className="px-2 py-3">
                      {season.topScorer} ({formatInteger(season.topScorerGoals)} G)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
        <div className="grid gap-5 xl:grid-cols-2">
          <CompactLeaderboardCard
            eyebrow="Archive"
            title="Archive goal scorers"
            description="The most productive scorers across earlier seasons."
            rows={nwslrScorerRows}
          />
          <CompactLeaderboardCard
            eyebrow="Archive"
            title="Archive playmakers"
            description="The players who created the most goals across earlier seasons."
            rows={nwslrPlaymakerRows}
          />
          <CompactLeaderboardCard
            eyebrow="Archive"
            title="Archive keepers"
            description="The keepers with the most shutouts across earlier seasons."
            rows={nwslrKeeperRows}
          />
          <CompactLeaderboardCard
            eyebrow="Archive"
            title="Archive ball-winners"
            description="The players who piled up recoveries, interceptions, and tackles."
            rows={nwslrBallWinnerRows}
          />
        </div>
      </section>

      <section id="open-data" className="space-y-5">
        <SectionHeader
          eyebrow="xG View"
          title="xG and shot quality"
          description="A closer look at shot quality and chance volume for matchup research and market context."
        />
        <div className="grid gap-5 xl:grid-cols-3">
          <CompactLeaderboardCard
            eyebrow="xG view"
            title="2018 player xG leaders"
            description="Players who generated the most xG in the event sample."
            rows={statsbombPlayerRows}
          />
          <CompactLeaderboardCard
            eyebrow="xG view"
            title="2018 team xG leaders"
            description="Teams that created the most xG in the event sample."
            rows={statsbombTeamRows}
          />
          <SurfaceCard
            eyebrow="xG view"
            title="Highest-chance matches"
            description="Matches with the biggest combined xG totals in the event sample."
          >
            <div className="space-y-3">
              {data.statsbomb.matchXgLeaders.map((match) => (
                <div
                  key={`statsbomb-match-${match.matchId}`}
                  className="rounded-[1.4rem] border border-line bg-white/5 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {match.homeTeam} {match.homeGoals}-{match.awayGoals} {match.awayTeam}
                      </p>
                      <p className="text-xs text-muted">{formatShortDate(match.matchDate)}</p>
                    </div>
                    <Pill tone="accent">{formatDecimal(match.totalXg)} xG</Pill>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {match.homeTeam}: {formatDecimal(match.homeXg)} xG • {match.awayTeam}: {formatDecimal(match.awayXg)} xG
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-4">
        <SurfaceCard
          eyebrow="Why it helps"
          title="Built for picks, projections, and previews"
          description="Use the hub to compare players, track form, pressure-test betting angles, and sharpen fantasy decisions."
          tone="accent"
        >
          <div className="space-y-3 text-sm text-white/82">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Player, club, and goalkeeper rankings
            </div>
            <div className="flex items-center gap-2">
              <Target className="size-4" />
              Team form, standings, and matchup context
            </div>
            <div className="flex items-center gap-2">
              <Shield className="size-4" />
              Recent player logs and fixture tracking
            </div>
            <div className="flex items-center gap-2">
              <CalendarRange className="size-4" />
              League history and chance-quality views
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Still growing"
          title="More depth coming"
          description="The next big step is deeper match-by-match history across more seasons, which will sharpen props, projections, and preview work."
        />
        <SurfaceCard
          eyebrow="Share it"
          title="Open the stats hub"
          description="Use the full page as a pre-lock scouting board or drop it into your league chat."
        >
          <Link
            href="/analytics"
            className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand px-5 py-3 text-sm font-semibold text-white"
          >
            Open stats hub
            <ArrowUpRight className="size-4" />
          </Link>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Model history"
          title={`${data.availableSeasons.length} recent seasons`}
          description={`Recent seasons currently span ${data.availableSeasons.join(", ")} with added historical context from ${data.official.archive.map((season) => season.season).join(", ")}.`}
        />
      </section>
    </AppShell>
  );
}
