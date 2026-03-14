"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Sparkles,
  Target,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBanner } from "@/components/common/status-banner";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { lineupSlotLabels } from "@/lib/fantasy-draft";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import {
  formatFantasySlateRange,
  getFantasySlateStatus,
} from "@/lib/fantasy-slate-engine";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import { cn } from "@/lib/utils";
import {
  buildSalaryCapActionLabel,
  buildSalaryCapEntrySummary,
  getRecommendedSalaryCapSlot,
  isPlayerEligibleForSalaryCapSlot,
  salaryCapLineupSlots,
} from "@/lib/fantasy-salary-cap";
import type {
  FantasyLeagueDetails,
  FantasyPoolPlayer,
  FantasySalaryCapEntryState,
  FantasySalaryCapLineupSlot,
  PlayerPosition,
} from "@/types/fantasy";

const filters: Array<"ALL" | PlayerPosition> = ["ALL", "GK", "DEF", "MID", "FWD"];
const salaryCapFormationRows = [
  ["FWD_1", "FWD_2"],
  ["MID_1", "MID_2", "MID_3"],
  ["DEF_1", "FLEX", "DEF_2"],
  ["GK"],
] as const;

export interface SalaryCapEntryBuilderProps {
  leagueDetails: FantasyLeagueDetails;
  leagueId: string;
}

function findChangedSalaryCapSlot(
  previous: Record<FantasySalaryCapLineupSlot, string>,
  next: Record<FantasySalaryCapLineupSlot, string>
) {
  return salaryCapLineupSlots.find((slot) => previous[slot] !== next[slot]) ?? null;
}

function createEmptyAssignmentState() {
  return salaryCapLineupSlots.reduce<Record<FantasySalaryCapLineupSlot, string>>(
    (accumulator, slot) => {
      accumulator[slot] = "";
      return accumulator;
    },
    {} as Record<FantasySalaryCapLineupSlot, string>
  );
}

function createAssignmentState(entryState: FantasySalaryCapEntryState) {
  const nextState = createEmptyAssignmentState();

  entryState.slots.forEach((slot) => {
    nextState[slot.lineup_slot] = slot.player?.id ?? "";
  });

  return nextState;
}

function applyAssignment(
  current: Record<FantasySalaryCapLineupSlot, string>,
  targetSlot: FantasySalaryCapLineupSlot,
  playerId: string
) {
  const next = { ...current };

  if (!playerId) {
    next[targetSlot] = "";
    return next;
  }

  salaryCapLineupSlots.forEach((slot) => {
    if (next[slot] === playerId) {
      next[slot] = "";
    }
  });

  next[targetSlot] = playerId;
  return next;
}

function buildAssignmentSignature(
  assignments: Record<FantasySalaryCapLineupSlot, string>
) {
  return salaryCapLineupSlots.map((slot) => assignments[slot] || "-").join("|");
}

function formatPoints(points: number) {
  const hasDecimal = Math.abs(points % 1) > 0.001;
  return points.toFixed(hasDecimal ? 1 : 0);
}

