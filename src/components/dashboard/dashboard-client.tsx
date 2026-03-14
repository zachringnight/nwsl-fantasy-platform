"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Radar, ShieldPlus, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { MetricTile } from "@/components/ui/metric-tile";
import { getButtonClassName } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import {
  formatFantasySlateRange,
  getFantasySlateStatus,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import { LeagueCard } from "@/components/league/league-card";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import type { FantasyLeagueSummary } from "@/types/fantasy";

export function DashboardClient() {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isLoadingLeagues, setIsLoadingLeagues] = useState(false);
  const [leagues, setLeagues] = useState<FantasyLeagueSummary[]>([]);

  const refreshLeagues = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagues([]);
      setIsLoadingLeagues(false);
      return;
    }

    setIsLoadingLeagues(true);
    setError("");

    try {
      setLeagues(await dataClient.loadMyLeagues());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your leagues."
      );
    } finally {
      setIsLoadingLeagues(false);
    }
  });

  useEffect(() => {
    void refreshLeagues();
  }, [dataClient, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingDescription="Loading your dashboard."
      loadingTitle="Loading"
      onboardingAction={
        <Link
          className={getButtonClassName()}
          href="/onboarding"
        >
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and experience level before using the dashboard."
      signedOutAction={
        <div className="flex flex-wrap justify-center gap-3">
          <Link className={getButtonClassName()} href="/signup">
            Create account
          </Link>
          <Link
            className={getButtonClassName({
              variant: "secondary",
            })}
            href="/login"
          >
            Start session
          </Link>
        </div>
      }
      signedOutDescription="Sign in to continue."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoadingLeagues) {
          return (
            <EmptyState
              description="Loading your leagues."
              title="Loading leagues"
            />
          );
        }

        if (error) {
          return <EmptyState description={error} title="Unable to load dashboard" />;
        }

        if (leagues.length === 0) {
          return (
            <EmptyState
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Link className={getButtonClassName()} href="/leagues/create">
                    Create league
                  </Link>
                  <Link
                    className={getButtonClassName({
                      variant: "secondary",
                    })}
                    href="/leagues/join"
                  >
                    Join league
                  </Link>
                </div>
              }
              description="Create a league or join one with a code to get started."
              title="No leagues yet"
            />
          );
        }

        const commissionerCount = leagues.filter(
          (league) => league.membershipRole === "commissioner"
        ).length;
        const salaryCapCount = leagues.filter((league) =>
          getFantasyModeConfig(league.league).usesSalaryCap
        ).length;
        const liveWindowCount = leagues.filter(
          (league) => league.league.status === "live"
        ).length;
        const prioritizedLeagues = [...leagues].sort((left, right) =>
          buildLeaguePriority(right) - buildLeaguePriority(left)
        );
        const featuredLeague = prioritizedLeagues[0];
        const featuredMode = getFantasyModeConfig(featuredLeague.league);
        const nextSalaryCapLeague = prioritizedLeagues.find((league) =>
          getFantasyModeConfig(league.league).usesSalaryCap
        );

        return (
          <div className="space-y-5">
            <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
              <MotionReveal variant="left">
                <SurfaceCard
                  description="Your leagues, deadlines, and next moves."
                  eyebrow="Overview"
                  title="Your leagues"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Pill tone="brand">{leagues.length} active leagues</Pill>
                      <Pill tone="default">{commissionerCount} commissioner roles</Pill>
                      <Pill tone="success">{salaryCapCount} salary-cap formats</Pill>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricTile
                        detail="Leagues you're in."
                        label="Active leagues"
                        value={leagues.length}
                      />
                      <MetricTile
                        detail="Leagues you manage."
                        label="Commissioner roles"
                        tone="brand"
                        value={commissionerCount}
                      />
                      <MetricTile
                        detail="Leagues with live matches."
                        label="Live now"
                        tone="accent"
                        value={liveWindowCount}
                      />
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-[1.5rem] border border-line bg-white/6 p-4">
                        <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
                          <CalendarClock className="size-3.5" />
                          Next deadline
                        </p>
                        <p className="mt-3 text-xl font-semibold leading-tight text-foreground">
                          {buildLeagueWindowSummary(featuredLeague)}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {buildDashboardHeadline(prioritizedLeagues)}
                        </p>
                      </div>
                      <div className="rounded-[1.5rem] border border-line bg-white/6 p-4">
                        <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
                          <Radar className="size-3.5" />
                          Your formats
                        </p>
                        <p className="mt-3 text-xl font-semibold leading-tight text-foreground">
                          {salaryCapCount} salary-cap / {leagues.length - salaryCapCount} classic
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {nextSalaryCapLeague
                            ? `${nextSalaryCapLeague.league.name} is your next salary-cap league.`
                            : "All your leagues are classic format."}
                        </p>
                      </div>
                    </div>
                  </div>
                </SurfaceCard>
              </MotionReveal>

              <MotionReveal
                emphasis={featuredLeague.league.status === "live" ? "live" : "default"}
                variant="right"
              >
                <SurfaceCard
                  description="Your most active league right now."
                  eyebrow="Featured league"
                  title={featuredLeague.league.name}
                  tone={featuredMode.usesSalaryCap ? "brand" : "accent"}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Pill tone={featuredMode.usesSalaryCap ? "success" : "brand"}>
                        {featuredMode.label}
                      </Pill>
                      <Pill tone="default">
                        {featuredLeague.membershipRole === "commissioner" ? "Commissioner" : "Manager"}
                      </Pill>
                    </div>
                    <div className="rounded-[1.5rem] border border-line bg-night/35 p-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
                        What&apos;s next
                      </p>
                      <p className="mt-3 text-lg font-semibold leading-tight text-foreground">
                        {featuredLeague.league.status === "live"
                          ? "Matches are live — check your scores."
                          : "Your next move is here."}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {buildLeagueNextAction(featuredLeague)}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Link
                        className={getButtonClassName({
                          className: "group",
                        })}
                        href={`/leagues/${featuredLeague.league.id}`}
                      >
                        Open featured league
                        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                      </Link>
                      <Link
                        className={getButtonClassName({
                          variant: "secondary",
                        })}
                        href="/players"
                      >
                        Open player board
                      </Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Link
                        className={getButtonClassName({
                          className: "justify-center",
                          variant: "secondary",
                        })}
                        href="/leagues/create"
                      >
                        <ShieldPlus className="size-4" />
                        Create league
                      </Link>
                      <Link
                        className={getButtonClassName({
                          className: "justify-center",
                          variant: "ghost",
                        })}
                        href={featuredMode.usesSalaryCap ? "/help" : "/leagues/join"}
                      >
                        <Sparkles className="size-4" />
                        {featuredMode.usesSalaryCap ? "Review lock rules" : "Join by code"}
                      </Link>
                    </div>
                  </div>
                </SurfaceCard>
              </MotionReveal>
            </section>

            <div className="grid gap-5">
              {prioritizedLeagues.map((summary, index) => (
                <MotionReveal
                  key={summary.league.id}
                  delay={80 + index * 60}
                  variant={index % 2 === 0 ? "up" : "scale"}
                >
                  <LeagueCard
                    league={{
                      id: summary.league.id,
                      name: summary.league.name,
                      status:
                        summary.membershipRole === "commissioner"
                          ? "Commissioner"
                          : "Manager",
                      record: `${summary.memberCount}/${summary.league.manager_count_target}`,
                      nextAction: buildLeagueNextAction(summary),
                      draftStatus: buildLeaguePhaseLabel(summary),
                    }}
                  />
                </MotionReveal>
              ))}
            </div>
          </div>
        );
      }}
    </FantasyAuthGate>
  );
}

