"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import {
  ArrowRight,
  CalendarRange,
  Clock3,
  Plus,
  Trophy,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { getButtonClassName } from "@/components/ui/button";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import {
  formatFantasySlateRange,
  getFantasySlateStatus,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import type { FantasyLeagueSummary, FantasySlateWindow } from "@/types/fantasy";

export function MatchupCenterClient() {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const [leagues, setLeagues] = useState<FantasyLeagueSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshLeagues = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagues([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const allLeagues = await dataClient.loadMyLeagues();
      setLeagues(allLeagues);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your leagues."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshLeagues();
  }, [dataClient, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingTitle="Loading matchups"
      loadingDescription="Checking your account."
      signedOutTitle="Sign in to continue"
      signedOutDescription="Sign in to see your matchups and contest entries."
      signedOutAction={
        <div className="flex flex-wrap justify-center gap-3">
          <Link className={getButtonClassName()} href="/signup">
            Create account
          </Link>
          <Link className={getButtonClassName({ variant: "secondary" })} href="/login">
            Sign in
          </Link>
        </div>
      }
    >
      {() => {
        if (isLoading) {
          return (
            <div className="grid gap-5 lg:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          );
        }

        if (error) {
          return <EmptyState title="Unable to load matchups" description={error} />;
        }

        const salaryCapLeagues = leagues.filter((l) =>
          getFantasyModeConfig(l.league).usesSalaryCap
        );
        const weeklyLeagues = salaryCapLeagues.filter(
          (l) => l.league.contest_horizon === "weekly"
        );
        const dailyLeagues = salaryCapLeagues.filter(
          (l) => l.league.contest_horizon === "daily"
        );
        const classicLeagues = leagues.filter(
          (l) => !getFantasyModeConfig(l.league).usesSalaryCap
        );

        if (leagues.length === 0) {
          return (
            <EmptyState
              title="No active contests"
              description="Create or join a league to start playing. Daily and weekly salary-cap leagues let you compete on every matchday."
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Link className={getButtonClassName()} href="/leagues/create">
                    Create a league
                  </Link>
                  <Link className={getButtonClassName({ variant: "secondary" })} href="/leagues/join">
                    Join with invite code
                  </Link>
                </div>
              }
            />
          );
        }

        return (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <MetricTile
                label="Weekly contests"
                value={weeklyLeagues.length}
                detail="Active weekly salary-cap leagues."
                tone="brand"
              />
              <MetricTile
                label="Daily contests"
                value={dailyLeagues.length}
                detail="Active daily salary-cap leagues."
                tone="accent"
              />
              <MetricTile
                label="Classic leagues"
                value={classicLeagues.length}
                detail="Season-long draft leagues."
              />
            </div>

            {salaryCapLeagues.length > 0 ? (
              <section className="space-y-4">
                {salaryCapLeagues.map((leagueSummary) => {
                  const modeConfig = getFantasyModeConfig(leagueSummary.league);
                  const slate = getFantasyTargetSlate(leagueSummary.league);
                  const slateStatus = getFantasySlateStatus(slate);

                  return (
                    <SalaryCapContestCard
                      key={leagueSummary.league.id}
                      leagueName={leagueSummary.league.name}
                      leagueId={leagueSummary.league.id}
                      cadenceLabel={modeConfig.cadenceLabel}
                      memberCount={leagueSummary.memberCount}
                      managerTarget={leagueSummary.league.manager_count_target}
                      salaryCap={leagueSummary.league.salary_cap_amount ?? 0}
                      slate={slate}
                      slateStatus={slateStatus}
                      role={leagueSummary.membershipRole}
                    />
                  );
                })}
              </section>
            ) : null}

            {classicLeagues.length > 0 ? (
              <SurfaceCard
                eyebrow="Classic leagues"
                title="Your season-long leagues"
                description="Draft-based leagues with weekly head-to-head matchups."
              >
                <div className="space-y-3">
                  {classicLeagues.map((leagueSummary) => (
                    <div
                      key={leagueSummary.league.id}
                      className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-line bg-white/6 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {leagueSummary.league.name}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {leagueSummary.memberCount}/{leagueSummary.league.manager_count_target} managers
                          {leagueSummary.membershipRole === "commissioner" ? " • Commissioner" : ""}
                        </p>
                      </div>
                      <Link
                        href={`/leagues/${leagueSummary.league.id}/matchup`}
                        className={getButtonClassName({ variant: "secondary" })}
                      >
                        Matchup
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            ) : null}

            <SurfaceCard
              eyebrow="Get playing"
              title="Start a new contest"
              description="Create a daily or weekly salary-cap league and invite friends."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/leagues/create?variant=salary_cap_daily"
                  className="group flex items-center gap-3 rounded-[1.2rem] border border-line bg-white/6 px-4 py-3 transition hover:border-brand-strong/35"
                >
                  <Plus className="size-5 text-brand-strong" />
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-brand-strong">
                      New daily contest
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Play a single matchday window
                    </p>
                  </div>
                </Link>
                <Link
                  href="/leagues/create?variant=salary_cap_weekly"
                  className="group flex items-center gap-3 rounded-[1.2rem] border border-line bg-white/6 px-4 py-3 transition hover:border-brand-strong/35"
                >
                  <Plus className="size-5 text-brand-strong" />
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-brand-strong">
                      New weekly contest
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Cover a full scoring round
                    </p>
                  </div>
                </Link>
              </div>
            </SurfaceCard>
          </div>
        );
      }}
    </FantasyAuthGate>
  );
}

function SalaryCapContestCard({
  leagueName,
  leagueId,
  cadenceLabel,
  memberCount,
  managerTarget,
  salaryCap,
  slate,
  slateStatus,
  role,
}: {
  leagueName: string;
  leagueId: string;
  cadenceLabel: string;
  memberCount: number;
  managerTarget: number;
  salaryCap: number;
  slate: FantasySlateWindow;
  slateStatus: "upcoming" | "live" | "complete";
  role: string;
}) {
  const statusTone =
    slateStatus === "live"
      ? "brand"
      : slateStatus === "upcoming"
        ? "accent"
        : "default";
  const statusLabel =
    slateStatus === "live"
      ? "Live now"
      : slateStatus === "upcoming"
        ? "Upcoming"
        : "Complete";

  return (
    <SurfaceCard
      eyebrow={`${cadenceLabel} contest`}
      title={leagueName}
      description={`${memberCount}/${managerTarget} managers • $${salaryCap} cap • ${role === "commissioner" ? "Commissioner" : "Manager"}`}
      tone={statusTone === "brand" ? "brand" : undefined}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Pill tone={statusTone === "brand" ? "brand" : statusTone === "accent" ? "success" : "default"}>
            {statusLabel}
          </Pill>
          <Pill tone="default">
            <CalendarRange className="size-3.5" />
            {slate.label}
          </Pill>
          <Pill tone="default">
            {formatFantasySlateRange(slate)}
          </Pill>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              <Clock3 className="mr-1 inline size-3.5" />
              Lock time
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {new Date(slate.lock_at).toLocaleString()}
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              <Trophy className="mr-1 inline size-3.5" />
              Matches
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {slate.match_count} match{slate.match_count === 1 ? "" : "es"}
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Budget
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              ${salaryCap}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/leagues/${leagueId}/team`}
            className={getButtonClassName({ className: "group" })}
          >
            {slateStatus === "upcoming" ? "Build entry" : slateStatus === "live" ? "View entry" : "Review entry"}
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={`/leagues/${leagueId}`}
            className={getButtonClassName({ variant: "secondary" })}
          >
            League home
          </Link>
        </div>
      </div>
    </SurfaceCard>
  );
}
