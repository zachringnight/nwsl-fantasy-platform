import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, ShieldCheck, Sparkles, Target, TimerReset } from "lucide-react";
import { ProtectedAppShell } from "@/components/common/protected-app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { getFantasyPlayerById, getFantasyPlayerPool } from "@/lib/fantasy-player-pool";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { FantasyPoolPlayer } from "@/types/fantasy";

interface PlayerComparePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlayerComparePage({ searchParams }: PlayerComparePageProps) {
  const resolvedSearchParams = await searchParams;
  const leftParam = resolvedSearchParams.left;
  const rightParam = resolvedSearchParams.right;
  const leftId = Array.isArray(leftParam) ? leftParam[0] : leftParam ?? null;
  const rightId = Array.isArray(rightParam) ? rightParam[0] : rightParam ?? null;
  const players = getFantasyPlayerPool();
  const [leftPlayer, rightPlayer] = resolveComparePlayers(players, leftId, rightId);

  const projectionLeader =
    leftPlayer.average_points >= rightPlayer.average_points ? leftPlayer : rightPlayer;
  const valueLeader = getValueScore(leftPlayer) >= getValueScore(rightPlayer) ? leftPlayer : rightPlayer;
  const salaryLeader = leftPlayer.salary_cost <= rightPlayer.salary_cost ? leftPlayer : rightPlayer;

