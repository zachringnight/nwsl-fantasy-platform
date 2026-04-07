import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
} from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import {
  getPredictiveHubData,
  type PlayerProjectionRecord,
} from "@/lib/analytics/predictive";

export const metadata: Metadata = {
  title: "Compare Players",
  description:
    "Compare two NWSL players by matchup-aware projection, range, confidence, and value before lock.",
};

interface PlayerComparePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlayerComparePage({ searchParams }: PlayerComparePageProps) {
  const resolvedSearchParams = await searchParams;
  const leftParam = resolvedSearchParams.left;
  const rightParam = resolvedSearchParams.right;
  const leftId = Array.isArray(leftParam) ? leftParam[0] : leftParam ?? null;
  const rightId = Array.isArray(rightParam) ? rightParam[0] : rightParam ?? null;

  if (!leftId && !rightId) {
    return (
      <AppShell
        eyebrow="Player compare"
        title="Compare players side-by-side"
        description="Projection, range, salary, and role confidence in one screen."
        actions={
          <Link
            href="/players"
            className={getButtonClassName({ variant: "secondary" })}
          >
            <ArrowLeft className="size-4" />
            Back to player board
          </Link>
        }
      >
        <section className="rounded-[1.35rem] border border-dashed border-line bg-white/4 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No players selected</p>
          <p className="mt-1 text-sm text-muted">
            Pick two projected players from the board to compare their next-slate outlook.
          </p>
          <div className="mt-3 flex justify-center">
            <Link href="/players" className={getButtonClassName()}>
              Browse players
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  const data = await getPredictiveHubData();
  const playerBoard = data.predictive.playerBoard;

  if (playerBoard.length === 0) {
    return (
      <AppShell
        eyebrow="Player compare"
        title="Player comparisons are loading"
        description="The next-slate projection board is still being generated."
      >
        <section className="rounded-[1.35rem] border border-dashed border-line bg-white/4 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No projection data yet</p>
          <p className="mt-1 text-sm text-muted">
            Come back once the next slate is available and this page will compare projected
            starters, values, and ranges.
          </p>
        </section>
      </AppShell>
    );
  }

  const [leftPlayer, rightPlayer] = resolveComparePlayers(playerBoard, leftId, rightId);
  const projectionLeader =
    leftPlayer.projection >= rightPlayer.projection ? leftPlayer : rightPlayer;
  const ceilingLeader = leftPlayer.ceiling >= rightPlayer.ceiling ? leftPlayer : rightPlayer;
  const floorLeader = leftPlayer.floor >= rightPlayer.floor ? leftPlayer : rightPlayer;
  const valueLeader = leftPlayer.valueScore >= rightPlayer.valueScore ? leftPlayer : rightPlayer;

  return (
    <AppShell
      eyebrow="Player compare"
      title="Compare next-slate player outlooks"
      description="Use matchup-adjusted projections, range, and role confidence to break close calls before lock."
      actions={
        <Link
          href="/players"
          className={getButtonClassName({
            variant: "secondary",
          })}
        >
          <ArrowLeft className="size-4" />
          Back to player board
        </Link>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <SurfaceCard
          eyebrow="Head-to-head summary"
          title="Who gives you the stronger slate profile?"
          description="Compare matchup-adjusted projection, range, salary, and value."
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricTile
                detail="Higher projected fantasy output."
                label="Projection edge"
                tone="brand"
                value={`${getCallsign(projectionLeader)} +${Math.abs(
                  leftPlayer.projection - rightPlayer.projection
                ).toFixed(1)}`}
              />
              <MetricTile
                detail="Higher single-match upside."
                label="Ceiling edge"
                tone="accent"
                value={`${getCallsign(ceilingLeader)} +${Math.abs(
                  leftPlayer.ceiling - rightPlayer.ceiling
                ).toFixed(1)}`}
              />
              <MetricTile
                detail="Safer outcome band."
                label="Floor edge"
                value={`${getCallsign(floorLeader)} +${Math.abs(
                  leftPlayer.floor - rightPlayer.floor
                ).toFixed(1)}`}
              />
              <MetricTile
                detail="Better projection per salary."
                label="Value edge"
                value={`${getCallsign(valueLeader)} +${Math.abs(
                  leftPlayer.valueScore - rightPlayer.valueScore
                ).toFixed(2)}`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
              {[leftPlayer, rightPlayer].map((player, index) => (
                <div
                  key={player.id}
                  className={[
                    "rounded-[1.6rem] border p-5",
                    index === 0
                      ? "border-brand/28 bg-[linear-gradient(140deg,rgba(0,225,255,0.08)_0%,rgba(5,34,255,0.22)_46%,rgba(2,7,22,0.94)_100%)]"
                      : "border-accent/28 bg-[linear-gradient(140deg,rgba(255,60,34,0.08)_0%,rgba(18,26,106,0.76)_46%,rgba(2,7,22,0.96)_100%)]",
                  ].join(" ")}
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    {index === 0 ? "Player A" : "Player B"}
                  </p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-white">
                        {player.player}
                      </p>
                      <p className="mt-1 text-sm text-white/72">
                        {player.team} • {player.position} • {formatMatchup(player)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Pill tone={player.availability === "available" ? "success" : "default"}>
                        <ShieldCheck className="size-3.5" />
                        {player.availability}
                      </Pill>
                      <Pill tone={index === 0 ? "brand" : "accent"}>
                        <Sparkles className="size-3.5" />
                        {player.matchupTag}
                      </Pill>
                    </div>
                    <p className="text-sm leading-7 text-white/78">
                      {player.reasons[0] ?? player.trendLabel}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                      {player.matchDateLabel ?? "Match date pending"}
                    </p>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-center">
                <div className="flex size-14 items-center justify-center rounded-full border border-line bg-white/8 text-brand-strong shadow-[0_18px_42px_rgba(0,225,255,0.18)]">
                  <ArrowRightLeft className="size-5" />
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="How to read it"
          title="These numbers are built for pre-lock decisions"
          description="The compare view turns the model into fast signals you can use."
          tone="accent"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill tone="brand">
                <Target className="size-3.5" />
                Projection = matchup-adjusted points
              </Pill>
              <Pill tone="success">
                <TimerReset className="size-3.5" />
                Confidence = role stability + minutes
              </Pill>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Ceiling
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  High-end outcome if the game opens up and the player sees her normal attacking or
                  defensive workload.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Floor
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Safer range built from minutes, base involvement, and clean-sheet or save equity
                  where relevant.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Confidence
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Higher confidence means the role and minutes look stable. Lower confidence means
                  more volatility or injury risk.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Reasons
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Each player card highlights the one or two matchup or role factors driving the
                  projection upward.
                </p>
              </div>
            </div>

            <Link
              href="/matchups"
              className={getButtonClassName({
                className: "justify-center",
                variant: "secondary",
              })}
            >
              Open matchup board
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {[leftPlayer, rightPlayer].map((player, index) => {
          const otherPlayer = index === 0 ? rightPlayer : leftPlayer;
          const projectionGap = player.projection - otherPlayer.projection;
          const valueGap = player.valueScore - otherPlayer.valueScore;

          return (
            <SurfaceCard
              key={player.id}
              eyebrow={index === 0 ? "Player A profile" : "Player B profile"}
              title={player.player}
              description={`${player.team} • ${player.position} • ${player.matchupTag}`}
              tone={index === 0 ? "brand" : "accent"}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Pill tone={index === 0 ? "brand" : "accent"}>{player.matchupTag}</Pill>
                  <Pill tone={player.availability === "available" ? "success" : "default"}>
                    {player.availability}
                  </Pill>
                  <Pill tone="default">{player.riskLabel}</Pill>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricTile
                    detail={projectionGap >= 0 ? "Higher projected output." : "Lower projected output."}
                    label="Projection"
                    tone={projectionGap >= 0 ? "brand" : "default"}
                    value={player.projection.toFixed(1)}
                  />
                  <MetricTile
                    detail="High-end outcome."
                    label="Ceiling"
                    value={player.ceiling.toFixed(1)}
                  />
                  <MetricTile
                    detail="Safer outcome band."
                    label="Floor"
                    tone="accent"
                    value={player.floor.toFixed(1)}
                  />
                  <MetricTile
                    detail={valueGap >= 0 ? "Better projection per salary." : "Less value per salary."}
                    label="Value / $1k"
                    value={player.valueScore.toFixed(2)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                      Salary
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">${player.salary}</p>
                  </div>
                  <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                      Minutes
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {player.expectedMinutes.toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                      Confidence
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatPercent(player.confidence)}
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Why the model likes this spot
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {player.reasons.slice(0, 3).map((reason) => (
                      <Pill key={`${player.id}-${reason}`} tone="default">
                        {reason}
                      </Pill>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/players/${player.id}`}
                    className={getButtonClassName({
                      variant: "secondary",
                    })}
                  >
                    Open player detail
                  </Link>
                  <Link href="/players" className={getButtonClassName()}>
                    Scout more players
                  </Link>
                </div>
              </div>
            </SurfaceCard>
          );
        })}
      </section>
    </AppShell>
  );
}

function resolveComparePlayers(
  players: PlayerProjectionRecord[],
  leftId: string | null,
  rightId: string | null
) {
  const preferredIds = [leftId, rightId].filter((playerId): playerId is string => Boolean(playerId));
  const chosenPlayers: PlayerProjectionRecord[] = [];

  for (const playerId of preferredIds) {
    const player = players.find((candidate) => candidate.id === playerId);
    if (player && !chosenPlayers.some((candidate) => candidate.id === player.id)) {
      chosenPlayers.push(player);
    }
  }

  for (const player of players) {
    if (chosenPlayers.length >= 2) {
      break;
    }

    if (!chosenPlayers.some((candidate) => candidate.id === player.id)) {
      chosenPlayers.push(player);
    }
  }

  return chosenPlayers.slice(0, 2) as [PlayerProjectionRecord, PlayerProjectionRecord];
}

function getCallsign(player: PlayerProjectionRecord) {
  const parts = player.player.split(" ");
  return parts[parts.length - 1] ?? player.player;
}

function formatPercent(probability: number) {
  return `${Math.round(probability * 100)}%`;
}

function formatMatchup(player: PlayerProjectionRecord) {
  const opponent = player.opponent ?? "TBD";
  const venue = player.venue ? `${player.venue} vs ${opponent}` : `vs ${opponent}`;
  return venue;
}
