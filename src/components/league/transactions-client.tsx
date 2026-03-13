"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBanner } from "@/components/common/status-banner";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { FantasyTransactionHubState } from "@/types/fantasy";

export interface TransactionsClientProps {
  leagueId: string;
}

export function TransactionsClient({ leagueId }: TransactionsClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const searchParams = useSearchParams();
  const links = buildLeagueLinks(leagueId);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [hubState, setHubState] = useState<FantasyTransactionHubState | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedDropRosterSlotId, setSelectedDropRosterSlotId] = useState("");
  const deferredSearch = useDeferredValue(search);

  const refreshHub = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setHubState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      setHubState(await dataClient.loadTransactionHub(leagueId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the transaction center."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshHub();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  useEffect(() => {
    if (!hubState) {
      return;
    }

    const preferredPlayerId = searchParams.get("playerId");

    if (
      preferredPlayerId &&
      hubState.claimable_players.some((player) => player.id === preferredPlayerId)
    ) {
      setSelectedPlayerId(preferredPlayerId);
      return;
    }

    if (!selectedPlayerId && hubState.claimable_players[0]) {
      setSelectedPlayerId(hubState.claimable_players[0].id);
    }
  }, [hubState, searchParams, selectedPlayerId]);

  const filteredPlayers = !hubState
    ? []
    : hubState.claimable_players.filter((player) => {
        const query = deferredSearch.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return (
          player.display_name.toLowerCase().includes(query) ||
          player.club_name.toLowerCase().includes(query)
        );
      });

  async function handleSubmitClaim() {
    if (!selectedPlayerId) {
      setError("Choose a player to claim.");
      return;
    }

    setBusyAction("submit");
    setError("");

    try {
      setHubState(
        await dataClient.submitWaiverClaim(leagueId, {
          playerId: selectedPlayerId,
          dropRosterSlotId: selectedDropRosterSlotId || null,
        })
      );
      setSelectedDropRosterSlotId("");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to submit that waiver claim."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleCancelClaim(claimId: string) {
    setBusyAction(claimId);
    setError("");

    try {
      setHubState(await dataClient.cancelWaiverClaim(leagueId, claimId));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to cancel that waiver claim."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleProcessClaims() {
    setBusyAction("process");
    setError("");

    try {
      setHubState(await dataClient.processWaiverClaims(leagueId));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to process waiver claims."
      );
    } finally {
      setBusyAction("");
    }
  }

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before opening the transaction center."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before opening transactions."
      signedOutDescription="Sign in before opening transactions."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && !hubState) {
          return (
            <EmptyState
              description="Loading waiver claims, transaction history, and roster state."
              title="Loading transactions"
            />
          );
        }

        if (error && !hubState) {
          return <EmptyState description={error} title="Unable to load transactions" />;
        }

        if (!hubState) {
          return (
            <EmptyState
              description="That league could not be found."
              title="Transaction center unavailable"
            />
          );
        }

        const modeConfig = getFantasyModeConfig(hubState.league);
        const rosterIsFull = hubState.roster.length >= 12;
        const selectedPlayer =
          hubState.claimable_players.find((player) => player.id === selectedPlayerId) ?? null;
        const selectedDropPlayer =
          hubState.roster.find((player) => player.id === selectedDropRosterSlotId) ?? null;
        const selectedProjectionDelta = selectedPlayer
          ? selectedPlayer.average_points - (selectedDropPlayer?.player.average_points ?? 0)
          : 0;

        if (modeConfig.usesSalaryCap) {
          return (
            <MotionReveal>
              <section className="grid gap-5 lg:grid-cols-2">
                <SurfaceCard
                  description="Rolling-priority waivers are a classic exclusive-roster mechanic. Salary-cap leagues use contest-entry editing and lock-based rebuilds instead."
                  eyebrow="Salary-cap path"
                  title="Waivers are not the right move here"
                >
                  <div className="flex flex-wrap gap-3">
                    <Link className={getButtonClassName()} href={links.players}>
                      Browse player salaries
                    </Link>
                    <Link
                      className={getButtonClassName({
                        variant: "secondary",
                      })}
                      href={links.team}
                    >
                      Open contest hub
                    </Link>
                  </div>
                </SurfaceCard>
                <SurfaceCard
                  description="Salary-cap formats edit entries before lock instead of claiming exclusive players."
                  eyebrow="Mode split"
                  title="Classic-only transaction engine"
                  tone="accent"
                />
              </section>
            </MotionReveal>
          );
        }

        return (
          <section className="space-y-5">
            <MotionReveal>
              {error ? (
                <StatusBanner title="Transaction action" message={error} tone="warning" />
              ) : null}
            </MotionReveal>

            <MotionReveal delay={60}>
              <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <SurfaceCard
                  description="Every add routes through waivers so priority movement stays visible and easy to understand."
                  eyebrow="Waiver model"
                  title="Rolling priority"
                >
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricTile
                        detail="Lower is better."
                        label="Your priority"
                        value={hubState.waiver_priority ?? "TBD"}
                      />
                      <MetricTile
                        detail="Claims resolve against the overnight waiver run."
                        label="Run target"
                        tone="brand"
                        value="Tue 2:00 AM"
                      />
                      <MetricTile
                        detail="A full roster requires a paired drop."
                        label="Roster size"
                        tone="accent"
                        value={`${hubState.roster.length}/12`}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                          Target upside
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {selectedPlayer
                            ? `${selectedPlayer.display_name} • ${selectedPlayer.average_points.toFixed(1)} pts`
                            : "Choose a player to preview"}
                        </p>
                      </div>
                      <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                          Swap delta
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {selectedPlayer
                            ? `${selectedProjectionDelta > 0 ? "+" : ""}${selectedProjectionDelta.toFixed(1)} pts`
                            : "Waiting for target"}
                        </p>
                      </div>
                      <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                          Scoring fit
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {selectedPlayer ? getScoringFitLabel(selectedPlayer.position) : "No target selected"}
                        </p>
                      </div>
                    </div>

                    <StatusBanner
                      title={hubState.canCommissionerControl ? "Commissioner tools" : "Manager note"}
                      message={
                        hubState.canCommissionerControl
                          ? "Use process now to resolve the queue immediately."
                          : "Pending claims resolve in priority order. Winning a claim moves you to the back of the queue."
                      }
                      tone="info"
                    />

                    {hubState.canCommissionerControl ? (
                      <Button
                        disabled={busyAction === "process" || hubState.pending_claims.length === 0}
                        onClick={() => {
                          void handleProcessClaims();
                        }}
                        type="button"
                      >
                        {busyAction === "process" ? "Processing..." : "Process pending claims now"}
                      </Button>
                    ) : null}
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description="Choose the target, attach a drop only if your roster is full, then submit the claim into the priority queue."
                  eyebrow="Submit claim"
                  title="Claim a player"
                  tone="accent"
                >
                  <div className="space-y-4">
                    <input
                      className="field-control"
                      onChange={(event) => {
                        setSearch(event.target.value);
                      }}
                      placeholder="Search claimable player"
                      type="search"
                      value={search}
                    />
                    <select
                      className="field-control"
                      onChange={(event) => {
                        setSelectedPlayerId(event.target.value);
                      }}
                      value={selectedPlayerId}
                    >
                      <option value="">Choose a player</option>
                      {filteredPlayers.map((player) => (
                        <option key={player.id} value={player.id}>
                          #{player.rank} {player.display_name} • {player.club_name} • {player.position}
                        </option>
                      ))}
                    </select>
                    <select
                      className="field-control"
                      onChange={(event) => {
                        setSelectedDropRosterSlotId(event.target.value);
                      }}
                      value={selectedDropRosterSlotId}
                    >
                      <option value="">
                        {rosterIsFull ? "Choose a drop candidate" : "No drop needed"}
                      </option>
                      {hubState.roster.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.player_name} • {player.player_position} • {player.club_name}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={
                        busyAction === "submit" ||
                        !selectedPlayerId ||
                        (rosterIsFull && !selectedDropRosterSlotId)
                      }
                      onClick={() => {
                        void handleSubmitClaim();
                      }}
                      type="button"
                    >
                      {busyAction === "submit" ? "Submitting..." : "Submit waiver claim"}
                    </Button>

                    {selectedPlayer ? (
                      <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-7 text-foreground">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                          Claim impact preview
                        </p>
                        <p className="mt-3">
                          {selectedPlayer.display_name} projects for {selectedPlayer.average_points.toFixed(1)} fantasy points.{" "}
                          {selectedDropPlayer
                            ? `Compared with ${selectedDropPlayer.player_name} at ${selectedDropPlayer.player.average_points.toFixed(1)}, this move shifts your baseline by ${selectedProjectionDelta > 0 ? "+" : ""}${selectedProjectionDelta.toFixed(1)}.`
                            : "If your roster is not full, that full projection lands as upside."}
                        </p>
                        <p className="mt-2 text-white/74">
                          {getScoringFitDetail(selectedPlayer.position)} Core rules still anchor the read: assists {launchScoringRules.assist}, appearance {launchScoringRules.appearance}, and 60+ minutes {launchScoringRules.minutes60Plus}.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </SurfaceCard>
              </section>
            </MotionReveal>

            <MotionReveal delay={110}>
              <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
                <SurfaceCard
                  description="Pending claims stay at the top so the current waiver queue is easy to read."
                  eyebrow="Pending claims"
                  title={hubState.pending_claims.length > 0 ? "Live waiver queue" : "No pending claims"}
                >
                  <div className="space-y-3">
                    {hubState.pending_claims.length > 0 ? (
                      hubState.pending_claims.map((claim) => (
                        <div
                          key={claim.id}
                          className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {claim.requested_player_name}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                                Priority {claim.priority_at_submission} • {claim.requested_club_name} • {claim.requested_player_position}
                              </p>
                            </div>
                            <Button
                              disabled={busyAction === claim.id}
                              onClick={() => {
                                void handleCancelClaim(claim.id);
                              }}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {busyAction === claim.id ? "Canceling..." : "Cancel"}
                            </Button>
                          </div>
                          {claim.dropped_player_name ? (
                            <p className="mt-2 text-sm leading-6 text-muted">
                              Drop attached: {claim.dropped_player_name}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm leading-6 text-muted">
                            {buildClaimImpactNote(hubState, claim)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-muted">
                        No active claims are queued right now.
                      </p>
                    )}
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description="Recent adds and drops stay visible without pushing the live waiver queue out of sight."
                  eyebrow="Transaction history"
                  title="Recent adds and drops"
                  tone="accent"
                >
                  <div className="space-y-3">
                    {hubState.transaction_history.length > 0 ? (
                      hubState.transaction_history.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="rounded-[1.2rem] border border-line bg-night/35 px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {transaction.player_name}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                            {transaction.type.replaceAll("_", " ")} • {transaction.status} • {transaction.club_name}
                          </p>
                          {transaction.dropped_player_name ? (
                            <p className="mt-2 text-sm leading-6 text-muted">
                              Dropped: {transaction.dropped_player_name}
                            </p>
                          ) : null}
                          {transaction.note ? (
                            <p className="mt-2 text-sm leading-6 text-muted">{transaction.note}</p>
                          ) : (
                            <p className="mt-2 text-sm leading-6 text-muted">
                              {buildTransactionImpactNote(hubState, transaction)}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-muted">
                        No processed transactions yet.
                      </p>
                    )}
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

function getScoringFitDetail(position: "GK" | "DEF" | "MID" | "FWD") {
  if (position === "GK") {
    return `Goalkeepers win through save volume (${launchScoringRules.save} each) plus clean sheet leverage (${launchScoringRules.cleanSheet.GK}).`;
  }

  if (position === "DEF") {
    return `Defenders carry the best floor from clean sheets (${launchScoringRules.cleanSheet.DEF}) and rare high-value goals (${launchScoringRules.goal.DEF}).`;
  }

  if (position === "MID") {
    return `Midfielders layer steady minutes with assists (${launchScoringRules.assist}) and ${launchScoringRules.goal.MID}-point goal spikes.`;
  }

  return `Forwards create the fastest upside through ${launchScoringRules.goal.FWD}-point goals and assist bonuses.`;
}

function buildClaimImpactNote(
  hubState: FantasyTransactionHubState,
  claim: FantasyTransactionHubState["pending_claims"][number]
) {
  const requestedPlayer = hubState.claimable_players.find(
    (player) => player.id === claim.requested_player_id
  );
  const droppedPlayer = hubState.roster.find(
    (player) => player.id === claim.drop_roster_slot_id
  );

  if (!requestedPlayer) {
    return "Waiting on waiver priority resolution.";
  }

  const projectionDelta =
    requestedPlayer.average_points - (droppedPlayer?.player.average_points ?? 0);

  return `Projected swing ${projectionDelta > 0 ? "+" : ""}${projectionDelta.toFixed(1)} based on current averages. ${getScoringFitLabel(requestedPlayer.position)} profile.`;
}

function buildTransactionImpactNote(
  hubState: FantasyTransactionHubState,
  transaction: FantasyTransactionHubState["transaction_history"][number]
) {
  const addedPlayer = getFantasyPlayerById(transaction.player_id);
  const droppedPlayer = hubState.roster.find(
    (player) => player.player_id === transaction.dropped_player_id
  );

  if (!addedPlayer) {
    return "Processed move recorded for trust and audit history.";
  }

  const projectionDelta =
    addedPlayer.average_points - (droppedPlayer?.player.average_points ?? 0);

  return `Baseline impact ${projectionDelta > 0 ? "+" : ""}${projectionDelta.toFixed(1)} projected points. ${getScoringFitLabel(addedPlayer.position)} profile added to the roster.`;
}
