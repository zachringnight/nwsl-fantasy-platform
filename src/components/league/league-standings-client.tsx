"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBanner } from "@/components/common/status-banner";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getButtonClassName } from "@/components/ui/button";
import { AnimatedScore } from "@/components/ui/animated-score";
import { MetricTile } from "@/components/ui/metric-tile";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { FantasyLeagueDetails, FantasyStandingsState } from "@/types/fantasy";

export interface LeagueStandingsClientProps {
  leagueId: string;
}

export function LeagueStandingsClient({ leagueId }: LeagueStandingsClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const links = buildLeagueLinks(leagueId);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);
  const [standingsState, setStandingsState] = useState<FantasyStandingsState | null>(null);

  const refreshStandings = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagueDetails(null);
      setStandingsState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const details = await dataClient.loadLeagueById(leagueId);

      if (!details) {
        throw new Error("That league does not exist.");
      }

      setLeagueDetails(details);

      if (getFantasyModeConfig(details.league).usesSalaryCap) {
        setStandingsState(null);
        return;
      }

      setStandingsState(await dataClient.loadLeagueStandings(leagueId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load standings."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshStandings();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingDescription="Loading."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Complete your profile to continue."
      signedOutDescription="Sign in to continue."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && !leagueDetails) {
          return (
            <EmptyState
              description="Loading your league standings."
              title="Loading standings"
            />
          );
        }

        if (error && !leagueDetails) {
          return <EmptyState description={error} title="Unable to load standings" />;
        }

        if (!leagueDetails) {
          return (
            <EmptyState
              description="That league could not be found."
              title="League not found"
            />
          );
        }

        const modeConfig = getFantasyModeConfig(leagueDetails.league);

        if (modeConfig.usesSalaryCap) {
          return (
            <MotionReveal>
              <section className="grid gap-5 lg:grid-cols-2">
                <SurfaceCard
                  description="Contest results and leaderboard for salary-cap leagues."
                  eyebrow="Salary-cap path"
                  title={`${modeConfig.label} does not use classic standings`}
                >
                  <div className="flex flex-wrap gap-3">
                    <Link className={getButtonClassName()} href={links.team}>
                      Open contest hub
                    </Link>
                    <Link
                      className={getButtonClassName({
                        variant: "secondary",
                      })}
                      href={links.matchup}
                    >
                      View contest pulse
                    </Link>
                  </div>
                </SurfaceCard>
                <SurfaceCard
                  description="Head to the contest hub to manage your entry."
                  eyebrow="Contest route"
                  title="Use the contest hub for entry results"
                  tone="accent"
                />
              </section>
            </MotionReveal>
          );
        }

        if (error && !standingsState) {
          return <EmptyState description={error} title="Unable to load standings" />;
        }

        if (!standingsState) {
          return (
            <EmptyState
              description="Standings could not be generated for this league yet."
              title="Standings unavailable"
            />
          );
        }

        const topSeed = standingsState.standings[0] ?? null;
        const projectionLeader = [...standingsState.standings].sort(
          (left, right) => right.projected_points - left.projected_points
        )[0] ?? null;
        const bubbleTeam =
          standingsState.standings[standingsState.playoff_cutoff - 1] ?? null;

        return (
          <section className="space-y-5">
            <MotionReveal>
              {error ? (
                <StatusBanner title="Standings note" message={error} tone="warning" />
              ) : (
                <StatusBanner
                  title="How standings work"
                  message="The current table is driven by weekly matchup results, so the playoff race updates automatically and reads like a real season."
                  tone="info"
                />
              )}
            </MotionReveal>

            <MotionReveal delay={60}>
              <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <SurfaceCard
                  description={`Top ${standingsState.playoff_cutoff} teams are above the playoff line after ${standingsState.completed_weeks} completed weeks.`}
                  eyebrow="Standings table"
                  title="League ladder"
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      detail="The current season has already advanced this far."
                      label="Weeks complete"
                      value={standingsState.completed_weeks}
                    />
                    <MetricTile
                      detail="Classic leagues use one cutoff with no divisions."
                      label="Playoff line"
                      tone="brand"
                      value={standingsState.playoff_cutoff}
                    />
                    <MetricTile
                      detail="Current table leader by weekly results."
                      label="Top seed"
                      tone="accent"
                      value={topSeed ? topSeed.team_name : "N/A"}
                    />
                    <MetricTile
                      detail="Highest season outlook based on projected points."
                      label="Projection leader"
                      tone="accent"
                      value={projectionLeader ? projectionLeader.team_name : "N/A"}
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    {standingsState.standings.map((row) => (
                      <ScrollReveal
                        key={row.membership_id}
                      >
                        <div
                          className={[
                            "rounded-[1.2rem] border px-4 py-3",
                            row.user_id === session?.user.id
                              ? "border-brand-strong/40 bg-[linear-gradient(135deg,rgba(0,225,255,0.08)_0%,rgba(5,34,255,0.18)_48%,rgba(255,255,255,0.04)_100%)]"
                              : row.rank <= standingsState.playoff_cutoff
                              ? "border-brand/25 bg-brand/6"
                              : "border-line bg-panel-soft",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-strong">
                                #{row.rank} {row.team_name}
                              </p>
                              <p className="mt-1 text-sm text-foreground">{row.display_name}</p>
                            </div>
                            <div className="text-right text-sm text-muted">
                              <p>
                                {row.wins}-{row.losses}-{row.ties}
                              </p>
                              <p>Win% {row.win_pct.toFixed(3)}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-4">
                            <p>PF <AnimatedScore value={row.points_for} /></p>
                            <p>PA <AnimatedScore value={row.points_against} /></p>
                            <p>Proj <AnimatedScore value={row.projected_points} /></p>
                            <p>
                              Pace {row.points_for - row.projected_points > 0 ? "+" : ""}
                              <AnimatedScore value={row.points_for - row.projected_points} />
                            </p>
                          </div>
                        </div>
                      </ScrollReveal>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description="See where you rank and why your scoring profile has you there."
                  eyebrow="How it works"
                  title="How scoring turns into standings"
                  tone="accent"
                >
                  <div className="space-y-4">
                    <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-7 text-foreground">
                      Weekly points-for is built from the same fantasy scoring system used across matchup and lineup views: appearance {launchScoringRules.appearance}, 60+ minutes {launchScoringRules.minutes60Plus}, assists {launchScoringRules.assist}, and position-based goal or clean-sheet bonuses.
                    </div>
                    <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-7 text-foreground">
                      Projection is the season outlook lane. It does not rank above wins, but it explains who is running hot, who is underperforming, and which teams still profile like contenders over the remaining weeks.
                    </div>
                    <div className="space-y-2 text-sm leading-6 text-foreground">
                      <p>1. Win percentage</p>
                      <p>2. Points for</p>
                      <p>3. Head-to-head when direct results are available</p>
                      <p>4. Stable team-name fallback</p>
                      <p>
                        Playoff line: top {standingsState.playoff_cutoff}
                        {bubbleTeam ? ` • bubble team: ${bubbleTeam.team_name}` : ""}
                      </p>
                    </div>
                  </div>
                </SurfaceCard>
              </section>
            </MotionReveal>
          </section>
        );
      }}
    </FantasyAuthGate>
  );
}
