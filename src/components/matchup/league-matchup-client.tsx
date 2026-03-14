"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { Crown, Users2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { GuidedLeagueState } from "@/components/league/guided-setup-state";
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
              description="Pulling up your matchup details."
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
          const primarySetupAction = draftStillBlocking ? links.draft : links.team;
          const primarySetupLabel = draftStillBlocking ? "Open draft lobby" : "Open team hub";

          return (
            <MotionReveal>
              <GuidedLeagueState
                actions={
                  <>
                    <Link className={getButtonClassName()} href={primarySetupAction}>
                      {primarySetupLabel}
                    </Link>
                    <Link
                      className={getButtonClassName({
                        variant: "secondary",
                      })}
                      href={links.players}
                    >
                      Scout players
                    </Link>
                  </>
                }
                badge={needsMoreManagers ? "Fill the room" : "Draft still live"}
                description={
                  needsMoreManagers
                    ? "Head-to-head matchups unlock after another manager joins the circle."
                    : "Weekly fixtures publish when the draft flow is done and the room has real teams."
                }
                eyebrow="Matchup setup"
                highlights={
                  needsMoreManagers
                    ? ["Invite one more", "Crew first", "Fixtures next"]
                    : ["Draft closes first", "Lineups after", "Matchups unlock"]
                }
                icon={needsMoreManagers ? Users2 : Crown}
                steps={
                  needsMoreManagers
                    ? [
                        {
                          detail: "Share the invite link and get one more manager into the room.",
                          label: "Expand the circle",
                        },
                        {
                          detail: "Make sure every manager has a team identity before kickoff.",
                          label: "Lock the room",
                        },
                        {
                          detail: "Come back here once fixtures can auto-publish.",
                          label: "Open matchups",
                        },
                      ]
                    : [
                        {
                          detail: "Run the lobby and enter the room when the board is live.",
                          label: "Finish the draft",
                        },
                        {
                          detail: "Let every roster fill before the weekly schedule takes over.",
                          label: "Complete the board",
                        },
                        {
                          detail: "Return for the first real head-to-head story.",
                          label: "Check the matchup",
                        },
                      ]
                }
                title={needsMoreManagers ? "Need at least two managers" : "Draft still in progress"}
                tone={needsMoreManagers ? "accent" : "brand"}
              />
            </MotionReveal>
          );
        }

        if (error) {
          return <EmptyState description={error} title="Unable to load matchup" />;
        }

        if (!matchupState) {
          return (
            <EmptyState
              description="No matchup scheduled for this league yet."
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
