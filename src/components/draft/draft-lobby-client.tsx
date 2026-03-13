"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBanner } from "@/components/common/status-banner";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import type { FantasyDraftState } from "@/types/fantasy";

export interface DraftLobbyClientProps {
  leagueId: string;
}

export function DraftLobbyClient({ leagueId }: DraftLobbyClientProps) {
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, session, supabaseReady } = useFantasyAuth();
  const [draftState, setDraftState] = useState<FantasyDraftState | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const links = buildLeagueLinks(leagueId);

  const refreshDraftState = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setDraftState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      setDraftState(await dataClient.loadDraftState(leagueId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the draft lobby."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshDraftState();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  useEffect(() => {
    if (!session || !profile?.onboarding_complete || draftState?.draft.status === "complete") {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshDraftState();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 4000);

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [draftState?.draft.status, profile?.onboarding_complete, session]);

  async function handleRevealOrder() {
    setBusyAction("reveal");
    setError("");

    try {
      setDraftState(await dataClient.revealDraftOrder(leagueId));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to reveal the draft order."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleStatusChange(nextStatus: "live" | "paused") {
    setBusyAction(nextStatus);
    setError("");

    try {
      setDraftState(await dataClient.updateDraftStatus(leagueId, nextStatus));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update the draft status."
      );
    } finally {
      setBusyAction("");
    }
  }

  if (!supabaseReady) {
    return (
      <EmptyState
        title="Draft lobby unavailable"
        description="Something went wrong. Please try again in a moment."
      />
    );
  }

  if (!hasHydrated) {
    return (
      <EmptyState
        title="Checking your account"
        description="Looking for your account before loading the draft lobby."
      />
    );
  }

  if (!session || !profile) {
    return (
      <EmptyState
        title="Sign in to continue"
        description="The draft lobby is available once you are signed in."
      />
    );
  }

  if (!profile.onboarding_complete) {
    return (
      <EmptyState
        title="Finish onboarding first"
        description="Set your club and fantasy experience level before opening a draft lobby."
      />
    );
  }

  if (isLoading && !draftState) {
    return (
      <EmptyState
        title="Loading draft lobby"
        description="Loading the order, status, and member list."
      />
    );
  }

  if (error && !draftState) {
    return <EmptyState title="Unable to load draft lobby" description={error} />;
  }

  if (!draftState) {
    return (
      <EmptyState
        title="Draft not found"
        description="That league does not have a draft state yet."
      />
    );
  }

  const modeConfig = getFantasyModeConfig(draftState.league);

  if (!modeConfig.usesLiveDraftRoom) {
    return (
      <EmptyState
        title={`${modeConfig.label} does not use a draft room`}
        description="This format uses the contest-entry hub instead of a live snake draft."
        action={
          <Link href={links.team} className={getButtonClassName()}>
            Open team hub
          </Link>
        }
      />
    );
  }

  const hasOrder = draftState.memberships.every((membership) => membership.draft_slot != null);

  return (
    <section className="space-y-5">
      {error ? (
        <StatusBanner
          title="Draft action"
          message={error}
          tone="warning"
        />
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
        <SurfaceCard
          eyebrow="Draft status"
          title={draftState.league.name}
          description={`${modeConfig.label} • ${draftState.draft.total_rounds} rounds • ${draftState.memberships.length} managers`}
        >
          <div className="space-y-4">
            <StatusBanner
              title={draftState.draft.status}
              message={
                draftState.draft.status === "complete"
                  ? "The room is complete. Review the recap and move managers into lineup setup."
                  : draftState.draft.status === "live"
                    ? "The room is live. Enter the draft room to follow the active clock."
                    : hasOrder
                      ? "The order is locked in. The commissioner can open the room at any time."
                      : "Reveal a randomized snake order before the room opens."
              }
              tone={
                draftState.draft.status === "complete"
                  ? "success"
                  : draftState.draft.status === "live"
                    ? "warning"
                    : "info"
              }
            />

            <div className="flex flex-wrap gap-3">
              <Link
                href={links.draftRoom}
                className={getButtonClassName()}
              >
                Enter draft room
              </Link>
              <Link
                href={links.draftRecap}
                className={getButtonClassName({
                  variant: "secondary",
                })}
              >
                View recap
              </Link>
              <Link
                href={links.team}
                className={getButtonClassName({
                  variant: "secondary",
                })}
              >
                Open team editor
              </Link>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow={draftState.canCommissionerControl ? "Commissioner controls" : "Lobby controls"}
          title="Open, pause, and resume"
          description="Reveal the order, open the room, and keep the clock fair without losing the atmosphere of draft night."
          tone="accent"
        >
          {draftState.canCommissionerControl ? (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busyAction !== "" || draftState.draft.status === "complete"}
                onClick={() => {
                  void handleRevealOrder();
                }}
                type="button"
                variant="secondary"
              >
                {busyAction === "reveal" ? "Revealing..." : hasOrder ? "Reshuffle order" : "Reveal order"}
              </Button>

              {draftState.draft.status === "live" ? (
                <Button
                  disabled={busyAction !== ""}
                  onClick={() => {
                    void handleStatusChange("paused");
                  }}
                  type="button"
                >
                  {busyAction === "paused" ? "Pausing..." : "Pause draft"}
                </Button>
              ) : (
                <Button
                  disabled={busyAction !== "" || !hasOrder || draftState.draft.status === "complete"}
                  onClick={() => {
                    void handleStatusChange("live");
                  }}
                  type="button"
                >
                  {busyAction === "live" ? "Opening..." : draftState.draft.status === "paused" ? "Resume draft" : "Start draft"}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">
              Review the draft order here, then enter the live room once it opens.
            </p>
          )}
        </SurfaceCard>
      </section>

      <SurfaceCard
        eyebrow="Draft order"
        title={hasOrder ? "Snake order is locked" : "Waiting on reveal"}
        description="Order is revealed in the lobby first so the room itself can stay focused on the clock, queue, and board."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortMemberships(draftState.memberships).map((membership, index) => (
            <div
              key={membership.id}
              className="rounded-[1.2rem] border border-line bg-white/80 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {membership.draft_slot ? `Slot ${membership.draft_slot}` : `Manager ${index + 1}`}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {membership.display_name}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                {membership.team_name}
              </p>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </section>
  );
}

function sortMemberships(memberships: FantasyDraftState["memberships"]) {
  return [...memberships].sort((left, right) => {
    if (left.draft_slot != null && right.draft_slot != null) {
      return left.draft_slot - right.draft_slot;
    }

    if (left.draft_slot != null) {
      return -1;
    }

    if (right.draft_slot != null) {
      return 1;
    }

    return new Date(left.joined_at).getTime() - new Date(right.joined_at).getTime();
  });
}
