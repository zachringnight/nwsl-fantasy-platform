"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { getButtonClassName } from "@/components/ui/button";
import { LeagueCommandCenter } from "@/features/commissioner/components/league-command-center";
import { ClassicLeagueBrief } from "@/features/classic/components/classic-league-brief";
import { SalaryCapLeagueBrief } from "@/features/salary-cap/components/salary-cap-league-brief";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import {
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import { buildLeagueLinks } from "@/lib/league-links";
import type { FantasyLeagueDetails } from "@/types/fantasy";

export interface LeagueHomeClientProps {
  leagueId: string;
}

export function LeagueHomeClient({ leagueId }: LeagueHomeClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session, user } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isLoadingLeague, setIsLoadingLeague] = useState(false);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);

  const refreshLeague = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagueDetails(null);
      setIsLoadingLeague(false);
      return;
    }

    setIsLoadingLeague(true);
    setError("");

    try {
      setLeagueDetails(await dataClient.loadLeagueById(leagueId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load that league."
      );
    } finally {
      setIsLoadingLeague(false);
    }
  });

  useEffect(() => {
    void refreshLeague();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before opening the league."
      loadingTitle="Loading league"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Complete onboarding before opening a league."
      signedOutDescription="Sign in before opening this league."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoadingLeague) {
          return (
            <EmptyState
              description="Loading league details and member activity."
              title="Loading league"
            />
          );
        }

        if (error) {
          return <EmptyState description={error} title="Unable to load league" />;
        }

        if (!leagueDetails) {
          return (
            <EmptyState
              description="That league could not be found."
              title="League not found"
            />
          );
        }

        const isCommissioner = leagueDetails.league.commissioner_user_id === user?.id;
        const invitePath = `/leagues/join?code=${leagueDetails.league.code}`;
        const modeConfig = getFantasyModeConfig(leagueDetails.league);
        const links = buildLeagueLinks(leagueId);
        const primaryAction =
          leagueDetails.league.status === "setup"
            ? modeConfig.usesLiveDraftRoom
              ? {
                  href: links.draft,
                  label: "Open draft lobby",
                }
              : {
                  href: links.team,
                  label: "Open salary-cap hub",
                }
            : leagueDetails.league.status === "live" && modeConfig.usesLiveDraftRoom
              ? {
                  href: links.draftRoom,
                  label: "Enter draft room",
                }
              : modeConfig.usesSalaryCap
                ? {
                    href: links.team,
                    label: "Open salary-cap hub",
                  }
                : {
                    href: links.team,
                    label: "Set lineup",
                  };
        const secondaryAction =
          leagueDetails.league.status === "ready" && !modeConfig.usesSalaryCap
            ? {
                href: links.players,
                label: "Scout players",
              }
            : modeConfig.usesSalaryCap
              ? {
                  href: links.players,
                  label: "Browse player salaries",
                }
              : {
                  href: links.matchup,
                  label: "Open matchup",
                };
        const ownershipLabel =
          leagueDetails.league.player_ownership_mode === "exclusive"
            ? "Exclusive player ownership"
            : "Shared player pool";
        const cadenceLabel = `${modeConfig.cadenceLabel} cadence`;
        const activeSlate = modeConfig.usesSalaryCap
          ? getFantasyTargetSlate(leagueDetails.league)
          : null;
        const exploreAction = modeConfig.usesSalaryCap
          ? {
              href: links.players,
              label: "Browse player salaries",
            }
          : leagueDetails.league.status === "setup"
            ? {
                href: links.players,
                label: "Scout draft board",
              }
            : {
                href: links.standings,
                label: "Open standings",
              };
        const scheduleSummary = activeSlate
          ? `${activeSlate.label} locks ${new Date(activeSlate.lock_at).toLocaleString()}`
          : `${modeConfig.scheduleLabel}: ${new Date(leagueDetails.league.draft_at).toLocaleString()}`;

        return (
          <MotionReveal>
            <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              {activeSlate ? (
                <SalaryCapLeagueBrief
                  leagueDetails={leagueDetails}
                  primaryActionHref={primaryAction.href}
                  primaryActionLabel={primaryAction.label}
                  secondaryActionHref={secondaryAction.href}
                  secondaryActionLabel={secondaryAction.label}
                  slate={activeSlate}
                />
              ) : (
                <ClassicLeagueBrief
                  description={modeConfig.description}
                  leagueDetails={leagueDetails}
                  primaryActionHref={primaryAction.href}
                  primaryActionLabel={primaryAction.label}
                  secondaryActionHref={secondaryAction.href}
                  secondaryActionLabel={secondaryAction.label}
                />
              )}

              <LeagueCommandCenter
                cadenceLabel={cadenceLabel}
                exploreHref={exploreAction.href}
                exploreLabel={exploreAction.label}
                invitePath={invitePath}
                isCommissioner={isCommissioner}
                leagueDetails={leagueDetails}
                ownershipLabel={ownershipLabel}
                rosterBuilderLabel={
                  leagueDetails.league.roster_build_mode === "snake_draft"
                    ? "Snake draft"
                    : "Salary cap"
                }
                scheduleSummary={scheduleSummary}
                secondarySummary={
                  activeSlate
                    ? "Salary-cap lock and submission rules track the active slate."
                    : "Classic leagues keep draft, lineup, and waiver context visible."
                }
                settingsHref={links.settings}
              />
            </section>
          </MotionReveal>
        );
      }}
    </FantasyAuthGate>
  );
}
