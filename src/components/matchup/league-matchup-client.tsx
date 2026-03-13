"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { getButtonClassName } from "@/components/ui/button";
import { ClassicMatchupStoryboard } from "@/features/matchup/components/classic-matchup-storyboard";
import { SalaryCapMatchupPlaceholder } from "@/features/matchup/components/salary-cap-matchup-placeholder";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import type {
  FantasyLeagueDetails,
  FantasyLeagueMatchupState,
} from "@/types/fantasy";

export interface LeagueMatchupClientProps {
  leagueId: string;
}

export function LeagueMatchupClient({ leagueId }: LeagueMatchupClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const links = buildLeagueLinks(leagueId);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);
  const [matchupState, setMatchupState] = useState<FantasyLeagueMatchupState | null>(null);

  const refreshMatchup = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagueDetails(null);
      setMatchupState(null);
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
      const modeConfig = getFantasyModeConfig(details.league);
      const hasClassicMatchupWindow =
        !modeConfig.usesSalaryCap &&
        details.memberships.length > 1 &&
        ["ready", "complete"].includes(details.league.status);

      if (!hasClassicMatchupWindow) {
        setMatchupState(null);
        return;
      }

      setMatchupState(await dataClient.loadLeagueMatchup(leagueId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the matchup."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshMatchup();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before opening matchup view."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before opening matchup view."
      signedOutDescription="Sign in before opening matchup view."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && !leagueDetails) {
          return (
            <EmptyState
              description="Loading the league state and current matchup context."
              title="Loading matchup"
            />
          );
        }

        if (error && !leagueDetails) {
          return <EmptyState description={error} title="Unable to load matchup" />;
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
              <SalaryCapMatchupPlaceholder
                modeDescription={`${modeConfig.label} tracks entry results and slate movement instead of one-on-one weekly matchups.`}
                playersHref={links.players}
                teamHref={links.team}
              />
            </MotionReveal>
          );
        }

        const needsMoreManagers = leagueDetails.memberships.length < 2;
        const draftStillBlocking =
          leagueDetails.league.status === "setup" ||
          leagueDetails.league.status === "live";

        if (needsMoreManagers || draftStillBlocking) {
          return (
            <MotionReveal>
              <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <SurfaceCard
                  description="Weekly matchups publish after the room fills and the roster cycle is ready to compare real teams."
                  eyebrow="Matchup readiness"
                  title="Fixtures publish after the league fills and the draft closes"
                >
                  <div className="flex flex-wrap gap-3">
                    <Link className={getButtonClassName()} href={links.team}>
                      Open team hub
                    </Link>
                    <Link
                      className={getButtonClassName({
                        variant: "secondary",
                      })}
                      href={links.players}
                    >
                      Scout players
                    </Link>
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description={
                    needsMoreManagers
                      ? "Add another manager before publishing head-to-head fixtures."
                      : "Finish the draft flow before the matchup engine takes over."
                  }
                  eyebrow="Blocking reason"
                  title={needsMoreManagers ? "Need at least two managers" : "Draft still in progress"}
                  tone="accent"
                />
              </section>
            </MotionReveal>
          );
        }

        if (error) {
          return <EmptyState description={error} title="Unable to load matchup" />;
        }

        if (!matchupState) {
          return (
            <EmptyState
              description="No weekly matchup state is available for this league yet."
              title="Matchup unavailable"
            />
          );
        }

        return (
          <MotionReveal>
            <ClassicMatchupStoryboard
              leagueDetails={leagueDetails}
              matchupState={matchupState}
            />
          </MotionReveal>
        );
      }}
    </FantasyAuthGate>
  );
}
