import { Activity, Clock3, Radar, Target, TimerReset } from "lucide-react";
import type { DemoMatchup, FantasyLeagueMatchupState } from "@/types/fantasy";
import { SurfaceCard } from "@/components/common/surface-card";
import { Pill } from "@/components/ui/pill";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

export interface MatchupScoreCardProps {
  matchup: DemoMatchup | FantasyLeagueMatchupState;
}

function isLeagueMatchupState(
  matchup: DemoMatchup | FantasyLeagueMatchupState
): matchup is FantasyLeagueMatchupState {
  return "week_label" in matchup;
}

function formatPoints(points: number) {
  const hasDecimal = Math.abs(points % 1) > 0.001;
  return points.toFixed(hasDecimal ? 1 : 0);
}

function formatDelta(points: number) {
  const value = formatPoints(Math.abs(points));
  return points === 0 ? "Level" : `${points > 0 ? "+" : "-"}${value}`;
}

export function MatchupScoreCard({ matchup }: MatchupScoreCardProps) {
  const isLeagueMatchup = isLeagueMatchupState(matchup);
  const eyebrow = isLeagueMatchup
    ? `${matchup.week_label} • ${matchup.league.name}`
    : matchup.leagueName;
  const title = isLeagueMatchup
    ? `${matchup.home_team_name} vs ${matchup.away_team_name}`
    : `${matchup.homeTeam} vs ${matchup.awayTeam}`;
  const description = isLeagueMatchup ? matchup.status_label : matchup.status;
  const homePoints = isLeagueMatchup ? matchup.home_points : matchup.homePoints;
  const awayPoints = isLeagueMatchup ? matchup.away_points : matchup.awayPoints;
  const homeTeam = isLeagueMatchup ? matchup.home_team_name : matchup.homeTeam;
  const awayTeam = isLeagueMatchup ? matchup.away_team_name : matchup.awayTeam;
  const homeSubLabel = isLeagueMatchup ? matchup.home_manager_name : "Home";
  const awaySubLabel = isLeagueMatchup ? matchup.away_manager_name : "Away";
  const scoreDelta = homePoints - awayPoints;
  const leadingLabel =
    scoreDelta === 0
      ? "Dead even"
      : `${scoreDelta > 0 ? homeTeam : awayTeam} leads`;
  const totalProjection = isLeagueMatchup
    ? matchup.home_projection + matchup.away_projection
    : 0;
  const totalLivePoints = homePoints + awayPoints;
  const livePaceDelta = isLeagueMatchup ? totalLivePoints - totalProjection : 0;
  const recentEvent = isLeagueMatchup ? matchup.event_feed.at(-1) ?? null : null;

  return (
    <SurfaceCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      tone="brand"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Pill tone="brand">
            <Activity className="size-3.5" />
            {description}
          </Pill>
          {isLeagueMatchup ? (
            <Pill tone="default">
              <Clock3 className="size-3.5" />
              {matchup.lock_label}
            </Pill>
          ) : null}
          {isLeagueMatchup ? (
            <Pill tone="success">
              <Radar className="size-3.5" />
              {matchup.event_feed.length} events
            </Pill>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
          <div className="rounded-[1.6rem] bg-black/18 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-white/75">
              {homeSubLabel}
            </p>
            <p className="mt-3 font-display text-6xl leading-none">
              {formatPoints(homePoints)}
            </p>
            <p className="mt-2 text-sm text-white/78">{homeTeam}</p>
          </div>
          <div className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4 lg:flex lg:w-[13rem] lg:flex-col lg:items-center lg:justify-center">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/75">
              Margin
            </p>
            <p className="mt-3 text-center text-2xl font-semibold leading-tight text-white">
              {leadingLabel}
            </p>
            <p className="mt-2 font-display text-5xl leading-none text-brand-strong">
              {formatDelta(scoreDelta)}
            </p>
            {isLeagueMatchup ? (
              <p className="mt-3 text-center text-sm leading-6 text-white/78">
                Projection {formatPoints(matchup.home_projection)} -{" "}
                {formatPoints(matchup.away_projection)}
              </p>
            ) : null}
          </div>
          <div className="rounded-[1.6rem] bg-black/18 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-white/75">
              {awaySubLabel}
            </p>
            <p className="mt-3 font-display text-6xl leading-none">
              {formatPoints(awayPoints)}
            </p>
            <p className="mt-2 text-sm text-white/78">{awayTeam}</p>
          </div>
        </div>

        {isLeagueMatchup ? (
          <div className="space-y-3 rounded-[1.4rem] bg-black/18 p-4 text-sm text-white/80">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                  Projected score
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {formatPoints(matchup.home_projection)} - {formatPoints(matchup.away_projection)}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                  Live pace
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {matchup.status === "pregame"
                    ? "Waiting for lock"
                    : `${livePaceDelta > 0 ? "+" : ""}${formatPoints(livePaceDelta)}`}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                  Last event
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {recentEvent ? `${recentEvent.minute}' ${formatDelta(recentEvent.fantasy_delta)}` : "Quiet"}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                  Lineup lock
                </p>
                <p className="mt-2 text-base font-semibold text-white">{matchup.lock_label}</p>
              </div>
            </div>

            <div>
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                <TimerReset className="size-3.5" />
                Score tracking
              </p>
              <p className="mt-2 leading-6 text-white/80">
                Points update live as goals, assists, clean sheets, saves, and cards happen during the match.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.15rem] border border-white/10 bg-black/18 px-3 py-3">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                  <Target className="size-3.5" />
                  Key points
                </p>
                <p className="mt-2 leading-6 text-white/80">
                  FWD goal +{launchScoringRules.goal.FWD} · MID goal +{launchScoringRules.goal.MID} · DEF/GK goal +{launchScoringRules.goal.DEF} · Assist +{launchScoringRules.assist} · Clean sheet +{launchScoringRules.cleanSheet.GK}
                </p>
              </div>
              <div className="rounded-[1.15rem] border border-white/10 bg-black/18 px-3 py-3">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                  <Activity className="size-3.5" />
                  Your side
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {matchup.my_team_side === "home" ? matchup.home_team_name : matchup.away_team_name}
                </p>
                <p className="mt-1 text-sm text-white/78">
                  {recentEvent ? recentEvent.summary : "Waiting for the first tracked event."}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
