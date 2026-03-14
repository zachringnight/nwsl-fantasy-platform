"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import { Activity, AlarmClockCheck, PlayCircle, ShieldAlert, Sparkles } from "lucide-react";
import { DraftBoard } from "@/components/draft/draft-board";
import { DraftQueuePanel } from "@/components/draft/draft-queue-panel";
import { EmptyState } from "@/components/common/empty-state";
import { GuidedLeagueState } from "@/components/league/guided-setup-state";
import { StatusBanner } from "@/components/common/status-banner";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import { LiveRegion } from "@/components/ui/live-region";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import type { FantasyDraftState, PlayerPosition } from "@/types/fantasy";
import { cn } from "@/lib/utils";

const timerThresholdRound = 9;

export interface DraftRoomClientProps {
  leagueId: string;
}

export function DraftRoomClient({ leagueId }: DraftRoomClientProps) {
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, session, supabaseReady } = useFantasyAuth();
  const [draftState, setDraftState] = useState<FantasyDraftState | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | PlayerPosition>("ALL");
  const [now, setNow] = useState(() => Date.now());
  const [turnPulseActive, setTurnPulseActive] = useState(false);
  const [recentPickPulseId, setRecentPickPulseId] = useState<string | null>(null);
  const [queuePulsePlayerId, setQueuePulsePlayerId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");
  const deferredSearch = useDeferredValue(search);
  const links = buildLeagueLinks(leagueId);
  const draftStatus = draftState?.draft.status;
  const previousTurnRef = useRef<number | null>(null);
  const previousPickCountRef = useRef<number | null>(null);
  const previousQueueIdsRef = useRef<string[] | null>(null);
  const turnPulseTimeoutRef = useRef<number | null>(null);
  const pickPulseTimeoutRef = useRef<number | null>(null);
  const queuePulseTimeoutRef = useRef<number | null>(null);

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
          : "Unable to load the draft room."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshDraftState();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    if (!session || !profile?.onboarding_complete || !draftStatus || draftStatus === "complete") {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshDraftState();
      }
    };

    const pollId = window.setInterval(
      refreshIfVisible,
      draftStatus === "live" || draftStatus === "paused" ? 4000 : 3000
    );

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [draftStatus, profile?.onboarding_complete, session]);

  useEffect(() => {
    if (!draftState) {
      return;
    }

    const currentTurn = draftState.currentTurn?.overallPick ?? null;

    if (previousTurnRef.current != null && currentTurn != null && previousTurnRef.current !== currentTurn) {
      setTurnPulseActive(true);

      if (turnPulseTimeoutRef.current) {
        window.clearTimeout(turnPulseTimeoutRef.current);
      }

      turnPulseTimeoutRef.current = window.setTimeout(() => {
        setTurnPulseActive(false);
      }, 1200);
    }

    previousTurnRef.current = currentTurn;

    const currentPickCount = draftState.picks.length;

    if (
      previousPickCountRef.current != null &&
      currentPickCount > previousPickCountRef.current
    ) {
      const latestPick = draftState.picks.at(-1);
      setRecentPickPulseId(latestPick?.id ?? null);

      if (pickPulseTimeoutRef.current) {
        window.clearTimeout(pickPulseTimeoutRef.current);
      }

      pickPulseTimeoutRef.current = window.setTimeout(() => {
        setRecentPickPulseId(null);
      }, 1600);
    }

    previousPickCountRef.current = currentPickCount;

    const queueIds = draftState.queue.map((player) => player.player_id);

    if (previousQueueIdsRef.current) {
      const changedQueuePlayerId =
        queueIds.find((playerId, index) => previousQueueIdsRef.current?.[index] !== playerId) ??
        queueIds.find((playerId) => !previousQueueIdsRef.current?.includes(playerId)) ??
        null;

      if (changedQueuePlayerId) {
        setQueuePulsePlayerId(changedQueuePlayerId);

        if (queuePulseTimeoutRef.current) {
          window.clearTimeout(queuePulseTimeoutRef.current);
        }

        queuePulseTimeoutRef.current = window.setTimeout(() => {
          setQueuePulsePlayerId(null);
        }, 1400);
      }
    }

    previousQueueIdsRef.current = queueIds;
  }, [draftState]);

  useEffect(() => {
    return () => {
      if (turnPulseTimeoutRef.current) {
        window.clearTimeout(turnPulseTimeoutRef.current);
      }
      if (pickPulseTimeoutRef.current) {
        window.clearTimeout(pickPulseTimeoutRef.current);
      }
      if (queuePulseTimeoutRef.current) {
        window.clearTimeout(queuePulseTimeoutRef.current);
      }
    };
  }, []);

  async function withDraftAction(
    action: string,
    run: () => Promise<FantasyDraftState>
  ) {
    setBusyAction(action);
    setError("");

    try {
      setDraftState(await run());
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update the draft room."
      );
    } finally {
      setBusyAction("");
      setBusyPlayerId(null);
    }
  }

  async function handleQueuePlayer(playerId: string) {
    setBusyPlayerId(playerId);
    setError("");

    try {
      const queue = await dataClient.addPlayerToDraftQueue(leagueId, playerId);
      setDraftState((current) => (current ? { ...current, queue } : current));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to queue that player."
      );
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function handleMoveQueue(playerId: string, direction: "up" | "down") {
    setBusyPlayerId(playerId);
    setError("");

    try {
      const queue = await dataClient.moveDraftQueueItem(leagueId, playerId, direction);
      setDraftState((current) => (current ? { ...current, queue } : current));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to reorder that queue player."
      );
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function handleRemoveQueue(playerId: string) {
    setBusyPlayerId(playerId);
    setError("");

    try {
      const queue = await dataClient.removePlayerFromDraftQueue(leagueId, playerId);
      setDraftState((current) => (current ? { ...current, queue } : current));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to remove that queue player."
      );
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function handleDraftPlayer(playerId: string) {
    setBusyPlayerId(playerId);
    const prevPickCount = draftState?.picks.length ?? 0;
    await withDraftAction("pick", () => dataClient.makeDraftPick(leagueId, playerId));
    // If we got a new pick, celebrate
    const player = draftState?.availablePlayers.find((p) => p.id === playerId);
    const playerName = player?.display_name ?? "Player";
    setScreenReaderAnnouncement(`${playerName} drafted successfully.`);
    if ((draftState?.picks.length ?? 0) >= prevPickCount) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 100);
    }
  }

  async function handleAutopick() {
    await withDraftAction("autopick", () => dataClient.autopickCurrentDraftTurn(leagueId));
  }

  async function handleStatusChange(nextStatus: "live" | "paused") {
    await withDraftAction(nextStatus, () => dataClient.updateDraftStatus(leagueId, nextStatus));
  }

  if (!supabaseReady) {
    return (
      <EmptyState
        title="Draft room unavailable"
        description="Something went wrong. Please try again in a moment."
      />
    );
  }

  if (!hasHydrated) {
    return (
      <EmptyState
        title="Checking your account"
        description="Looking for your account before opening the draft room."
      />
    );
  }

  if (!session || !profile) {
    return (
      <EmptyState
        title="Sign in to continue"
        description="The draft room is available once you are signed in."
      />
    );
  }

  if (!profile.onboarding_complete) {
    return (
      <EmptyState
        title="Finish onboarding first"
        description="Complete your profile to continue."
      />
    );
  }

  if (isLoading && !draftState) {
    return (
      <EmptyState
        title="Loading draft room"
        description="Setting up your draft board."
      />
    );
  }

  if (error && !draftState) {
    return <EmptyState title="Unable to load draft room" description={error} />;
  }

  if (!draftState) {
    return (
      <EmptyState
        title="Draft room unavailable"
        description="This league's draft hasn't been set up yet."
      />
    );
  }

  const modeConfig = getFantasyModeConfig(draftState.league);

  if (!modeConfig.usesLiveDraftRoom) {
    return (
      <GuidedLeagueState
        actions={
          <Link
            href={links.team}
            className={getButtonClassName()}
          >
            Open team hub
          </Link>
        }
        badge="No live room"
        description="This league format uses the roster builder instead of a live snake-draft board."
        eyebrow="Draft format"
        highlights={["Contest entry flow", "No live clock", "Team hub first"]}
        icon={Sparkles}
        steps={[
          {
            detail: "Build entries from the team hub instead of waiting on a live turn.",
            label: "Open the builder",
          },
          {
            detail: "Use the player board to scan salaries, value, and availability.",
            label: "Scout the pool",
          },
          {
            detail: "Return here only for classic live-draft leagues.",
            label: "Stay in the hub",
          },
        ]}
        title={`${modeConfig.label} does not use a draft room`}
        tone="default"
      />
    );
  }

  if (!draftState.memberships.every((membership) => membership.draft_slot != null)) {
    return (
      <GuidedLeagueState
        actions={
          <>
            <Link
              href={links.draft}
              className={getButtonClassName()}
            >
              Return to lobby
            </Link>
            <Link
              href={links.players}
              className={getButtonClassName({
                variant: "secondary",
              })}
            >
              Build your queue
            </Link>
          </>
        }
        badge="Order reveal"
        description="The room opens after the commissioner reveals the draft order. Until then, use this moment to line up favorites."
        eyebrow="Draft setup"
        highlights={["Reveal the order", "Queue your targets", "Room opens next"]}
        icon={PlayCircle}
        steps={[
          {
            detail: "Head back to the lobby and reveal every manager's slot.",
            label: "Publish the order",
          },
          {
            detail: "Use the player board to build a quick shortlist before the clock starts.",
            label: "Queue your names",
          },
          {
            detail: "Return here once the room is ready to go live.",
            label: "Enter the room",
          },
        ]}
        title="Reveal the draft order first"
        tone="brand"
      />
    );
  }

  if (draftState.draft.status === "complete") {
    return (
      <GuidedLeagueState
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              href={links.draftRecap}
              className={getButtonClassName()}
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
        }
        badge="Room closed"
        description="Every pick is in. The live board is finished, so the next scenes are recap, lineup polish, and week-one prep."
        eyebrow="Draft complete"
        highlights={["Recap time", "Lineup next", "Board closed"]}
        icon={Sparkles}
        steps={[
          {
            detail: "Review how the board fell and where your best value landed.",
            label: "Read the recap",
          },
          {
            detail: "Move into the team editor and shape your opening starters.",
            label: "Set week one",
          },
          {
            detail: "Use players and transactions to plan the next edge.",
            label: "Scout next moves",
          },
        ]}
        title="Draft complete"
        tone="accent"
      />
    );
  }

  const timerLimitSeconds =
    (draftState.currentTurn?.roundNumber ?? 1) >= timerThresholdRound ? 60 : 75;
  const elapsedSeconds = draftState.draft.current_pick_started_at
    ? Math.floor((now - new Date(draftState.draft.current_pick_started_at).getTime()) / 1000)
    : 0;
  const remainingSeconds =
    draftState.draft.status === "live"
      ? Math.max(timerLimitSeconds - elapsedSeconds, 0)
      : timerLimitSeconds;
  const timerProgressPercent = Math.max(
    Math.min((remainingSeconds / timerLimitSeconds) * 100, 100),
    0
  );
  const draftCompletionPercent = Math.round(
    (draftState.picks.length / Math.max(draftState.currentTurn?.totalPicks ?? 1, 1)) * 100
  );
  const filteredPlayers = draftState.availablePlayers
    .filter((player) => {
      if (positionFilter !== "ALL" && player.position !== positionFilter) {
        return false;
      }

      if (!deferredSearch.trim()) {
        return true;
      }

      const query = deferredSearch.trim().toLowerCase();
      return (
        player.display_name.toLowerCase().includes(query) ||
        player.club_name.toLowerCase().includes(query)
      );
    })
    .slice(0, 24);
  const recentPicks = [...draftState.picks].slice(-8).reverse();

  return (
    <section className="space-y-5">
      <ConfettiBurst active={showConfetti} />
      <LiveRegion message={screenReaderAnnouncement} politeness="assertive" />
      {error ? (
        <StatusBanner title="Draft action" message={error} tone="warning" />
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.78fr_1.2fr_0.82fr]">
        <div className="space-y-5">
          <SurfaceCard
            className={
              turnPulseActive
                ? "ring-1 ring-brand-strong/40 shadow-[0_0_0_1px_rgba(0,225,255,0.14),0_24px_64px_rgba(0,225,255,0.16)]"
                : ""
            }
            eyebrow="On the clock"
            title={
              draftState.currentTurn?.membership
                ? draftState.currentTurn.membership.display_name
                : "Waiting on room"
            }
            description={`Round ${draftState.currentTurn?.roundNumber ?? 1} • Pick ${draftState.currentTurn?.overallPick ?? 1} • ${String(
              Math.floor(remainingSeconds / 60)
            ).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")} remaining`}
            tone="brand"
          >
            <div aria-live="polite" className="space-y-5 text-sm text-white/84">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/78">
                  <AlarmClockCheck className="size-3.5" />
                  {draftState.draft.status}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/78">
                  <Activity className="size-3.5" />
                  {draftState.isMyTurn ? "Your pick" : "Room active"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/78">
                  <Sparkles className="size-3.5" />
                  {draftCompletionPercent}% complete
                </span>
              </div>

              <div className="rounded-[1.6rem] border border-white/12 bg-black/20 p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/70">
                      Draft clock
                    </p>
                    <p
                      className={cn(
                        "mt-3 font-display text-6xl uppercase leading-none tracking-[0.03em] text-white sm:text-7xl",
                        turnPulseActive ? "motion-safe:animate-pulse text-brand-lime" : ""
                      )}
                    >
                      {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:
                      {String(remainingSeconds % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/70">
                      Turn
                    </p>
                    <p className="mt-3 text-2xl font-semibold leading-none text-white">
                      {draftState.currentTurn?.overallPick ?? 1}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#00E1FF_0%,#0522FF_55%,#C5FF5F_100%)] transition-[width] duration-700 ease-out"
                    style={{ width: `${timerProgressPercent}%` }}
                  />
                </div>
              </div>

              <p>
                {draftState.isMyTurn
                  ? "It is your turn. Draft directly from the board or let autopick resolve the slot."
                  : draftState.draft.status === "paused"
                    ? "The commissioner has paused the room. Queue work is still available while the clock is stopped."
                    : `The active manager is ${draftState.currentTurn?.membership?.display_name ?? "not set"}.`}
              </p>
              <p>
                Mode: {modeConfig.label} • Ownership: {draftState.league.player_ownership_mode}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {draftState.canCommissionerControl ? (
                draftState.draft.status === "live" ? (
                  <Button
                    className="border-white/20 bg-white/12 text-white hover:bg-white hover:text-night"
                    disabled={busyAction !== ""}
                    onClick={() => {
                      void handleStatusChange("paused");
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <ShieldAlert className="size-4" />
                    {busyAction === "paused" ? "Pausing..." : "Pause"}
                  </Button>
                ) : (
                  <Button
                    className="border-white/20 bg-white/12 text-white hover:bg-white hover:text-night"
                    disabled={busyAction !== ""}
                    onClick={() => {
                      void handleStatusChange("live");
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <PlayCircle className="size-4" />
                    {busyAction === "live" ? "Starting..." : draftState.draft.status === "paused" ? "Resume" : "Start"}
                  </Button>
                )
              ) : null}

              <Button
                className="bg-white text-night hover:bg-brand-lime hover:text-night"
                disabled={
                  busyAction !== "" ||
                  draftState.draft.status !== "live" ||
                  (!draftState.isMyTurn && !draftState.canCommissionerControl)
                }
                onClick={() => {
                  void handleAutopick();
                }}
                type="button"
              >
                {busyAction === "autopick" ? "Resolving..." : "Autopick current turn"}
              </Button>
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Recent picks"
            title="Room activity"
            description="See who was just picked and which teams are building."
          >
            <div className="space-y-3">
              {recentPicks.length === 0 ? (
                <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
                  No picks yet. Reveal the order and start the room from the lobby.
                </p>
              ) : (
                <div aria-live="polite" className="space-y-3">
                  {recentPicks.map((pick) => (
                    <div
                      key={pick.id}
                      className={cn(
                        "rounded-[1.25rem] border border-line bg-white/6 px-4 py-4",
                        recentPickPulseId === pick.id
                          ? "motion-safe:animate-pulse ring-1 ring-brand-strong/35 shadow-[0_0_0_1px_rgba(0,225,255,0.12),0_22px_58px_rgba(0,225,255,0.14)]"
                          : ""
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-brand-strong/25 bg-brand/15 text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">
                          {pick.overall_pick}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{pick.player_name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                            {pick.club_name} • {pick.player_position} • {pick.source}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SurfaceCard>
        </div>

        <div className="space-y-5">
          <SurfaceCard
            eyebrow="Filters"
            title="Search and position focus"
            description="Draft-first browsing stays light so the board remains fast on a phone."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-3">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Board view
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
                  {filteredPlayers.length}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-3">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Queue depth
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
                  {draftState.queue.length}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-3">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Current filter
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
                  {positionFilter}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                className="field-control w-full"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search players or clubs"
                type="text"
                value={search}
              />
              <select
                className="field-control"
                onChange={(event) => {
                  setPositionFilter(event.target.value as "ALL" | PlayerPosition);
                }}
                value={positionFilter}
              >
                <option value="ALL">All positions</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
            </div>
          </SurfaceCard>

          <DraftBoard
            busyPlayerId={busyPlayerId}
            canDraft={draftState.isMyTurn}
            highlightedPlayerId={queuePulsePlayerId}
            onDraft={(playerId) => {
              void handleDraftPlayer(playerId);
            }}
            onQueue={(playerId) => {
              void handleQueuePlayer(playerId);
            }}
            players={filteredPlayers}
            queuedPlayerIds={draftState.queue.map((item) => item.player_id)}
          />
        </div>

        <DraftQueuePanel
          busyPlayerId={busyPlayerId}
          highlightedPlayerId={queuePulsePlayerId}
          onMoveDown={(playerId) => {
            void handleMoveQueue(playerId, "down");
          }}
          onMoveUp={(playerId) => {
            void handleMoveQueue(playerId, "up");
          }}
          onRemove={(playerId) => {
            void handleRemoveQueue(playerId);
          }}
          queue={draftState.queue}
          roster={draftState.myRoster}
        />
      </section>
    </section>
  );
}