  return (
    <ProtectedAppShell
      eyebrow="Player compare"
      title="Projection, price, and scoring fit in one decision view"
      description="Side-by-side on projection, price, and scoring fit."
      signedOutDescription="Sign in before comparing player targets."
      signedOutTitle="Sign in to continue"
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
          title="Read the decision before you stare at the cards"
          description="Projection first, then value, then how each player scores."
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                detail="Higher projected production based on current average fantasy points."
                label="Projection edge"
                tone="brand"
                value={`${getCallsign(projectionLeader)} +${Math.abs(leftPlayer.average_points - rightPlayer.average_points).toFixed(1)}`}
              />
              <MetricTile
                detail="Projected points generated per $1k of salary."
                label="Value edge"
                tone="accent"
                value={`${getCallsign(valueLeader)} +${Math.abs(getValueScore(leftPlayer) - getValueScore(rightPlayer)).toFixed(2)}`}
              />
              <MetricTile
                detail="Lower salary wins when projection is close and cap pressure matters."
                label="Salary edge"
                value={`${getCallsign(salaryLeader)} $${Math.abs(leftPlayer.salary_cost - rightPlayer.salary_cost)}`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
              {[leftPlayer, rightPlayer].map((player, index) => {
                const fit = getScoringFit(player);

                return (
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
                          {player.display_name}
                        </p>
                        <p className="mt-1 text-sm text-white/72">
                          {player.club_name} • {player.position} • rank #{player.rank}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Pill tone={player.availability === "available" ? "success" : "default"}>
                          <ShieldCheck className="size-3.5" />
                          {player.availability}
                        </Pill>
                        <Pill tone={index === 0 ? "brand" : "accent"}>
                          <Sparkles className="size-3.5" />
                          {fit.label}
                        </Pill>
                      </div>
                      <p className="text-sm leading-7 text-white/78">{fit.detail}</p>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-center">
                <div className="flex size-14 items-center justify-center rounded-full border border-line bg-white/8 text-brand-strong shadow-[0_18px_42px_rgba(0,225,255,0.18)]">
                  <ArrowRightLeft className="size-5" />
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Scoring system"
          title="Clear scoring rules and live scoring updates"
          description="See what counts, when it lands, and why each projection moves."
          tone="accent"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill tone="brand">
                <Target className="size-3.5" />
                Projection = avg fantasy points
              </Pill>
              <Pill tone="success">
                <TimerReset className="size-3.5" />
                Live score updates by event
              </Pill>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Attacking rewards
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Forward goals score {launchScoringRules.goal.FWD}, midfielder goals {launchScoringRules.goal.MID}, defender and keeper goals {launchScoringRules.goal.DEF}. Assists add {launchScoringRules.assist}.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Defensive base
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Appearance adds {launchScoringRules.appearance}, 60+ minutes adds {launchScoringRules.minutes60Plus}, clean sheets pay {launchScoringRules.cleanSheet.GK} for GK and DEF, and each save adds {launchScoringRules.save}.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Discipline swings
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Yellow cards cost {launchScoringRules.yellowCard}, red cards cost {launchScoringRules.redCard}, penalty misses cost {launchScoringRules.penaltyMiss}, and goals conceded reduce GK and DEF by {launchScoringRules.goalsConceded.DEF} each.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  How scores move
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Points start with appearance, climb at 60 minutes, then react to match events. The projection is your baseline — live scores show the swings as the game unfolds.
                </p>
              </div>
            </div>

            <Link
              href="/rules"
              className={getButtonClassName({
                className: "justify-center",
                variant: "secondary",
              })}
            >
              Open full scoring rules
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {[leftPlayer, rightPlayer].map((player, index) => {
          const otherPlayer = index === 0 ? rightPlayer : leftPlayer;
          const fit = getScoringFit(player);
          const projectionGap = player.average_points - otherPlayer.average_points;
          const valueGap = getValueScore(player) - getValueScore(otherPlayer);

          return (
            <SurfaceCard
              key={player.id}
              eyebrow={index === 0 ? "Player A profile" : "Player B profile"}
              title={player.display_name}
              description={`${player.club_name} • ${player.position} • ${fit.label}`}
              tone={index === 0 ? "brand" : "accent"}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Pill tone={index === 0 ? "brand" : "accent"}>Rank #{player.rank}</Pill>
                  <Pill tone={player.availability === "available" ? "success" : "default"}>
                    {player.availability}
                  </Pill>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricTile
                    detail={projectionGap >= 0 ? "Leads this head-to-head projection." : "Trailing the other player on baseline projection."}
                    label="Projection"
                    tone={projectionGap >= 0 ? "brand" : "default"}
                    value={player.average_points.toFixed(1)}
                  />
                  <MetricTile
                    detail="Salary-cap cost for season, weekly, or daily builds."
                    label="Salary"
                    value={`$${player.salary_cost}`}
                  />
                  <MetricTile
                    detail={valueGap >= 0 ? "Stronger projected efficiency per $1k." : "Less efficient per $1k than the other side."}
                    label="Value / $1k"
                    tone={valueGap >= 0 ? "accent" : "default"}
                    value={getValueScore(player).toFixed(2)}
                  />
                  <MetricTile
                    detail="Draft and waiver priority across the player pool."
                    label="Pool rank"
                    value={`#${player.rank}`}
                  />
                </div>

                <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Scoring fit
                  </p>
                  <p className="mt-3 text-sm leading-7 text-foreground">{fit.detail}</p>
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
    </ProtectedAppShell>
  );
}

function resolveComparePlayers(
  players: FantasyPoolPlayer[],
  leftId: string | null,
  rightId: string | null
) {
  const candidateIds =
    leftId && rightId
      ? [leftId, rightId]
      : players.slice(0, 2).map((player) => player.id);

  const uniqueIds: string[] = [];

  for (const playerId of candidateIds) {
    if (!uniqueIds.includes(playerId)) {
      uniqueIds.push(playerId);
    }
  }

  for (const player of players) {
    if (uniqueIds.length >= 2) {
      break;
    }

    if (!uniqueIds.includes(player.id)) {
      uniqueIds.push(player.id);
    }
  }

  return uniqueIds.slice(0, 2).map((playerId) => getFantasyPlayerById(playerId) ?? players[0]) as [
    FantasyPoolPlayer,
    FantasyPoolPlayer,
  ];
}

function getValueScore(player: FantasyPoolPlayer) {
  if (player.salary_cost <= 0) {
    return player.average_points;
  }

  return (player.average_points / player.salary_cost) * 1000;
}

function getCallsign(player: FantasyPoolPlayer) {
  const parts = player.display_name.split(" ");
  return parts[parts.length - 1] ?? player.display_name;
}

function getScoringFit(player: FantasyPoolPlayer) {
  if (player.position === "GK") {
    return {
      label: "Save ceiling",
      detail: `Keepers stack fantasy points through saves (${launchScoringRules.save} each), clean sheets (${launchScoringRules.cleanSheet.GK}), and rare goal events worth ${launchScoringRules.goal.GK}. This profile tracks best when shot volume stays high but goals conceded stay controlled.`,
    };
  }

  if (player.position === "DEF") {
    return {
      label: "Two-way floor",
      detail: `Defenders get the strongest non-goal floor from appearance, 60+ minutes, and a ${launchScoringRules.cleanSheet.DEF}-point clean sheet bonus, while still carrying ${launchScoringRules.goal.DEF}-point goal upside on set pieces.`,
    };
  }

  if (player.position === "MID") {
    return {
      label: "Creation engine",
      detail: `Midfielders usually win this format by layering assists (${launchScoringRules.assist}), steady minutes, and occasional ${launchScoringRules.goal.MID}-point goals. Their projection is strongest when they touch multiple categories instead of relying on a single finish.`,
    };
  }

  return {
    label: "Finisher ceiling",
    detail: `Forwards spike fastest through goals (${launchScoringRules.goal.FWD}) and assists (${launchScoringRules.assist}). Their projections can separate quickly when they dominate shots, final-third touches, and penalty duty.`,
  };
}
