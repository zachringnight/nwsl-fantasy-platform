"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { LineupPitch } from "@/components/lineup/lineup-pitch";
import { buildSuggestedLineup } from "@/lib/fantasy-draft";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { FantasyDraftState, FantasyRosterPlayer } from "@/types/fantasy";

export interface DraftRecapClientProps {
  leagueId: string;
}

export function DraftRecapClient({ leagueId }: DraftRecapClientProps) {
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, session, supabaseReady } = useFantasyAuth();
  const [draftState, setDraftState] = useState<FantasyDraftState | null>(null);
  const [error, setError] = useState("");
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
          : "Unable to load the draft recap."
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

    const intervalId = window.setInterval(refreshIfVisible, 5000);

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [draftState?.draft.status, profile?.onboarding_complete, session]);

  if (!supabaseReady) {
    return (
      <EmptyState
        title="Draft recap unavailable"
        description="Something went wrong. Please try again in a moment."
      />
    );
  }

  if (!hasHydrated) {
    return (
      <EmptyState
        title="Checking your account"
        description="Looking for your account before opening the draft recap."
      />
    );
  }

  if (!session || !profile) {
    return (
      <EmptyState
        title="Sign in to continue"
        description="The draft recap is available once you are signed in."
      />
    );
  }

  if (!profile.onboarding_complete) {
    return (
      <EmptyState
        title="Finish onboarding first"
        description="Set your club and fantasy experience level before reviewing the recap."
      />
    );
  }

  if (isLoading && !draftState) {
    return (
      <EmptyState
        title="Loading recap"
        description="Loading the room history and roster."
      />
    );
  }

  if (error && !draftState) {
    return <EmptyState title="Unable to load recap" description={error} />;
  }

  if (!draftState || draftState.picks.length === 0) {
    return (
      <EmptyState
        title="No draft recap yet"
        description="This recap fills in once the room has logged picks."
      />
    );
  }

  const recapRoster = applySuggestedSlots(draftState.myRoster);
  const rosterProjection = recapRoster.reduce(
    (total, player) => total + player.player.average_points,
    0
  );
  const topProjectionPlayer = [...recapRoster].sort(
    (left, right) => right.player.average_points - left.player.average_points
  )[0] ?? null;
  const myPicks = draftState.picks.filter(
    (pick) => pick.manager_user_id === session.user.id
  );

  return (
    <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="space-y-5">
        <LineupPitch roster={recapRoster} title="Recommended week-one shape" />
        <SurfaceCard
          eyebrow="Roster read"
          title="What the draft built"
          description="See the scoring profile your roster came out of the draft with, not just the names you selected."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                detail="Current roster-wide baseline from average fantasy points."
                label="Roster projection"
                tone="brand"
                value={rosterProjection.toFixed(1)}
              />
              <MetricTile
                detail="Player currently driving the most weekly upside."
                label="Projection driver"
                tone="accent"
                value={topProjectionPlayer ? topProjectionPlayer.player_name : "N/A"}
              />
              <MetricTile
                detail="How many selections this manager made in the room."
                label="Your picks"
                value={myPicks.length}
              />
              <MetricTile
                detail="Immediate scoring anchor after the draft closes."
                label="Scoring read"
                value={topProjectionPlayer ? getScoringFitLabel(topProjectionPlayer.player_position) : "Building"}
              />
            </div>

            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-7 text-foreground">
              Weekly score starts with appearance ({launchScoringRules.appearance}) and 60+ minute ({launchScoringRules.minutes60Plus}) base points, then rises on goals, assists, clean sheets, and saves. This roster currently leans on{" "}
              {topProjectionPlayer
                ? `${topProjectionPlayer.player_name} and the ${getScoringFitLabel(topProjectionPlayer.player_position).toLowerCase()} lane`
                : "its best projected starter lane"}
              {" "}to create the early weekly edge.
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Next move"
          title="Finish lineup prep"
          description="Your drafted roster is ready — set your first lineup now."
        >
          <div className="flex flex-wrap gap-3">
            <Link
              href={links.team}
              className={getButtonClassName()}
            >
              Open team editor
            </Link>
            <Link
              href={links.players}
              className={getButtonClassName({
                variant: "secondary",
              })}
            >
              Scout players
            </Link>
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard
        eyebrow="League recap"
        title="Pick board"
        description="See every pick, who got what, and how rosters shaped up."
        tone="accent"
      >
        <div className="space-y-3">
          {draftState.picks.map((pick) => (
            <div
              key={pick.id}
              className={[
                "rounded-[1.2rem] border px-4 py-3",
                pick.manager_user_id === session.user.id
                  ? "border-brand-strong/35 bg-[linear-gradient(135deg,rgba(0,225,255,0.08)_0%,rgba(5,34,255,0.16)_52%,rgba(255,255,255,0.04)_100%)]"
                  : "border-line bg-panel-soft",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Pick {pick.overall_pick} • {pick.player_name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                    Round {pick.round_number} • {pick.club_name} • {pick.player_position} • {pick.source}
                  </p>
                </div>
                <div className="text-right text-sm text-muted">
                  <p>{getPickProjection(pick, draftState).toFixed(1)} pts</p>
                  <p>{getScoringFitLabel(pick.player_position)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </section>
  );
}

function applySuggestedSlots(roster: FantasyRosterPlayer[]) {
  if (roster.some((player) => player.lineup_slot != null)) {
    return roster;
  }

  const suggestedLineup = buildSuggestedLineup(roster);

  return roster.map((player) => ({
    ...player,
    lineup_slot: suggestedLineup.get(player.id) ?? null,
  }));
}

function getPickProjection(
  pick: FantasyDraftState["picks"][number],
  draftState: FantasyDraftState
) {
  const myRosterMatch = draftState.myRoster.find((player) => player.player_id === pick.player_id);
  return myRosterMatch?.player.average_points ?? getFantasyPlayerById(pick.player_id)?.average_points ?? 0;
}

function getScoringFitLabel(position: "GK" | "DEF" | "MID" | "FWD") {
  if (position === "GK") {
    return "Save ceiling";
  }

  if (position === "DEF") {
    return "Clean-sheet floor";
  }

  if (position === "MID") {
    return "Assist engine";
  }

  return "Goal ceiling";
}