function buildDashboardCallout(leagues: FantasyLeagueSummary[]) {
  const salaryCapLeague = leagues.find((league) =>
    getFantasyModeConfig(league.league).usesSalaryCap
  );

  if (salaryCapLeague) {
    const slate = getFantasyTargetSlate(salaryCapLeague.league);
    return `${salaryCapLeague.league.name} is tracking ${slate.label}, which locks ${new Date(slate.lock_at).toLocaleString()}.`;
  }

  const classicLeague = leagues[0];
  return `${classicLeague.league.name} is your lead classic league. Open it to keep draft, lineup, and waiver moves in one lane.`;
}

function buildDashboardHeadline(leagues: FantasyLeagueSummary[]) {
  const liveLeague = leagues.find((league) => league.league.status === "live");

  if (liveLeague) {
    return `${liveLeague.league.name} is live, so the dashboard is leading with the fastest next action.`;
  }

  return buildDashboardCallout(leagues);
}

function buildLeaguePriority(summary: FantasyLeagueSummary) {
  const modeConfig = getFantasyModeConfig(summary.league);
  let score = 0;

  if (summary.league.status === "live") {
    score += 30;
  }

  if (summary.membershipRole === "commissioner") {
    score += 12;
  }

  if (modeConfig.usesSalaryCap) {
    score += 8;
  }

  return score + summary.memberCount;
}

