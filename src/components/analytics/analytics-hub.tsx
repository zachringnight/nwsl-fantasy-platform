import Link from "next/link";
import { ArrowUpRight, BookOpenText, CalendarRange, Shield, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { Pill } from "@/components/ui/pill";
import type {
  FixtureAnalyticsRecord,
  TeamAnalyticsRecord,
  TeamGameLogEntry,
} from "@/lib/analytics/fbref";
import type { MultiSourceAnalyticsHubData } from "@/lib/analytics/hub";

const MENU_ITEMS = [
  {
    id: "player-overview",
    title: "Player Overview",
    description: "Two-way player profile table with finishing, creation, progression, and defending.",
  },
  {
    id: "player-quick-reference",
    title: "Player Quick Reference",
    description: "Position buckets that surface the most useful season-long profiles in one glance.",
  },
  {
    id: "player-game-log",
    title: "Player Game Log",
    description: "Season usage proxy built from starts, minutes, plus-minus, and points per game.",
  },
  {
    id: "player-leaders",
    title: "Stat Leaders (Players)",
    description: "Top performers across finishing, playmaking, progression, and defensive work.",
  },
  {
    id: "team-overview",
    title: "Team Overview & Roster",
    description: "Club-level strength, form, points, goal difference, and rotation profile by roster.",
  },
  {
    id: "team-offense",
    title: "Team Offensive Metrics",
    description: "Scoring pressure, creation volume, and progression profile across the league.",
  },
  {
    id: "team-defense",
    title: "Team Defensive Metrics",
    description: "Goals allowed, clean sheets, duel success, and defensive event profiles.",
  },
  {
    id: "team-leaders",
    title: "Stat Leaders (Teams)",
    description: "League-leading clubs by attack, defense, control, and season output.",
  },
  {
    id: "team-game-log",
    title: "Team Game Log",
    description: "Fixture-by-fixture ledger for every club with venue, scoreline, and result.",
  },
  {
    id: "game-preview",
    title: "Game Preview",
    description: "Fixture cards that compare both clubs’ season-long profiles before kickoff.",
  },
  {
    id: "game-recap",
    title: "Game Recap",
    description: "Recent scorelines, venue context, and whether the profile edge held up.",
  },
  {
    id: "goalkeepers",
    title: "Goalkeepers",
    description: "Shot-stopping, clean-sheet, and goalkeeper-only leaderboard view.",
  },
  {
    id: "glossary",
    title: "Glossary/Explainer",
    description: "Definitions for each composite score and how to read the pages above.",
  },
  {
    id: "official-live",
    title: "Official Live Data",
    description: "Current official leaders, standings, fixtures, and real player match logs from the league feed.",
  },
  {
    id: "historical-archive",
    title: "Historical Archive",
    description: "Season archive, franchise context, and nwslR historical leaderboards across older league eras.",
  },
  {
    id: "open-data",
    title: "Open Data Lens",
    description: "Event-level shot and xG summaries from StatsBomb Open Data for the 2018 season.",
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

function matchupTone(fixture: FixtureAnalyticsRecord) {
  if (fixture.profileEdge === "Even profile") return "default";
  return fixture.recapTag === "Upset" ? "accent" : "brand";
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
  player: MultiSourceAnalyticsHubData["official"]["currentPlayerLogs"][number];
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
  fixtures: MultiSourceAnalyticsHubData["official"]["recentFixtures"];
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

export function AnalyticsHub({ data }: { data: MultiSourceAnalyticsHubData }) {
  if (data.availableSeasons.length === 0) {
    return (
      <AppShell
        eyebrow="Analytics"
        title="No analytics data yet"
        description="Run the FBref scrape first so the hub has player, team, and fixture data to work with."
      >
        <EmptyState
          title="No FBref data found"
          description="The analytics hub reads from data/fbref. Add at least one season of player, team, and schedule CSVs to unlock the dashboards."
        />
      </AppShell>
    );
  }

  const topOverallPlayers = topRows(
    data.players,
    "overallIndex",
    18,
    (player) => Number(player.minutes90) >= 5
  );
  const quickReferenceGroups = [
    {
      title: "Forwards",
      rows: topRows(
        data.players,
        "overallIndex",
        4,
        (player) => player.positionGroup === "Forward" && Number(player.minutes90) >= 6
      ),
    },
    {
      title: "Midfielders",
      rows: topRows(
        data.players,
        "overallIndex",
        4,
        (player) => player.positionGroup === "Midfielder" && Number(player.minutes90) >= 6
      ),
    },
    {
      title: "Defenders",
      rows: topRows(
        data.players,
        "overallIndex",
        4,
        (player) => player.positionGroup === "Defender" && Number(player.minutes90) >= 6
      ),
    },
    {
      title: "Goalkeepers",
      rows: topRows(
        data.goalkeepers,
        "goalkeeperIndex",
        4,
        (player) => Number(player.goalkeeperMinutes90) >= 4
      ),
    },
  ];

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
    sublabel: "2018 open-data sample",
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
          {source}
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
      eyebrow="Analytics"
      title={`NWSL advanced stats hub ${data.season}`}
      description="A public-facing analytics surface modeled after the Tableau-style stats hub, now backed by FBref, the official NWSL API, nwslR historical tables, and StatsBomb Open Data."
      actions={
        <div className="space-y-3">
          {seasonLinks}
          {sourcePills}
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard
          eyebrow="Benchmark"
          title="Tableau-level shape"
          description="The menu mirrors the benchmark dashboard surface: player, team, game, keeper, and glossary views."
          tone="brand"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricLine label="Player rows" value={formatInteger(data.players.length)} />
            <MetricLine label="Team rows" value={formatInteger(data.teams.length)} />
            <MetricLine label="Goalkeeper rows" value={formatInteger(data.goalkeepers.length)} />
            <MetricLine label="Fixture rows" value={formatInteger(data.fixtures.length)} />
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
                    Analytics view
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
          title="Player overview"
          description="Season-wide player profiles blended from finishing, chance creation, ball progression, ball-winning, and workload."
        />
        <SurfaceCard title="Top overall profiles" description="Filtered to meaningful minute loads so the leaderboard stays useful.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-2 py-3">Player</th>
                  <th className="px-2 py-3">Team</th>
                  <th className="px-2 py-3">Pos</th>
                  <th className="px-2 py-3">90s</th>
                  <th className="px-2 py-3">G+A</th>
                  <th className="px-2 py-3">SCA/90</th>
                  <th className="px-2 py-3">Pass %</th>
                  <th className="px-2 py-3">Tkl Won</th>
                  <th className="px-2 py-3">Profile</th>
                  <th className="px-2 py-3">Overall</th>
                </tr>
              </thead>
              <tbody>
                {topOverallPlayers.map((player) => (
                  <tr key={player.key} className="border-t border-line/60 text-foreground">
                    <td className="px-2 py-3">
                      <div>
                        <p className="font-semibold">{player.player}</p>
                        <p className="text-xs text-muted">{player.profileBlurb}</p>
                      </div>
                    </td>
                    <td className="px-2 py-3">{player.team}</td>
                    <td className="px-2 py-3">{player.position}</td>
                    <td className="px-2 py-3">{formatDecimal(player.minutes90)}</td>
                    <td className="px-2 py-3">{formatInteger(player.goals + player.assists)}</td>
                    <td className="px-2 py-3">{formatDecimal(player.scaPer90)}</td>
                    <td className="px-2 py-3">{formatPercent(player.passesPct)}</td>
                    <td className="px-2 py-3">{formatInteger(player.tacklesWon)}</td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Pill tone="default">{player.positionGroup}</Pill>
                      </div>
                    </td>
                    <td className="px-2 py-3 font-semibold">{formatSigned(player.overallIndex)}</td>
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
          title="Player quick reference"
          description="Compact scout-board cards for the strongest season profiles at each position group."
        />
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          {quickReferenceGroups.map((group) => (
            <SurfaceCard
              key={group.title}
              eyebrow="Quick reference"
              title={group.title}
              description="Top four profiles by composite index."
            >
              <div className="space-y-3">
                {group.rows.map((player) => (
                  <div
                    key={player.key}
                    className="rounded-[1.5rem] border border-line bg-white/6 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{player.player}</p>
                        <p className="text-xs text-muted">
                          {player.team} • {player.position}
                        </p>
                      </div>
                      <Pill tone={player.isGoalkeeper ? "accent" : "brand"}>
                        {formatSigned(player.overallIndex)}
                      </Pill>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <MetricLine label="90s" value={formatDecimal(player.minutes90)} />
                      <MetricLine
                        label={player.isGoalkeeper ? "Save %" : "SCA/90"}
                        value={player.isGoalkeeper ? formatPercent(player.savePct) : formatDecimal(player.scaPer90)}
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
          title="Player game log"
          description="Official current-season player match logs are now live for heavy-minute players. The season usage proxy remains below as a fallback scouting view for the merged aggregate dataset."
        />
        {data.official.currentPlayerLogs.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.official.currentPlayerLogs.map((player) => (
              <OfficialPlayerLogCard key={`official-log-${player.playerId}`} player={player} />
            ))}
          </div>
        ) : null}
        <SurfaceCard title="Usage board" description="Best available proxy until event-level player game logs are ingested.">
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
          title="Stat leaders"
          description="Single-metric player leaderboards built from the merged season table."
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
          title="Team overview & roster"
          description="Club cards summarize style and season output, with rosters ranked by minutes underneath."
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
          title="Team offensive metrics"
          description="Attack-centric team comparison across scoring, shot volume, and creation pressure."
        />
        <SurfaceCard title="Offense board" description="Sorted by composite offense index.">
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
          title="Team defensive metrics"
          description="Defense-oriented comparison across goals allowed, duel success, interceptions, and goalkeeper support."
        />
        <SurfaceCard title="Defense board" description="Sorted by composite defense index.">
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
          title="Team stat leaders"
          description="Single-metric team leaderboards that complement the offense and defense tables."
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
          title="Team game log"
          description="Every club’s most recent fixture ledger with venue and result context."
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
          title="Game preview"
          description="Fixture cards compare club profile strength before kickoff. If the selected season is already complete, these cards run in replay mode."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          {data.previewFixtures.map((fixture) => (
            <SurfaceCard
              key={`preview-${fixture.matchKey}`}
              eyebrow={fixture.dateLabel}
              title={`${fixture.homeTeam} vs ${fixture.awayTeam}`}
              description={fixture.profileEdge}
              tone={matchupTone(fixture)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricLine label="Round" value={fixture.round ?? "Regular season"} />
                <MetricLine label="Venue" value={fixture.venue ?? "TBD"} />
                <MetricLine label="Referee" value={fixture.referee ?? "TBD"} />
                <MetricLine label="Result state" value={fixture.resultLabel} />
              </div>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section id="game-recap" className="space-y-5">
        <SectionHeader
          eyebrow="Matches"
          title="Game recap"
          description="Recent results with scoreline context and whether the season profile edge held."
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
          eyebrow="Official Feed"
          title="Official live data"
          description={`Direct league-feed coverage across ${data.official.archive.length} seasons, with standings, leaders, and fixture pulse for ${data.official.selectedSeason ?? "the selected season"} plus current-season player match logs for ${data.official.latestSeason ?? "the latest season"}.`}
        />
        <div className="grid gap-5 xl:grid-cols-2">
          <SurfaceCard
            eyebrow="Standings"
            title={`${data.official.selectedSeason ?? "Current"} table`}
            description="Derived from official team summaries, then sorted like a live league table."
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
            description="Official season leaderboard rows with minutes, xG, passing, and defensive volume."
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
            description="Most recent completed official fixtures from the selected season feed."
            fixtures={officialRecentFixtures}
            emptyMessage="No completed official fixtures are available for this season yet."
          />
          <OfficialFixtureListCard
            eyebrow="Schedule"
            title={`${data.official.selectedSeason ?? "Current"} upcoming official fixtures`}
            description="Next scheduled official fixtures from the selected season feed."
            fixtures={officialUpcomingFixtures}
            emptyMessage="No upcoming official fixtures are available in the selected season feed."
          />
        </div>
      </section>

      <section id="goalkeepers" className="space-y-5">
        <SectionHeader
          eyebrow="Goalkeepers"
          title="Goalkeepers"
          description="Goalkeeper-only board centered on shot-stopping, clean-sheet rate, and goals allowed."
        />
        <SurfaceCard title="Goalkeeper board" description="Sorted by goalkeeper index with meaningful workload filters.">
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
          title="Glossary & explainer"
          description="Definitions for the custom composite metrics used throughout the hub."
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
                Built from the currently ingested FBref columns in this repo.
              </div>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section id="historical-archive" className="space-y-5">
        <SectionHeader
          eyebrow="Archive"
          title="Historical archive"
          description="A league-history layer built from official season snapshots plus nwslR historical tables for older player and goalkeeper archive work."
        />
        <div className="grid gap-5 xl:grid-cols-4">
          <SurfaceCard eyebrow="Coverage" title={`${data.official.archive.length} official seasons`} description="Official season snapshots available in this repo.">
            <MetricLine label="Latest season" value={String(data.official.latestSeason ?? "N/A")} />
          </SurfaceCard>
          <SurfaceCard eyebrow="Franchises" title={`${formatInteger(data.nwslr.franchiseCount)} franchise rows`} description="Team-history and naming coverage from the nwslR archive." />
          <SurfaceCard eyebrow="Stadiums" title={`${formatInteger(data.nwslr.stadiumCount)} stadium rows`} description="Venue archive coverage from nwslR." />
          <SurfaceCard eyebrow="Awards" title={`${formatInteger(data.nwslr.awardCount)} award rows`} description="Historical award archive from nwslR." />
        </div>
        <SurfaceCard
          eyebrow="Season archive"
          title="Official season snapshot"
          description="Top team and top scorer by season from the official league feed."
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
            eyebrow="nwslR"
            title="Archive goal scorers"
            description="Career goals across the 2013-2019 nwslR field-player archive."
            rows={nwslrScorerRows}
          />
          <CompactLeaderboardCard
            eyebrow="nwslR"
            title="Archive playmakers"
            description="Career assists across the 2013-2019 nwslR field-player archive."
            rows={nwslrPlaymakerRows}
          />
          <CompactLeaderboardCard
            eyebrow="nwslR"
            title="Archive keepers"
            description="Clean-sheet leaders from the 2013-2019 nwslR goalkeeper archive."
            rows={nwslrKeeperRows}
          />
          <CompactLeaderboardCard
            eyebrow="nwslR"
            title="Archive ball-winners"
            description="Recoveries, interceptions, and tackles aggregated from nwslR advanced match stats."
            rows={nwslrBallWinnerRows}
          />
        </div>
      </section>

      <section id="open-data" className="space-y-5">
        <SectionHeader
          eyebrow="Open Data"
          title="Event-level lens"
          description="StatsBomb Open Data adds a true event-level xG sample for the 2018 NWSL season, which complements the broader aggregate feeds above."
        />
        <div className="grid gap-5 xl:grid-cols-3">
          <CompactLeaderboardCard
            eyebrow="StatsBomb"
            title="2018 player xG leaders"
            description="Highest total expected goals in the open-data season."
            rows={statsbombPlayerRows}
          />
          <CompactLeaderboardCard
            eyebrow="StatsBomb"
            title="2018 team xG leaders"
            description="Highest team-level xG totals in the open-data sample."
            rows={statsbombTeamRows}
          />
          <SurfaceCard
            eyebrow="StatsBomb"
            title="Highest-event matches"
            description="Open-data matches with the biggest combined xG totals."
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
          eyebrow="Source status"
          title="What’s live"
          description="The hub now combines FBref season aggregates, official NWSL season tables and logs, nwslR history, and StatsBomb open-event data."
          tone="accent"
        >
          <div className="space-y-3 text-sm text-white/82">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Public analytics hub route
            </div>
            <div className="flex items-center gap-2">
              <Target className="size-4" />
              Composite player and team scores
            </div>
            <div className="flex items-center gap-2">
              <Shield className="size-4" />
              Goalkeeper board and team defense tables
            </div>
            <div className="flex items-center gap-2">
              <CalendarRange className="size-4" />
              Fixture preview and recap cards
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Open gap"
          title="Remaining gap"
          description="The deepest remaining hole is multi-season player match logs outside the current official season plus broader public event data beyond the 2018 open-data sample."
        />
        <SurfaceCard
          eyebrow="Navigation"
          title="Open analytics"
          description="The route is public so you can share it as a scouting and storytelling surface."
        >
          <Link
            href="/analytics"
            className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand px-5 py-3 text-sm font-semibold text-white"
          >
            Open hub
            <ArrowUpRight className="size-4" />
          </Link>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Coverage"
          title={`${data.availableSeasons.length} FBref seasons`}
          description={`FBref seasons: ${data.availableSeasons.join(", ")}. Official archive seasons: ${data.official.archive.map((season) => season.season).join(", ")}.`}
        />
      </section>
    </AppShell>
  );
}
