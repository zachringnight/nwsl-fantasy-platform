"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import {
  formatFantasySlateRange,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import type { FantasyLeagueDetails } from "@/types/fantasy";

export interface LeagueSettingsClientProps {
  leagueId: string;
}

export function LeagueSettingsClient({ leagueId }: LeagueSettingsClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session, user } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);

  const refreshLeague = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagueDetails(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      setLeagueDetails(await dataClient.loadLeagueById(leagueId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load league settings."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshLeague();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before opening league settings."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before opening league settings."
      signedOutDescription="Sign in before opening league settings."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && !leagueDetails) {
          return (
            <EmptyState
              description="Loading the league configuration."
              title="Loading settings"
            />
          );
        }

        if (error && !leagueDetails) {
          return <EmptyState description={error} title="Unable to load settings" />;
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
        const isCommissioner = leagueDetails.league.commissioner_user_id === user?.id;
        const activeSlate = modeConfig.usesSalaryCap
          ? getFantasyTargetSlate(leagueDetails.league)
          : null;
        const commissionerName =
          leagueDetails.memberships.find(
            (member) => member.user_id === leagueDetails.league.commissioner_user_id
          )?.display_name ?? "Unknown";

        return (
          <section className="space-y-5">
            <MotionReveal>
              <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <SurfaceCard
                  description="League rules stay visible so everyone knows exactly how this room works."
                  eyebrow="League integrity"
                  title={modeConfig.label}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Pill tone="brand">
                        {leagueDetails.league.roster_build_mode === "snake_draft"
                          ? "Snake draft"
                          : "Salary cap"}
                      </Pill>
                      <Pill tone="default">
                        {leagueDetails.league.player_ownership_mode === "exclusive"
                          ? "Exclusive rosters"
                          : "Shared player pool"}
                      </Pill>
                      <Pill tone="success">{modeConfig.cadenceLabel} cadence</Pill>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <MetricTile
                        detail="Share this code with the next manager you want in the room."
                        label="League code"
                        value={leagueDetails.league.code}
                      />
                      <MetricTile
                        detail={
                          activeSlate
                            ? formatFantasySlateRange(activeSlate)
                            : "Commissioner-set draft kickoff remains the primary schedule anchor."
                        }
                        label={activeSlate ? "Active slate" : "Draft timing"}
                        tone="brand"
                        value={
                          activeSlate
                            ? activeSlate.label
                            : new Date(leagueDetails.league.draft_at).toLocaleDateString()
                        }
                      />
                    </div>

                    <div className="rounded-[1.35rem] border border-line bg-panel-soft p-4 text-sm leading-6 text-muted">
                      <p className="font-semibold text-foreground">Timing rule</p>
                      <p className="mt-2">
                        {activeSlate
                          ? `${activeSlate.label} locks ${new Date(activeSlate.lock_at).toLocaleString()} and runs ${formatFantasySlateRange(activeSlate)}.`
                          : `${modeConfig.scheduleLabel}: ${new Date(leagueDetails.league.draft_at).toLocaleString()}.`}
                      </p>
                      {leagueDetails.league.salary_cap_amount ? (
                        <p className="mt-2">Salary cap: ${leagueDetails.league.salary_cap_amount}</p>
                      ) : null}
                    </div>
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description={
                    isCommissioner
                      ? "You can manage invites and communications while the core competition rules stay fixed."
                      : "Core competition settings stay fixed once managers have joined."
                  }
                  eyebrow={isCommissioner ? "Commissioner scope" : "Manager visibility"}
                  title={isCommissioner ? "What you can still operate" : "What stays fixed now"}
                  tone="accent"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricTile
                      detail="League capacity is pinned for invitation planning."
                      label="Managers"
                      tone="accent"
                      value={`${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target}`}
                    />
                    <MetricTile
                      detail="The owner of this league remains visible throughout the league."
                      label="Commissioner"
                      tone="accent"
                      value={commissionerName}
                    />
                  </div>

                  <div className="mt-4 rounded-[1.35rem] border border-line bg-night/35 p-4 text-sm leading-6 text-muted">
                    <p className="font-semibold text-foreground">Member list</p>
                    <p className="mt-2">
                      {leagueDetails.memberships.map((member) => member.display_name).join(", ")}
                    </p>
                    <p className="mt-4 font-semibold text-foreground">Current status</p>
                    <p className="mt-2 capitalize">{leagueDetails.league.status}</p>
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
