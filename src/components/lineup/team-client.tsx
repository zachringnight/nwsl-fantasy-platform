"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { Crown } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { GuidedLeagueState } from "@/components/league/guided-setup-state";
import { SalaryCapEntryBuilder } from "@/components/lineup/salary-cap-entry-builder";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getButtonClassName } from "@/components/ui/button";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ClassicTeamManager } from "@/features/classic/components/classic-team-manager";
import { SalaryCapLeagueBrief } from "@/features/salary-cap/components/salary-cap-league-brief";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { buildSuggestedLineup, starterLineupSlots } from "@/lib/fantasy-draft";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import { getFantasyTargetSlate } from "@/lib/fantasy-slate-engine";
import type {
  FantasyLeagueDetails,
  FantasyLineupSlot,
  FantasyRosterPlayer,
} from "@/types/fantasy";

export interface TeamClientProps {
  leagueId: string;
}

export function TeamClient({ leagueId }: TeamClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const [roster, setRoster] = useState<FantasyRosterPlayer[]>([]);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, FantasyLineupSlot | "">>({});

  const refreshRoster = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagueDetails(null);
      setRoster([]);
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
        setRoster([]);
        setAssignments({});
        return;
      }

      const nextState = await dataClient.loadRosterState(leagueId);
      setRoster(nextState.roster);
      setAssignments(createAssignmentState(nextState.roster));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load roster state."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshRoster();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  async function handleAutofill() {
    setIsSaving(true);
    setError("");

    try {
      const nextState = await dataClient.autofillRosterLineup(leagueId);
      setRoster(nextState.roster);
      setAssignments(createAssignmentState(nextState.roster));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to autofill the lineup."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setError("");

    try {
      const nextState = await dataClient.saveRosterLineup(
        leagueId,
        roster.map((player) => ({
          rosterId: player.id,
          lineupSlot: (assignments[player.id] || null) as FantasyLineupSlot | null,
        }))
      );

      setRoster(nextState.roster);
      setAssignments(createAssignmentState(nextState.roster));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to save the lineup."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before opening the team page."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before editing a lineup."
      signedOutDescription="Sign in before opening team tools."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && roster.length === 0) {
          return (
            <EmptyState
              description="Getting your roster and lineup ready."
              title="Loading team hub"
            />
          );
        }

        if (error && roster.length === 0) {
          return <EmptyState description={error} title="Unable to load team tools" />;
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
        const links = buildLeagueLinks(leagueId);

        if (modeConfig.usesSalaryCap) {
          const slate = getFantasyTargetSlate(leagueDetails.league);

          return (
            <section className="space-y-5">
              <MotionReveal>
                <SalaryCapLeagueBrief
                  description="Build your entry under the salary cap before the window locks."
                  leagueDetails={leagueDetails}
                  primaryActionHref={links.players}
                  primaryActionLabel="Browse player salaries"
                  secondaryActionHref={links.matchup}
                  secondaryActionLabel="Open contest pulse"
                  slate={slate}
                  title="Single-entry control room"
                />
              </MotionReveal>

              <MotionReveal delay={80}>
                <SalaryCapEntryBuilder leagueDetails={leagueDetails} leagueId={leagueId} />
              </MotionReveal>
            </section>
          );
        }

        if (roster.length === 0) {
          return (
            <GuidedLeagueState
              actions={
                <>
                  <Link className={getButtonClassName()} href={links.draft}>
                    Open draft lobby
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
              badge="Before kickoff"
              description="This page becomes your lineup studio once the room has real picks. Draft first, then shape the starters."
              highlights={["Draft board first", "Lineup studio", "Week-one ready"]}
              icon={Crown}
              steps={[
                {
                  detail: "Fill the league and lock the room setup.",
                  label: "Open the lobby",
                },
                {
                  detail: "Run the draft so your roster has real players to place.",
                  label: "Build your squad",
                },
                {
                  detail: "Come back here to set starters and save the week-one shape.",
                  label: "Set the lineup",
                },
              ]}
              title="Draft your roster first"
              tone="brand"
              eyebrow="Team setup"
            />
          );
        }

        const rosterWithAssignments = roster.map((player) => ({
          ...player,
          lineup_slot: (assignments[player.id] || null) as FantasyLineupSlot | null,
        }));
        const missingStarterSlots = starterLineupSlots.filter(
          (slot) => !rosterWithAssignments.some((player) => player.lineup_slot === slot)
        );

        return (
          <MotionReveal>
            <ClassicTeamManager
              assignments={assignments}
              error={error}
              isSaving={isSaving}
              missingStarterSlots={missingStarterSlots}
              onAssignmentChange={(rosterId, slot) => {
                setAssignments((current) => ({
                  ...current,
                  [rosterId]: slot,
                }));
              }}
              onAutofill={handleAutofill}
              onSave={handleSave}
              roster={roster}
            />
          </MotionReveal>
        );
      }}
    </FantasyAuthGate>
  );
}

function createAssignmentState(roster: FantasyRosterPlayer[]) {
  const hasSavedLineup = roster.some((player) => player.lineup_slot != null);
  const sourceAssignments = hasSavedLineup
    ? new Map(roster.map((player) => [player.id, player.lineup_slot]))
    : buildSuggestedLineup(roster);

  return roster.reduce<Record<string, FantasyLineupSlot | "">>((accumulator, player) => {
    accumulator[player.id] = (sourceAssignments.get(player.id) ?? "") as FantasyLineupSlot | "";
    return accumulator;
  }, {});
}