export function SalaryCapEntryBuilder({
  leagueDetails,
  leagueId,
}: SalaryCapEntryBuilderProps) {
  const dataClient = useFantasyDataClient();
  const searchParams = useSearchParams();
  const links = buildLeagueLinks(leagueId);
  const modeConfig = getFantasyModeConfig(leagueDetails.league);
  const [entryState, setEntryState] = useState<FantasySalaryCapEntryState | null>(null);
  const [entryName, setEntryName] = useState("");
  const [assignments, setAssignments] = useState(createEmptyAssignmentState);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | PlayerPosition>("ALL");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [hasAppliedFocusedSearch, setHasAppliedFocusedSearch] = useState(false);
  const [highlightedSlot, setHighlightedSlot] = useState<FantasySalaryCapLineupSlot | null>(null);
  const [budgetPulse, setBudgetPulse] = useState(false);
  const [projectionPulse, setProjectionPulse] = useState(false);
  const [lastAssignmentNote, setLastAssignmentNote] = useState("");
  const deferredSearch = useDeferredValue(search);
  const focusedPlayerId = searchParams.get("playerId") ?? "";
  const previousAssignmentsRef = useRef<Record<FantasySalaryCapLineupSlot, string> | null>(null);
  const previousSalarySpentRef = useRef<number | null>(null);
  const previousProjectedPointsRef = useRef<number | null>(null);
  const slotPulseTimeoutRef = useRef<number | null>(null);
  const budgetPulseTimeoutRef = useRef<number | null>(null);
  const projectionPulseTimeoutRef = useRef<number | null>(null);

  const refreshEntry = useCallback(async (slateKey?: string) => {
    setIsLoading(true);
    setError("");

    try {
      const nextState = await dataClient.loadSalaryCapEntryState(leagueId, {
        slateKey,
      });
      setEntryState(nextState);
      setEntryName(nextState.entry.entry_name);
      setAssignments(createAssignmentState(nextState));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the salary-cap lineup."
      );
    } finally {
      setIsLoading(false);
    }
  }, [dataClient, leagueId]);

  useEffect(() => {
    void refreshEntry();
  }, [refreshEntry]);

  useEffect(() => {
    setHasAppliedFocusedSearch(false);
  }, [focusedPlayerId]);

  useEffect(() => {
    if (!entryState || !focusedPlayerId || hasAppliedFocusedSearch) {
      return;
    }

    const focusedPlayer = entryState.available_players.find(
      (player) => player.id === focusedPlayerId
    );

    if (focusedPlayer) {
      setSearch(focusedPlayer.display_name);
    }

    setHasAppliedFocusedSearch(true);
  }, [entryState, focusedPlayerId, hasAppliedFocusedSearch]);

  const playerLookup = useMemo(
    () => new Map((entryState?.available_players ?? []).map((player) => [player.id, player] as const)),
    [entryState]
  );
  const currentSelections = salaryCapLineupSlots.map((slot) => ({
    lineup_slot: slot,
    player: playerLookup.get(assignments[slot]) ?? null,
  }));
  const selectedPlayers = currentSelections
    .map((selection) => selection.player)
    .filter((player): player is FantasyPoolPlayer => player != null);
  const positionCounts = currentSelections.reduce<Record<PlayerPosition, number>>(
    (accumulator, selection) => {
      if (selection.player) {
        accumulator[selection.player.position] += 1;
      }

      return accumulator;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );
  const summary = buildSalaryCapEntrySummary(
    currentSelections,
    entryState?.league.salary_cap_amount ?? 0
  );
  const savedSignature = entryState
    ? buildAssignmentSignature(createAssignmentState(entryState))
    : "";
  const currentSignature = buildAssignmentSignature(assignments);
  const hasUnsavedChanges =
    !!entryState &&
    (savedSignature !== currentSignature ||
      entryName.trim() !== entryState.entry.entry_name);
  const selectedPlayerIds = new Set(
    currentSelections
      .map((selection) => selection.player?.id ?? null)
      .filter((playerId): playerId is string => playerId != null)
  );
  const focusedPlayer = playerLookup.get(focusedPlayerId) ?? null;
  const query = deferredSearch.trim().toLowerCase();
  const filteredPlayers = (entryState?.available_players ?? []).filter((player) => {
    if (positionFilter !== "ALL" && player.position !== positionFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      player.display_name.toLowerCase().includes(query) ||
      player.club_name.toLowerCase().includes(query)
    );
  });
  const visiblePlayers = filteredPlayers.slice(0, focusedPlayer ? 8 : 12);
  const readinessTone = summary.isOverCap
    ? "warning"
    : summary.isComplete
      ? "success"
      : "info";
  const readinessTitle = summary.isOverCap
    ? "Over the cap"
    : summary.isComplete
      ? "Entry ready"
      : "Build in progress";
  const readinessMessage = summary.isOverCap
    ? `Trim $${Math.abs(summary.remainingBudget)} before saving.`
    : summary.isComplete
      ? "All nine starter slots are filled within budget. Save to persist the latest entry."
      : `Fill ${salaryCapLineupSlots.length - summary.selectedCount} more slot${summary.selectedCount === salaryCapLineupSlots.length - 1 ? "" : "s"} to complete the entry.`;
  const lockState = entryState?.entry_window;
  const activeSlate = entryState?.slate;
  const availableSlates = entryState?.available_slates ?? [];
  const activeSlateKey = entryState?.slate.key ?? "";
  const slateIndex = availableSlates.findIndex(
    (slate) => slate.key === activeSlateKey
  );
  const visibleSlates = availableSlates.slice(
    Math.max(0, slateIndex - 2),
    Math.min(availableSlates.length, slateIndex + 3)
  );
  const slateStatus = activeSlate ? getFantasySlateStatus(activeSlate) : "upcoming";
  const isSubmitted = entryState?.entry.status === "submitted";
  const canEditEntry = !!lockState && !lockState.is_locked && !isSubmitted;
  const canAutofillEntry = canEditEntry;
  const canSaveEntry =
    canEditEntry && hasUnsavedChanges && !summary.isOverCap;
  const canClearEntry = canEditEntry && summary.selectedCount > 0;
  const canSubmitEntry =
    !!lockState && !lockState.is_locked && !isSubmitted && summary.isComplete && !summary.isOverCap;
  const canReopenEntry = !!lockState && !lockState.is_locked && !!isSubmitted;
  const nextOpenSlot = salaryCapLineupSlots.find((slot) => !assignments[slot]) ?? null;
  const topProjectedPlayer = [...selectedPlayers].sort(
    (left, right) => right.average_points - left.average_points
  )[0] ?? null;
  const averageProjectionPerSlot =
    summary.selectedCount > 0 ? summary.projectedPoints / summary.selectedCount : 0;

  useEffect(() => {
    if (!entryState) {
      return;
    }

    const previousAssignments = previousAssignmentsRef.current;

    if (previousAssignments) {
      const changedSlot = findChangedSalaryCapSlot(previousAssignments, assignments);

      if (changedSlot) {
        const selectedPlayer = playerLookup.get(assignments[changedSlot]) ?? null;
        setHighlightedSlot(changedSlot);
        setLastAssignmentNote(
          selectedPlayer
            ? `${lineupSlotLabels[changedSlot]} -> ${selectedPlayer.display_name}`
            : `${lineupSlotLabels[changedSlot]} cleared`
        );

        if (slotPulseTimeoutRef.current) {
          window.clearTimeout(slotPulseTimeoutRef.current);
        }

        slotPulseTimeoutRef.current = window.setTimeout(() => {
          setHighlightedSlot(null);
        }, 1400);
      }
    }

    previousAssignmentsRef.current = assignments;
  }, [assignments, entryState, playerLookup]);

  useEffect(() => {
    if (
      previousSalarySpentRef.current != null &&
      previousSalarySpentRef.current !== summary.salarySpent
    ) {
      setBudgetPulse(true);

      if (budgetPulseTimeoutRef.current) {
        window.clearTimeout(budgetPulseTimeoutRef.current);
      }

      budgetPulseTimeoutRef.current = window.setTimeout(() => {
        setBudgetPulse(false);
      }, 1200);
    }

    previousSalarySpentRef.current = summary.salarySpent;
  }, [summary.salarySpent]);

  useEffect(() => {
    if (
      previousProjectedPointsRef.current != null &&
      Math.abs(previousProjectedPointsRef.current - summary.projectedPoints) > 0.001
    ) {
      setProjectionPulse(true);

      if (projectionPulseTimeoutRef.current) {
        window.clearTimeout(projectionPulseTimeoutRef.current);
      }

      projectionPulseTimeoutRef.current = window.setTimeout(() => {
        setProjectionPulse(false);
      }, 1200);
    }

    previousProjectedPointsRef.current = summary.projectedPoints;
  }, [summary.projectedPoints]);

  useEffect(() => {
    return () => {
      if (slotPulseTimeoutRef.current) {
        window.clearTimeout(slotPulseTimeoutRef.current);
      }
      if (budgetPulseTimeoutRef.current) {
        window.clearTimeout(budgetPulseTimeoutRef.current);
      }
      if (projectionPulseTimeoutRef.current) {
        window.clearTimeout(projectionPulseTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading && !entryState) {
    return (
      <EmptyState
        title="Loading lineup"
        description="Reading the saved salary-cap entry and shared player pool from Supabase."
      />
    );
  }

  if (error && !entryState) {
    return <EmptyState title="Unable to load salary-cap lineup" description={error} />;
  }

  if (!entryState || !lockState || !activeSlate) {
    return (
      <EmptyState
        title="Lineup unavailable"
        description="This salary-cap entry could not be opened yet."
      />
    );
  }

  async function handleAutofill() {
    setBusyAction("autofill");
    setError("");

    try {
      const nextState = await dataClient.autofillSalaryCapEntry(leagueId, activeSlateKey);
      setEntryState(nextState);
      setEntryName(nextState.entry.entry_name);
      setAssignments(createAssignmentState(nextState));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to autofill the salary-cap entry."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleSave() {
    setBusyAction("save");
    setError("");

    try {
      const nextState = await dataClient.saveSalaryCapEntry(leagueId, {
        slateKey: activeSlateKey,
        entryName,
        assignments: salaryCapLineupSlots.map((slot) => ({
          lineupSlot: slot,
          playerId: assignments[slot] || null,
        })),
      });

      setEntryState(nextState);
      setEntryName(nextState.entry.entry_name);
      setAssignments(createAssignmentState(nextState));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to save the salary-cap entry."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleClear() {
    setBusyAction("clear");
    setError("");

    try {
      const nextState = await dataClient.clearSalaryCapEntry(leagueId, activeSlateKey);
      setEntryState(nextState);
      setEntryName(nextState.entry.entry_name);
      setAssignments(createAssignmentState(nextState));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to clear the salary-cap entry."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleSubmitEntry() {
    setBusyAction("submit");
    setError("");

    try {
      const nextState = await dataClient.submitSalaryCapEntry(leagueId, {
        slateKey: activeSlateKey,
        entryName,
        assignments: salaryCapLineupSlots.map((slot) => ({
          lineupSlot: slot,
          playerId: assignments[slot] || null,
        })),
      });

      setEntryState(nextState);
      setEntryName(nextState.entry.entry_name);
      setAssignments(createAssignmentState(nextState));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to submit the salary-cap entry."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleReopen() {
    setBusyAction("reopen");
    setError("");

    try {
      const nextState = await dataClient.reopenSalaryCapEntry(leagueId, activeSlateKey);
      setEntryState(nextState);
      setEntryName(nextState.entry.entry_name);
      setAssignments(createAssignmentState(nextState));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to reopen the submitted entry."
      );
    } finally {
      setBusyAction("");
    }
  }

  function handleAssignPlayer(targetSlot: FantasySalaryCapLineupSlot, playerId: string) {
    if (!canEditEntry) {
      return;
    }

    setAssignments((current) => applyAssignment(current, targetSlot, playerId));
  }

  function handleQuickAdd(player: FantasyPoolPlayer) {
    const recommendedSlot = getRecommendedSalaryCapSlot(player, currentSelections);

    if (!recommendedSlot) {
      setError("That player does not fit into any remaining salary-cap slot.");
      return;
    }

    handleAssignPlayer(recommendedSlot, player.id);
    setError("");
  }

  function handleSwitchSlate(direction: -1 | 1) {
    const target = availableSlates[slateIndex + direction];

    if (!target) {
      return;
    }

    void refreshEntry(target.key);
  }

  return (
    <section className="space-y-5">
      {error ? (
        <StatusBanner title="Lineup" message={error} tone="warning" />
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard
          eyebrow="Slate control"
          title={entryState.slate.label}
          description={`${modeConfig.label} follows the live NWSL contest calendar, so this view always opens the correct scoring window.`}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={slateIndex <= 0 || isLoading}
                onClick={() => {
                  handleSwitchSlate(-1);
                }}
                type="button"
              >
                <ChevronLeft className="size-4" />
                Previous
              </button>
              <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleSlates.map((slate) => (
                  <button
                    key={slate.key}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition",
                      slate.key === entryState.slate.key
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-white/6 text-muted hover:border-brand/30 hover:text-foreground"
                    )}
                    onClick={() => {
                      void refreshEntry(slate.key);
                    }}
                    type="button"
                  >
                    {slate.label}
                  </button>
                ))}
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  slateIndex === -1 ||
                  slateIndex >= availableSlates.length - 1 ||
                  isLoading
                }
                onClick={() => {
                  handleSwitchSlate(1);
                }}
                type="button"
              >
                Next
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Window
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatFantasySlateRange(entryState.slate)}
                </p>
              </div>
              <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Lock
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {new Date(lockState.lock_at).toLocaleString()}
                </p>
              </div>
              <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Status
                </p>
                <p className="mt-2 text-sm font-semibold capitalize text-foreground">
                  {slateStatus === "upcoming"
                    ? "Upcoming slate"
                    : slateStatus === "live"
                      ? "Live slate"
                      : "Completed slate"}
                </p>
              </div>
              <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Entry state
                </p>
                <p className="mt-2 text-sm font-semibold capitalize text-foreground">
                  {entryState.entry.status}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div
                className={cn(
                  "edge-field rounded-[1.25rem] border border-line bg-white/6 p-4",
                  budgetPulse ? "motion-safe:animate-pulse ring-1 ring-brand-strong/35" : ""
                )}
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Budget
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  ${summary.salarySpent}/{entryState.league.salary_cap_amount ?? 0}
                </p>
              </div>
              <div
                className={cn(
                  "edge-field rounded-[1.25rem] border border-line bg-white/6 p-4",
                  budgetPulse ? "motion-safe:animate-pulse ring-1 ring-brand-strong/35" : ""
                )}
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Remaining
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  ${summary.remainingBudget}
                </p>
              </div>
              <div
                className={cn(
                  "edge-field rounded-[1.25rem] border border-line bg-white/6 p-4",
                  projectionPulse ? "motion-safe:animate-pulse ring-1 ring-brand-strong/35" : ""
                )}
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Projected points
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatPoints(summary.projectedPoints)}
                </p>
              </div>
              <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Slots filled
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {summary.selectedCount}/{salaryCapLineupSlots.length}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <StatusBanner
                title={readinessTitle}
                message={readinessMessage}
                tone={readinessTone}
              />
              <StatusBanner
                title={lockState.title}
                message={lockState.message}
                tone={lockState.tone}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Projection model
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Current lineup projection is the sum of each selected player&apos;s average fantasy points. That average is now built from real soccer events: finishing, chance creation, passing volume, ball-winning, clean-sheet equity, and goalkeeper work.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Scoring anchors
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Goals: {launchScoringRules.goal.FWD}-{launchScoringRules.goal.DEF} by role, assists: {launchScoringRules.assist}, shots on target: {launchScoringRules.shotOnTarget}, chances created: {launchScoringRules.chanceCreated}, successful passes: {launchScoringRules.successfulPass}, tackles won: {launchScoringRules.tackleWon}.
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-foreground md:grid-cols-2">
              <p>Cadence: {modeConfig.cadenceLabel}</p>
              <p>Ownership: Shared player pool</p>
              <p>Selected slate key: {entryState.entry.slate_key}</p>
              <p>{modeConfig.scheduleLabel}: {new Date(lockState.lock_at).toLocaleString()}</p>
              {entryState.entry.submitted_at ? (
                <p>Submitted: {new Date(entryState.entry.submitted_at).toLocaleString()}</p>
              ) : null}
            </div>

            {lastAssignmentNote ? (
              <div aria-live="polite" className="sr-only">
                {lastAssignmentNote}
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Quick actions"
          title={entryName || modeConfig.teamHubTitle}
          description="Build, save, and submit before lock. You can edit until the window closes."
          tone="accent"
        >
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Entry name</span>
              <input
                className="w-full rounded-[1rem] border border-line bg-white/10 px-4 py-3 text-sm"
                disabled={!canEditEntry}
                onChange={(event) => {
                  setEntryName(event.target.value);
                }}
                placeholder="Primary entry"
                type="text"
                value={entryName}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/10 px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                disabled={busyAction !== "" || !canAutofillEntry}
                onClick={() => {
                  void handleAutofill();
                }}
                type="button"
              >
                <Sparkles className="size-4" />
                {busyAction === "autofill" ? "Autofilling..." : "Autofill lineup"}
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={busyAction !== "" || !canSaveEntry}
                onClick={() => {
                  void handleSave();
                }}
                type="button"
              >
                <Target className="size-4" />
                {busyAction === "save" ? "Saving..." : "Save changes"}
              </button>
              {canReopenEntry ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-white/10 px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                  disabled={busyAction !== ""}
                  onClick={() => {
                    void handleReopen();
                  }}
                  type="button"
                >
                  <Clock3 className="size-4" />
                  {busyAction === "reopen" ? "Reopening..." : "Reopen entry"}
                </button>
              ) : (
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={busyAction !== "" || !canSubmitEntry}
                  onClick={() => {
                    void handleSubmitEntry();
                  }}
                  type="button"
                >
                  <ArrowRight className="size-4" />
                  {busyAction === "submit" ? "Submitting..." : "Submit entry"}
                </button>
              )}
              <button
                className="rounded-full border border-line bg-white/10 px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                disabled={busyAction !== "" || !canClearEntry}
                onClick={() => {
                  void handleClear();
                }}
                type="button"
              >
                {busyAction === "clear" ? "Clearing..." : "Clear entry"}
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={links.players}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-foreground"
              >
                Open full player board
              </Link>
              <Link
                href={links.settings}
                className="rounded-full border border-line bg-white/10 px-4 py-2 text-sm font-semibold text-foreground"
              >
                Review league rules
              </Link>
            </div>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <SurfaceCard
          eyebrow="Lineup slots"
          title={modeConfig.teamHubTitle}
          description="Fill each slot within budget before the window locks."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Tactical shape
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none text-white">
                  {positionCounts.DEF}-{positionCounts.MID}-{positionCounts.FWD}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Budget left
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none text-white">
                  ${summary.remainingBudget}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Next need
                </p>
                <p className="mt-2 text-lg font-semibold leading-tight text-white">
                  {nextOpenSlot ? lineupSlotLabels[nextOpenSlot] : "All slots filled"}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-black/18 p-4">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Projection driver
                </p>
                <p className="mt-2 text-lg font-semibold leading-tight text-white">
                  {topProjectedPlayer ? topProjectedPlayer.display_name : "Awaiting first pick"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/75">
                  {topProjectedPlayer
                    ? `${formatPoints(topProjectedPlayer.average_points)} pts baseline`
                    : `${formatPoints(averageProjectionPerSlot)} avg per filled slot`}
                </p>
              </div>
            </div>

            {lastAssignmentNote ? (
              <div className="rounded-[1.2rem] border border-brand-strong/20 bg-brand/10 px-4 py-3 text-sm text-foreground">
                <span className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Last change
                </span>
                <p className="mt-2 font-medium">{lastAssignmentNote}</p>
              </div>
            ) : null}

            <div
              className="rounded-[1.75rem] border border-line bg-[linear-gradient(180deg,rgba(5,14,34,0.98)_0%,rgba(6,20,43,0.96)_100%)] p-4 sm:p-5"
              style={{
                backgroundImage:
                  "radial-gradient(circle at center, rgba(255,255,255,0.05) 0 18%, transparent 18.5%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(180deg, rgba(5,14,34,0.98) 0%, rgba(6,20,43,0.96) 100%)",
                backgroundSize: "100% 100%, 100% 25%, 25% 100%, 100% 100%",
              }}
            >
              <div className="space-y-4">
                {salaryCapFormationRows.map((row) => (
                  <div
                    key={row.join("-")}
                    className={`grid gap-3 ${row.length === 1 ? "mx-auto max-w-[12rem]" : row.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                  >
                    {row.map((slot) => {
                      const selectedPlayer = playerLookup.get(assignments[slot]) ?? null;
                      const eligiblePlayers = entryState.available_players.filter((player) => {
                        if (!isPlayerEligibleForSalaryCapSlot(player, slot)) {
                          return false;
                        }

                        return !selectedPlayerIds.has(player.id) || player.id === selectedPlayer?.id;
                      });

                      return (
                        <div
                          key={slot}
                          className={cn(
                            "rounded-[1.2rem] border px-4 py-4",
                            selectedPlayer
                              ? "border-brand-strong/22 bg-white/8 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
                              : "border-dashed border-white/12 bg-white/4",
                            highlightedSlot === slot
                              ? "motion-safe:animate-pulse ring-1 ring-brand-strong/40 shadow-[0_0_0_1px_rgba(0,225,255,0.12),0_24px_64px_rgba(0,225,255,0.14)]"
                              : ""
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-brand-strong">
                                {lineupSlotLabels[slot]}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-white">
                                {selectedPlayer?.display_name ?? "Open slot"}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/75">
                                {selectedPlayer
                                  ? `${selectedPlayer.position} • ${selectedPlayer.club_name}`
                                  : `${eligiblePlayers.length} eligible players`}
                              </p>
                            </div>
                            {selectedPlayer ? (
                              <div className="text-right text-sm text-white/75">
                                <p>${selectedPlayer.salary_cost}</p>
                                <p>{formatPoints(selectedPlayer.average_points)} pts</p>
                              </div>
                            ) : null}
                          </div>

                          <select
                            className="field-control mt-4"
                            disabled={!canEditEntry}
                            onChange={(event) => {
                              handleAssignPlayer(slot, event.target.value);
                            }}
                            value={assignments[slot]}
                          >
                            <option value="">Open slot</option>
                            {eligiblePlayers.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.display_name} • {player.club_name} • ${player.salary_cost} •{" "}
                                {formatPoints(player.average_points)} pts
                              </option>
                            ))}
                          </select>

                          {selectedPlayer ? (
                            <button
                              className="mt-3 rounded-full border border-white/12 bg-white/6 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/78"
                              disabled={!canEditEntry}
                              onClick={() => {
                                handleAssignPlayer(slot, "");
                              }}
                              type="button"
                            >
                              Remove player
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow={focusedPlayer ? "Builder spotlight" : "Quick add"}
          title={
            focusedPlayer ? focusedPlayer.display_name : "Search the shared player pool"
          }
          description={
            focusedPlayer
              ? `${focusedPlayer.club_name} • ${focusedPlayer.position} • $${focusedPlayer.salary_cost}. Add this player directly into the active lineup from here.`
              : "Search by player or club, filter by position, then add players straight into the next recommended slot."
          }
          tone="accent"
        >
          <div className="space-y-4">
            <input
              className="w-full rounded-[1rem] border border-line bg-white px-4 py-3 text-sm"
              disabled={!canEditEntry}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search player or club"
              type="search"
              value={search}
            />

            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    positionFilter === filter
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white/10 text-muted",
                  ].join(" ")}
                  disabled={!canEditEntry}
                  onClick={() => {
                    setPositionFilter(filter);
                  }}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>

            {focusedPlayer ? (
              <div className="edge-field rounded-[1.2rem] border border-brand/20 bg-panel px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">
                      Focus player
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {focusedPlayer.display_name}
                    </p>
                    <p className="text-sm text-muted">
                      {focusedPlayer.position} • {focusedPlayer.club_name}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p>${focusedPlayer.salary_cost}</p>
                    <p>{formatPoints(focusedPlayer.average_points)} pts</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {salaryCapLineupSlots
                    .filter((slot) => isPlayerEligibleForSalaryCapSlot(focusedPlayer, slot))
                    .map((slot) => (
                      <button
                        key={slot}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
                        disabled={!canEditEntry}
                        onClick={() => {
                          handleAssignPlayer(slot, focusedPlayer.id);
                        }}
                        type="button"
                      >
                        Use at {lineupSlotLabels[slot]}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {visiblePlayers.map((player) => {
                const selectedSlot = salaryCapLineupSlots.find(
                  (slot) => assignments[slot] === player.id
                );
                const recommendedSlot = getRecommendedSalaryCapSlot(player, currentSelections);

                return (
                  <div
                    key={player.id}
                    className="edge-field rounded-[1.15rem] border border-line bg-panel px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {player.display_name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                          {player.position} • {player.club_name}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted">
                        <p>${player.salary_cost}</p>
                        <p>{formatPoints(player.average_points)} pts</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedSlot ? (
                        <span className="rounded-full border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                          In {lineupSlotLabels[selectedSlot]}
                        </span>
                      ) : recommendedSlot ? (
                        <span className="rounded-full border border-brand-strong/25 bg-brand/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">
                          Best at {lineupSlotLabels[recommendedSlot]}
                        </span>
                      ) : null}
                      <button
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
                        disabled={!canEditEntry}
                        onClick={() => {
                          handleQuickAdd(player);
                        }}
                        type="button"
                      >
                        {buildSalaryCapActionLabel(player, currentSelections)}
                      </button>
                      <Link
                        href={`/players/${player.id}`}
                        className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground"
                      >
                        View details
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SurfaceCard>
      </section>
    </section>
  );
}
