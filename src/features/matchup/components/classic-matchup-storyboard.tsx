import { Activity, ArrowUpRight, RadioTower, Waves } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { MatchupScoreCard } from "@/components/matchup/matchup-score-card";
import type {
  FantasyLeagueDetails,
  FantasyLeagueMatchupState,
  FantasyMatchupContribution,
} from "@/types/fantasy";

const contributionPositionOrder = ["GK", "DEF", "MID", "FWD"] as const;

function formatPoints(points: number) {
  const hasDecimal = Math.abs(points % 1) > 0.001;
  return points.toFixed(hasDecimal ? 1 : 0);
}

function buildContributionMix(
  contributions: FantasyMatchupContribution[],
  currentPoints: number
) {
  const totals = contributionPositionOrder.reduce<Record<(typeof contributionPositionOrder)[number], number>>(
    (accumulator, position) => {
      accumulator[position] = 0;
      return accumulator;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );

  contributions.forEach((contribution) => {
    totals[contribution.player_position] += contribution.fantasy_points;
  });

  return contributionPositionOrder
    .map((position) => ({
      position,
      points: totals[position],
      share:
        currentPoints > 0 ? Math.max(0, (totals[position] / currentPoints) * 100) : 0,
    }))
    .filter((entry) => entry.points > 0);
}

function ContributionColumn({
  contributions,
  currentPoints,
  isMySide,
  managerName,
  status,
  teamName,
}: {
  contributions: FantasyMatchupContribution[];
  currentPoints: number;
  isMySide: boolean;
  managerName: string;
  status: FantasyLeagueMatchupState["status"];
  teamName: string;
}) {
  const leadContributor = contributions[0];
  const contributionMix = buildContributionMix(contributions, currentPoints);

  return (
    <div className="space-y-3 rounded-[1.4rem] border border-line bg-panel-soft p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-strong">
          {isMySide ? "Your side" : "Opponent"}
        </p>
        <p className="mt-2 text-lg font-semibold text-foreground">{teamName}</p>
        <p className="text-sm text-muted">{managerName}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.15rem] border border-line bg-panel px-3 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            Total
          </p>
          <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
            {formatPoints(currentPoints)}
          </p>
        </div>
        <div className="rounded-[1.15rem] border border-line bg-panel px-3 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            Top contributor
          </p>
          <p className="mt-2 text-base font-semibold leading-tight text-foreground">
            {leadContributor ? leadContributor.player_name : "No player locked"}
          </p>
        </div>
      </div>

      {contributionMix.length > 0 ? (
        <div className="rounded-[1.1rem] border border-line bg-panel px-3 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            Live mix by role
          </p>
          <div className="mt-3 space-y-3">
            {contributionMix.map((entry) => (
              <div key={entry.position}>
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-muted">
                  <span>{entry.position}</span>
                  <span>
                    {formatPoints(entry.points)} pts • {Math.round(entry.share)}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(entry.share, 8)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {contributions.length > 0 ? (
        <div className="space-y-3">
          {contributions.map((contribution) => (
            <div key={contribution.player_id} className="rounded-[1.1rem] bg-panel px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {contribution.player_name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {contribution.player_position} • {contribution.club_name}
                  </p>
                </div>
                <p className="text-sm font-semibold text-brand-strong">
                  {status === "pregame" ? "Proj " : ""}
                  {formatPoints(contribution.fantasy_points)}
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{contribution.note}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted">
          No starters are locked in for this side yet.
        </p>
      )}
    </div>
  );
}

export interface ClassicMatchupStoryboardProps {
  leagueDetails: FantasyLeagueDetails;
  matchupState: FantasyLeagueMatchupState;
}

export function ClassicMatchupStoryboard({
  leagueDetails,
  matchupState,
}: ClassicMatchupStoryboardProps) {
  const mySideIsHome = matchupState.my_team_side === "home";
  const myTeamName = mySideIsHome
    ? matchupState.home_team_name
    : matchupState.away_team_name;
  const myManagerName = mySideIsHome
    ? matchupState.home_manager_name
    : matchupState.away_manager_name;
  const myContributions = mySideIsHome
    ? matchupState.home_contributions
    : matchupState.away_contributions;
  const opponentTeamName = mySideIsHome
    ? matchupState.away_team_name
    : matchupState.home_team_name;
  const opponentManagerName = mySideIsHome
    ? matchupState.away_manager_name
    : matchupState.home_manager_name;
  const opponentContributions = mySideIsHome
    ? matchupState.away_contributions
    : matchupState.home_contributions;
  const myPoints = mySideIsHome ? matchupState.home_points : matchupState.away_points;
  const opponentPoints = mySideIsHome ? matchupState.away_points : matchupState.home_points;
  const myProjection = mySideIsHome
    ? matchupState.home_projection
    : matchupState.away_projection;
  const opponentProjection = mySideIsHome
    ? matchupState.away_projection
    : matchupState.home_projection;
  const liveEdge = myPoints - opponentPoints;
  const projectionEdge = myProjection - opponentProjection;
  const recentEvent = matchupState.event_feed.at(-1);
  const myPaceDelta = myPoints - myProjection;
  const opponentPaceDelta = opponentPoints - opponentProjection;
  const myEvents = matchupState.event_feed.filter(
    (event) => event.team_side === matchupState.my_team_side
  );
  const opponentEvents = matchupState.event_feed.filter(
    (event) => event.team_side !== matchupState.my_team_side
  );
  const myEventSwing = myEvents.reduce(
    (total, event) => total + event.fantasy_delta,
    0
  );
  const opponentEventSwing = opponentEvents.reduce(
    (total, event) => total + event.fantasy_delta,
    0
  );
  const eventSwingEdge = myEventSwing - opponentEventSwing;

  return (
    <section className="space-y-5">
      <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <MatchupScoreCard matchup={matchupState} />
        <SurfaceCard
          description={`Follow score, projections, and recent events for all ${leagueDetails.memberships.length} active managers in one view.`}
          eyebrow="Live matchup"
          title="Track the matchup before you change your lineup"
          tone="accent"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile
              detail="Current scoring margin for your team."
              label="Live edge"
              tone="accent"
              value={liveEdge === 0 ? "Level" : `${liveEdge > 0 ? "+" : ""}${formatPoints(liveEdge)}`}
            />
            <MetricTile
              detail="Projection gap before the next event lands."
              label="Projection"
              tone="brand"
              value={`${projectionEdge > 0 ? "+" : ""}${formatPoints(projectionEdge)}`}
            />
            <MetricTile
              detail="How far your side is running above or below the projection baseline."
              label="Your pace"
              value={`${myPaceDelta > 0 ? "+" : ""}${formatPoints(myPaceDelta)}`}
            />
            <MetricTile
              detail="How far the other side is running above or below its projection."
              label="Opponent pace"
              value={`${opponentPaceDelta > 0 ? "+" : ""}${formatPoints(opponentPaceDelta)}`}
            />
            <MetricTile
              detail="Net scoring swing created by tracked events so far."
              label="Event swing"
              tone="accent"
              value={`${eventSwingEdge > 0 ? "+" : ""}${formatPoints(eventSwingEdge)}`}
            />
            <MetricTile
              detail={recentEvent ? recentEvent.summary : "Waiting for the next scoring event."}
              label="Last swing"
              value={recentEvent ? `${recentEvent.minute}'` : "Quiet"}
            />
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <SurfaceCard
          description="Event updates and scoring stay side by side so the matchup is easy to follow."
          eyebrow="Event log"
          title="Track the swings without losing the full matchup"
        >
          <div className="space-y-3">
            {matchupState.event_feed.length === 0 ? (
              <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
                Event tracking will appear after the first scoring event.
              </p>
            ) : (
              matchupState.event_feed.slice(-6).reverse().map((event, index) => (
                <div
                  key={`${event.minute}-${event.summary}-${index}`}
                  className="rounded-[1.25rem] border border-line bg-white/6 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                        {event.team_side === matchupState.my_team_side ? (
                          <ArrowUpRight className="size-3.5" />
                        ) : (
                          <Waves className="size-3.5" />
                        )}
                        {event.minute}&apos;
                      </p>
                      <p className="mt-2 text-sm leading-6 text-foreground">{event.summary}</p>
                    </div>
                    <p className="text-sm font-semibold text-brand-strong">
                      {event.fantasy_delta > 0 ? "+" : ""}
                      {formatPoints(event.fantasy_delta)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          description="See whether the edge came from your players, opponent pressure, or projection drift."
          eyebrow="Score drivers"
          title="What changed the score"
          tone="accent"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Activity className="size-3.5" />
                Your events
              </p>
              <p className="mt-3 text-2xl font-semibold leading-none text-white">
                {myEvents.length}
              </p>
              <p className="mt-2 text-sm text-white/74">
                Net swing {myEventSwing > 0 ? "+" : ""}
                {formatPoints(myEventSwing)}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <RadioTower className="size-3.5" />
                Opponent events
              </p>
              <p className="mt-3 text-2xl font-semibold leading-none text-white">
                {opponentEvents.length}
              </p>
              <p className="mt-2 text-sm text-white/74">
                Net swing {opponentEventSwing > 0 ? "+" : ""}
                {formatPoints(opponentEventSwing)}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Waves className="size-3.5" />
                Last trigger
              </p>
              <p className="mt-3 text-lg font-semibold leading-tight text-white">
                {recentEvent ? `${recentEvent.minute}'` : "Quiet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-white/74">
                {recentEvent ? recentEvent.summary : "Waiting for the next tracked scoring event."}
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <ContributionColumn
          contributions={myContributions}
          currentPoints={myPoints}
          isMySide
          managerName={myManagerName}
          status={matchupState.status}
          teamName={myTeamName}
        />
        <ContributionColumn
          contributions={opponentContributions}
          currentPoints={opponentPoints}
          isMySide={false}
          managerName={opponentManagerName}
          status={matchupState.status}
          teamName={opponentTeamName}
        />
      </section>
    </section>
  );
}
