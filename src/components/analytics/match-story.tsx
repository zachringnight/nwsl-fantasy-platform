import Link from "next/link";
import { LocalKickoffTime } from "@/components/analytics/local-kickoff-time";
import { StatComparisonBar } from "@/components/analytics/stat-comparison-bar";
import { MetricTile } from "@/components/ui/metric-tile";
import { getPlayerIdByName } from "@/lib/analytics/analytics-data";
import type {
  EspnLiveMatchEvent,
  EspnLiveMatchSnapshot,
  EspnLiveMatchStats,
  MatchStatPair,
} from "@/lib/analytics/espn-live-match";
import type {
  HeadToHeadEntry,
  MatchFormEntry,
  MatchNarrative,
  RankedStanding,
} from "@/lib/analytics/match-context";
import {
  analyticsMatchHref,
  analyticsPlayerHref,
  analyticsPredictionHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import type {
  MatchDetail,
  MatchPrediction,
} from "@/types/analytics";

interface MatchStoryProps {
  match: MatchDetail;
  phase: "prematch" | "live" | "final";
  snapshot: EspnLiveMatchSnapshot | null;
  prediction?: MatchPrediction;
  narrative: MatchNarrative;
  homeStanding?: RankedStanding;
  awayStanding?: RankedStanding;
  homeForm: MatchFormEntry[];
  awayForm: MatchFormEntry[];
  headToHead: HeadToHeadEntry[];
}

function NarrativeSection({
  narrative,
}: {
  narrative: MatchNarrative;
}) {
  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-foreground">
        {narrative.title}
      </h2>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-muted">
        {narrative.lead}
      </p>
      {narrative.sections.length > 0 ? (
        <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-2">
          {narrative.sections.map((section) => (
            <article key={section.title}>
              <h3 className="text-sm font-semibold text-brand-strong">
                {section.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {section.body}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function fallbackStats(match: MatchDetail): EspnLiveMatchStats | null {
  const hasStats =
    match.homeShots > 0 ||
    match.awayShots > 0 ||
    match.homeShotsOnTarget > 0 ||
    match.awayShotsOnTarget > 0;
  if (!hasStats) return null;
  const missing = (): MatchStatPair => ({ home: null, away: null });
  return {
    shots: { home: match.homeShots, away: match.awayShots },
    shotsOnTarget: {
      home: match.homeShotsOnTarget,
      away: match.awayShotsOnTarget,
    },
    possession: {
      home: match.homePossession,
      away: match.awayPossession,
    },
    corners: { home: match.homeCorners, away: match.awayCorners },
    fouls: { home: match.homeFouls, away: match.awayFouls },
    blockedShots: missing(),
    offsides: missing(),
    saves: missing(),
    passes: missing(),
    passAccuracy: missing(),
    tackles: missing(),
    interceptions: missing(),
    clearances: missing(),
    yellowCards: missing(),
    redCards: missing(),
  };
}

function MatchStatsSection({
  match,
  snapshot,
}: {
  match: MatchDetail;
  snapshot: EspnLiveMatchSnapshot | null;
}) {
  const stats = snapshot?.stats ?? fallbackStats(match);
  if (!stats) return null;

  const rows: Array<{
    key: keyof EspnLiveMatchStats;
    label: string;
    percentage?: boolean;
  }> = [
    { key: "possession", label: "Possession", percentage: true },
    { key: "shots", label: "Shots" },
    { key: "shotsOnTarget", label: "On target" },
    { key: "blockedShots", label: "Blocked shots" },
    { key: "corners", label: "Corners" },
    { key: "fouls", label: "Fouls" },
    { key: "offsides", label: "Offsides" },
    { key: "saves", label: "Saves" },
    { key: "passes", label: "Passes" },
    { key: "passAccuracy", label: "Pass accuracy", percentage: true },
    { key: "tackles", label: "Tackles" },
    { key: "interceptions", label: "Interceptions" },
    { key: "clearances", label: "Clearances" },
    { key: "yellowCards", label: "Yellow cards" },
    { key: "redCards", label: "Red cards" },
  ];
  const availableRows = rows.filter(({ key }) => {
    const pair = stats[key];
    return pair.home !== null && pair.away !== null;
  });
  if (availableRows.length === 0) return null;

  return (
    <section className="glass-card space-y-5 rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Match stats
        </h2>
        <span className="text-xs text-muted">Live data from ESPN</span>
      </div>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {availableRows.map(({ key, label, percentage }) => {
          const pair = stats[key];
          return (
            <StatComparisonBar
              key={key}
              label={label}
              homeValue={pair.home ?? 0}
              awayValue={pair.away ?? 0}
              format={
                percentage
                  ? (value) => `${value.toFixed(0)}%`
                  : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}

function fallbackEvents(match: MatchDetail): EspnLiveMatchEvent[] {
  return match.events.flatMap((event, index) =>
    event.type === "assist"
      ? []
      : [
          {
            id: `${event.minute}-${event.playerName}-${index}`,
            minute: event.minute * 60,
            minuteLabel: `${event.minute}'`,
            type: event.type,
            team: event.team,
            playerName: event.playerName,
            secondaryPlayerName: null,
            detail: event.detail ?? "",
          },
        ]
  );
}

function eventMark(type: EspnLiveMatchEvent["type"]): string {
  if (type === "goal") return "G";
  if (type === "yellow_card") return "Y";
  if (type === "red_card") return "R";
  return "S";
}

function MatchTimelineSection({
  match,
  snapshot,
}: {
  match: MatchDetail;
  snapshot: EspnLiveMatchSnapshot | null;
}) {
  const events =
    snapshot?.events.length ? snapshot.events : fallbackEvents(match);
  if (events.length === 0) return null;

  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Match timeline
      </h2>
      <div className="space-y-4">
        {events.map((event) => {
          const playerId = getPlayerIdByName(event.playerName);
          const eventTeamId =
            event.team === match.homeTeam ||
            event.team === snapshot?.homeTeam
              ? match.homeTeamId
              : event.team === match.awayTeam ||
                  event.team === snapshot?.awayTeam
                ? match.awayTeamId
                : null;
          return (
            <article
              key={event.id}
              className="grid grid-cols-[2.75rem_1.5rem_minmax(0,1fr)] items-start gap-3"
            >
              <span className="pt-0.5 text-right font-mono text-sm text-muted">
                {event.minuteLabel || "—"}
              </span>
              <span className="flex size-6 items-center justify-center rounded-full bg-brand-strong/20 text-xs text-foreground">
                {eventMark(event.type)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {playerId ? (
                    <Link
                      href={analyticsPlayerHref(playerId)}
                      className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {event.playerName}
                    </Link>
                  ) : (
                    event.playerName
                  )}
                  {eventTeamId ? (
                    <Link
                      href={analyticsTeamHref(eventTeamId)}
                      className="ml-2 text-xs font-normal text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {event.team}
                    </Link>
                  ) : event.team ? (
                    <span className="ml-2 text-xs font-normal text-muted">
                      {event.team}
                    </span>
                  ) : null}
                </p>
                {event.detail ? (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {event.detail}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MatchLineupsSection({
  match,
  snapshot,
}: {
  match: MatchDetail;
  snapshot: EspnLiveMatchSnapshot | null;
}) {
  if (!snapshot?.lineups.length) return null;

  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Confirmed lineups
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {snapshot.lineups.map((lineup) => {
          const teamId =
            lineup.teamName === snapshot.homeTeam
              ? match.homeTeamId
              : lineup.teamName === snapshot.awayTeam
                ? match.awayTeamId
                : null;
          return (
          <div key={lineup.teamName}>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              {teamId ? (
                <Link
                  href={analyticsTeamHref(teamId)}
                  className="font-semibold text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {lineup.teamName}
                </Link>
              ) : (
                <h3 className="font-semibold text-foreground">
                  {lineup.teamName}
                </h3>
              )}
              {lineup.formation ? (
                <span className="font-mono text-xs text-muted">
                  {lineup.formation}
                </span>
              ) : null}
            </div>
            <ol className="divide-y divide-line">
              {lineup.starters.map((player) => {
                const playerId = getPlayerIdByName(player.name);
                return (
                  <li
                    key={player.espnId ?? player.name}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <span className="w-6 font-mono text-xs text-muted">
                      {player.jersey ?? "—"}
                    </span>
                    {playerId ? (
                      <Link
                        href={analyticsPlayerHref(playerId)}
                        className="min-w-0 flex-1 truncate text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {player.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {player.name}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {player.position ?? ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          );
        })}
      </div>
    </section>
  );
}

function ModelPredictionSection({
  match,
  prediction,
  phase,
}: {
  match: MatchDetail;
  prediction?: MatchPrediction;
  phase: MatchStoryProps["phase"];
}) {
  if (!prediction) return null;

  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        {phase === "prematch" ? "Model prediction" : "Pre-match prediction"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile
          label={match.homeTeam}
          value={`${(prediction.homeProb * 100).toFixed(0)}%`}
          detail={`${prediction.lambdaHome.toFixed(1)} expected goals`}
          tone="brand"
        />
        <MetricTile
          label="Draw"
          value={`${(prediction.drawProb * 100).toFixed(0)}%`}
          detail={`${(prediction.bttsYesProb * 100).toFixed(0)}% both teams to score`}
        />
        <MetricTile
          label={match.awayTeam}
          value={`${(prediction.awayProb * 100).toFixed(0)}%`}
          detail={`${prediction.lambdaAway.toFixed(1)} expected goals`}
          tone="accent"
        />
      </div>
      <div className="mt-4">
        <Link
          href={analyticsPredictionHref(match.matchId)}
          className="text-sm text-brand-strong hover:underline"
        >
          View full prediction details
        </Link>
      </div>
    </section>
  );
}

function TeamComparisonSection({
  match,
  homeStanding,
  awayStanding,
}: {
  match: MatchDetail;
  homeStanding?: RankedStanding;
  awayStanding?: RankedStanding;
}) {
  if (!homeStanding && !awayStanding) return null;
  const tile = (
    teamName: string,
    teamId: string,
    ranked: RankedStanding | undefined,
    tone: "brand" | "accent"
  ) => (
    <Link
      href={analyticsTeamHref(teamId)}
      className="block rounded-[1.4rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
    >
      <MetricTile
        label={teamName}
        value={ranked ? `#${ranked.rank}` : "N/A"}
        detail={
          ranked
            ? `${ranked.standing.points} pts · ${ranked.standing.won}-${ranked.standing.drawn}-${ranked.standing.lost} · GD ${ranked.standing.goalDifference > 0 ? "+" : ""}${ranked.standing.goalDifference}`
            : "Current table data unavailable"
        }
        tone={tone}
      />
    </Link>
  );

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Team comparison
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {tile(
          match.homeTeam,
          match.homeTeamId,
          homeStanding,
          "brand"
        )}
        {tile(
          match.awayTeam,
          match.awayTeamId,
          awayStanding,
          "accent"
        )}
      </div>
    </section>
  );
}

function FormColumn({
  teamName,
  teamId,
  form,
}: {
  teamName: string;
  teamId: string;
  form: MatchFormEntry[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={analyticsTeamHref(teamId)}
          className="font-semibold text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
        >
          {teamName}
        </Link>
        <div className="flex gap-1" aria-label={`${teamName} recent form`}>
          {form.map((entry) => (
            <span
              key={entry.matchId}
              className={
                entry.result === "W"
                  ? "flex size-6 items-center justify-center rounded-full bg-success/15 text-xs font-semibold text-brand-lime"
                  : entry.result === "L"
                    ? "flex size-6 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
                    : "flex size-6 items-center justify-center rounded-full bg-white/8 text-xs font-semibold text-muted"
              }
            >
              {entry.result}
            </span>
          ))}
        </div>
      </div>
      {form.length ? (
        <div className="mt-3 divide-y divide-line">
          {form.map((entry) => (
            <div
              key={entry.matchId}
              className="flex items-center justify-between gap-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={analyticsMatchHref(entry.matchId)}
                  className="text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {entry.opponent}
                </Link>
                <p className="text-xs text-muted">{entry.date}</p>
              </div>
              <span className="shrink-0 font-mono text-foreground">
                {entry.goalsFor}-{entry.goalsAgainst}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No completed matches in this result window.
        </p>
      )}
    </div>
  );
}

function FormGuideSection({
  match,
  homeForm,
  awayForm,
}: {
  match: MatchDetail;
  homeForm: MatchFormEntry[];
  awayForm: MatchFormEntry[];
}) {
  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Recent form
      </h2>
      <div className="grid gap-8 md:grid-cols-2">
        <FormColumn
          teamName={match.homeTeam}
          teamId={match.homeTeamId}
          form={homeForm}
        />
        <FormColumn
          teamName={match.awayTeam}
          teamId={match.awayTeamId}
          form={awayForm}
        />
      </div>
    </section>
  );
}

function HeadToHeadSection({
  headToHead,
}: {
  headToHead: HeadToHeadEntry[];
}) {
  if (headToHead.length === 0) return null;
  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Head to head
      </h2>
      <div className="divide-y divide-line">
        {headToHead.map((meeting) => (
          <Link
            key={meeting.matchId}
            href={analyticsMatchHref(meeting.matchId)}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 text-sm transition hover:text-brand-strong"
          >
            <span className="truncate text-right">{meeting.homeTeam}</span>
            <span className="font-mono text-base font-semibold text-foreground">
              {meeting.homeGoals}-{meeting.awayGoals}
            </span>
            <span className="truncate">{meeting.awayTeam}</span>
            <span className="col-span-3 text-center text-xs text-muted">
              {meeting.date}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MatchInfoSection({
  match,
  snapshot,
  phase,
}: {
  match: MatchDetail;
  snapshot: EspnLiveMatchSnapshot | null;
  phase: MatchStoryProps["phase"];
}) {
  const venue = snapshot?.venue || match.venue || "TBD";
  const kickoff = snapshot?.kickoff ?? null;
  const status =
    phase === "final"
      ? "Full time"
      : phase === "live"
        ? snapshot?.statusLabel ?? "Live"
        : "Scheduled";

  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Match info
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Kickoff"
          value={
            <LocalKickoffTime value={kickoff} fallback={match.date} />
          }
        />
        <MetricTile
          label="Venue"
          value={venue}
          detail={snapshot?.city ?? undefined}
        />
        <MetricTile
          label="Status"
          value={status}
          detail={`Matchday ${match.matchday}`}
        />
        <MetricTile
          label={snapshot?.referee ? "Referee" : "Broadcast"}
          value={
            snapshot?.referee ??
            snapshot?.broadcasts.join(", ") ??
            "TBD"
          }
          detail={
            snapshot?.referee && snapshot.broadcasts.length
              ? snapshot.broadcasts.join(", ")
              : undefined
          }
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        Score, status, statistics, officials, broadcast, events, and confirmed
        lineups are read from ESPN when available. Model and form context come
        from the NWSL analytics pipeline.
      </p>
    </section>
  );
}

export function MatchStory({
  match,
  phase,
  snapshot,
  prediction,
  narrative,
  homeStanding,
  awayStanding,
  homeForm,
  awayForm,
  headToHead,
}: MatchStoryProps) {
  return (
    <>
      <NarrativeSection narrative={narrative} />

      {phase !== "prematch" ? (
        <>
          <MatchStatsSection match={match} snapshot={snapshot} />
          <MatchTimelineSection match={match} snapshot={snapshot} />
          <MatchLineupsSection match={match} snapshot={snapshot} />
        </>
      ) : null}

      <ModelPredictionSection
        match={match}
        prediction={prediction}
        phase={phase}
      />
      <TeamComparisonSection
        match={match}
        homeStanding={homeStanding}
        awayStanding={awayStanding}
      />
      <FormGuideSection
        match={match}
        homeForm={homeForm}
        awayForm={awayForm}
      />
      <HeadToHeadSection headToHead={headToHead} />
      <MatchInfoSection match={match} snapshot={snapshot} phase={phase} />
    </>
  );
}