function buildLeagueWindowSummary(summary: FantasyLeagueSummary) {
  const modeConfig = getFantasyModeConfig(summary.league);

  if (modeConfig.usesSalaryCap) {
    const slate = getFantasyTargetSlate(summary.league);
    const status = getFantasySlateStatus(slate);

    return `${summary.league.name} • ${formatFantasySlateRange(slate)} • ${formatSlateStatusLabel(status)}`;
  }

  return `${summary.league.name} • ${modeConfig.scheduleLabel} • ${new Date(summary.league.draft_at).toLocaleString()}`;
}

function buildLeagueNextAction(summary: FantasyLeagueSummary) {
  const modeConfig = getFantasyModeConfig(summary.league);

  if (summary.league.status === "setup") {
    if (modeConfig.usesSalaryCap) {
      const slate = getFantasyTargetSlate(summary.league);
      return `${modeConfig.label} • ${slate.label} locks ${new Date(slate.lock_at).toLocaleString()}`;
    }

    return `${modeConfig.label} • ${modeConfig.scheduleLabel} ${new Date(summary.league.draft_at).toLocaleString()}`;
  }

  if (summary.league.status === "live") {
    return modeConfig.usesLiveDraftRoom
      ? "Draft room is live right now"
      : `${getFantasyTargetSlate(summary.league).label} is the live salary-cap window`;
  }

  if (summary.league.status === "ready") {
    return modeConfig.usesLiveDraftRoom
      ? "Roster is set up for weekly lineup decisions"
      : `${formatFantasySlateRange(getFantasyTargetSlate(summary.league))} is the next salary-cap window`;
  }

  return `League code ${summary.league.code} • ${modeConfig.label}`;
}

function buildLeaguePhaseLabel(summary: FantasyLeagueSummary) {
  const modeConfig = getFantasyModeConfig(summary.league);

  if (summary.league.status === "live") {
    if (modeConfig.usesLiveDraftRoom) {
      return "Draft live";
    }

    const slateStatus = getFantasySlateStatus(getFantasyTargetSlate(summary.league));
    return slateStatus === "live" ? "Slate live" : "Entry tracked";
  }

  if (summary.league.status === "ready") {
    return modeConfig.usesLiveDraftRoom ? "Draft complete" : "Contest ready";
  }

  return summary.memberCount >= summary.league.manager_count_target
    ? "League full"
    : "Filling league";
}

function formatSlateStatusLabel(status: ReturnType<typeof getFantasySlateStatus>) {
  if (status === "live") {
    return "live";
  }

  if (status === "complete") {
    return "complete";
  }

  return "upcoming";
}
