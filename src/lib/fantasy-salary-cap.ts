import {
  getEligibleLineupSlots,
  lineupSlotLabels,
  starterLineupSlots,
} from "@/lib/fantasy-draft";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import type {
  FantasyLeagueRecord,
  FantasyPoolPlayer,
  FantasySalaryCapEntryRecord,
  FantasySalaryCapEntryWindowState,
  FantasySalaryCapLineupSlot,
  FantasySlateWindow,
} from "@/types/fantasy";

export interface FantasySalaryCapSelection {
  lineup_slot: FantasySalaryCapLineupSlot;
  player: FantasyPoolPlayer | null;
}

export interface FantasySalaryCapEntrySummary {
  salarySpent: number;
  remainingBudget: number;
  projectedPoints: number;
  selectedCount: number;
  isComplete: boolean;
  isOverCap: boolean;
}

export const salaryCapLineupSlots =
  starterLineupSlots as FantasySalaryCapLineupSlot[];

function dedupePlayers(players: FantasyPoolPlayer[]) {
  const seen = new Set<string>();

  return players.filter((player) => {
    if (seen.has(player.id)) {
      return false;
    }

    seen.add(player.id);
    return true;
  });
}

function buildCombinations<T>(values: T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }

  if (values.length < size) {
    return [];
  }

  const combinations: T[][] = [];

  for (let index = 0; index <= values.length - size; index += 1) {
    const head = values[index];
    const tails = buildCombinations(values.slice(index + 1), size - 1);

    tails.forEach((tail) => {
      combinations.push([head, ...tail]);
    });
  }

  return combinations;
}

function buildCandidatePool(
  playerPool: FantasyPoolPlayer[],
  position: FantasyPoolPlayer["position"]
) {
  const eligible = playerPool.filter((player) => player.position === position);
  const byProjection = [...eligible]
    .sort((left, right) => right.average_points - left.average_points)
    .slice(0, 8);
  const byValue = [...eligible]
    .sort(
      (left, right) =>
        right.average_points / right.salary_cost - left.average_points / left.salary_cost
    )
    .slice(0, 6);

  return dedupePlayers([...byProjection, ...byValue]).slice(0, 10);
}

function compareEntryCandidates(
  left: { projectedPoints: number; salarySpent: number },
  right: { projectedPoints: number; salarySpent: number } | null
) {
  if (!right) {
    return true;
  }

  if (left.projectedPoints !== right.projectedPoints) {
    return left.projectedPoints > right.projectedPoints;
  }

  return left.salarySpent < right.salarySpent;
}

export function isPlayerEligibleForSalaryCapSlot(
  player: FantasyPoolPlayer,
  lineupSlot: FantasySalaryCapLineupSlot
) {
  return getEligibleLineupSlots(player.position).includes(lineupSlot);
}

export function buildSalaryCapEntrySummary(
  selections: FantasySalaryCapSelection[],
  salaryCapAmount: number
) {
  const selectedPlayers = selections
    .map((selection) => selection.player)
    .filter((player): player is FantasyPoolPlayer => player != null);
  const salarySpent = selectedPlayers.reduce((sum, player) => sum + player.salary_cost, 0);
  const projectedPoints = Number(
    selectedPlayers.reduce((sum, player) => sum + player.average_points, 0).toFixed(1)
  );
  const selectedCount = selectedPlayers.length;
  const remainingBudget = salaryCapAmount - salarySpent;

  return {
    salarySpent,
    remainingBudget,
    projectedPoints,
    selectedCount,
    isComplete: selectedCount === salaryCapLineupSlots.length,
    isOverCap: remainingBudget < 0,
  } satisfies FantasySalaryCapEntrySummary;
}

function formatSalaryCapLock(lockAt: string) {
  return new Date(lockAt).toLocaleString();
}

export function isSalaryCapEntryLocked(slate: FantasySlateWindow) {
  return Date.now() >= new Date(slate.lock_at).getTime();
}

export function buildSalaryCapEntryWindowState(
  league: FantasyLeagueRecord,
  entry: FantasySalaryCapEntryRecord,
  summary: FantasySalaryCapEntrySummary,
  slate: FantasySlateWindow
) {
  const modeConfig = getFantasyModeConfig(league);
  const lockLabel = `${modeConfig.scheduleLabel} for ${slate.label} is ${formatSalaryCapLock(slate.lock_at)}.`;

  if (isSalaryCapEntryLocked(slate)) {
    if (entry.status === "submitted") {
      return {
        status: "locked",
        tone: "success",
        title: "Entry locked",
        message: `${lockLabel} The submitted single entry is final for this scoring window.`,
        slate_key: slate.key,
        slate_label: slate.label,
        starts_at: slate.starts_at,
        lock_at: slate.lock_at,
        ends_at: slate.ends_at,
        is_locked: true,
        requires_submission: false,
      } satisfies FantasySalaryCapEntryWindowState;
    }

    return {
      status: "missed",
      tone: "warning",
      title: "Lock missed",
      message: `${lockLabel} This entry was not submitted before lock, so it is closed for this scoring window.`,
      slate_key: slate.key,
      slate_label: slate.label,
      starts_at: slate.starts_at,
      lock_at: slate.lock_at,
      ends_at: slate.ends_at,
      is_locked: true,
      requires_submission: true,
    } satisfies FantasySalaryCapEntryWindowState;
  }

  if (entry.status === "submitted") {
    return {
      status: "submitted",
      tone: "success",
      title: "Entry submitted",
      message: `${lockLabel} Reopen the submitted entry before lock if you need to make changes.`,
      slate_key: slate.key,
      slate_label: slate.label,
      starts_at: slate.starts_at,
      lock_at: slate.lock_at,
      ends_at: slate.ends_at,
      is_locked: false,
      requires_submission: false,
    } satisfies FantasySalaryCapEntryWindowState;
  }

  if (summary.isComplete && !summary.isOverCap) {
    return {
      status: "open",
      tone: "warning",
      title: "Submission required",
      message: `${lockLabel} Saving keeps the entry editable, but it does not enter the contest until you submit it.`,
      slate_key: slate.key,
      slate_label: slate.label,
      starts_at: slate.starts_at,
      lock_at: slate.lock_at,
      ends_at: slate.ends_at,
      is_locked: false,
      requires_submission: true,
    } satisfies FantasySalaryCapEntryWindowState;
  }

  return {
    status: "open",
    tone: "info",
    title: "Build before lock",
    message: `${lockLabel} Fill the remaining slots, save changes, then submit the final entry.`,
    slate_key: slate.key,
    slate_label: slate.label,
    starts_at: slate.starts_at,
    lock_at: slate.lock_at,
    ends_at: slate.ends_at,
    is_locked: false,
    requires_submission: true,
  } satisfies FantasySalaryCapEntryWindowState;
}

export function getRecommendedSalaryCapSlot(
  player: FantasyPoolPlayer,
  selections: FantasySalaryCapSelection[]
) {
  const eligibleSlots = salaryCapLineupSlots.filter((slot) =>
    isPlayerEligibleForSalaryCapSlot(player, slot)
  );
  const openSlot = eligibleSlots.find(
    (slot) => selections.find((selection) => selection.lineup_slot === slot)?.player == null
  );

  if (openSlot) {
    return openSlot;
  }

  return eligibleSlots
    .map((slot) => ({
      currentPlayer:
        selections.find((selection) => selection.lineup_slot === slot)?.player ?? null,
      slot,
    }))
    .sort((left, right) => {
      const leftProjection = left.currentPlayer?.average_points ?? 0;
      const rightProjection = right.currentPlayer?.average_points ?? 0;
      return leftProjection - rightProjection;
    })[0]?.slot;
}

export function buildSalaryCapAutofillSelections(
  playerPool: FantasyPoolPlayer[],
  salaryCapAmount: number
) {
  const goalkeepers = buildCandidatePool(playerPool, "GK");
  const defenders = buildCandidatePool(playerPool, "DEF");
  const midfielders = buildCandidatePool(playerPool, "MID");
  const forwards = buildCandidatePool(playerPool, "FWD");
  const flexPool = dedupePlayers([...defenders, ...midfielders, ...forwards]).sort(
    (left, right) => right.average_points - left.average_points
  );
  let bestEntry:
    | {
        projectedPoints: number;
        salarySpent: number;
        playersBySlot: Record<FantasySalaryCapLineupSlot, FantasyPoolPlayer>;
      }
    | null = null;

  for (const goalkeeper of goalkeepers) {
    for (const defenderPair of buildCombinations(defenders, 2)) {
      for (const midfielderTrio of buildCombinations(midfielders, 3)) {
        for (const forwardPair of buildCombinations(forwards, 2)) {
          const corePlayers = [
            goalkeeper,
            ...defenderPair,
            ...midfielderTrio,
            ...forwardPair,
          ];
          const uniquePlayerIds = new Set(corePlayers.map((player) => player.id));

          if (uniquePlayerIds.size !== corePlayers.length) {
            continue;
          }

          const coreSalary = corePlayers.reduce(
            (sum, player) => sum + player.salary_cost,
            0
          );

          if (coreSalary >= salaryCapAmount) {
            continue;
          }

          const flexCandidate = flexPool.find((player) => {
            if (uniquePlayerIds.has(player.id)) {
              return false;
            }

            return coreSalary + player.salary_cost <= salaryCapAmount;
          });

          if (!flexCandidate) {
            continue;
          }

          const projectedPoints = Number(
            (
              corePlayers.reduce((sum, player) => sum + player.average_points, 0) +
              flexCandidate.average_points
            ).toFixed(1)
          );
          const salarySpent = coreSalary + flexCandidate.salary_cost;
          const playersBySlot = {
            GK: goalkeeper,
            DEF_1: defenderPair[0],
            DEF_2: defenderPair[1],
            MID_1: midfielderTrio[0],
            MID_2: midfielderTrio[1],
            MID_3: midfielderTrio[2],
            FWD_1: forwardPair[0],
            FWD_2: forwardPair[1],
            FLEX: flexCandidate,
          } satisfies Record<FantasySalaryCapLineupSlot, FantasyPoolPlayer>;

          if (
            compareEntryCandidates(
              {
                projectedPoints,
                salarySpent,
              },
              bestEntry
                ? {
                    projectedPoints: bestEntry.projectedPoints,
                    salarySpent: bestEntry.salarySpent,
                  }
                : null
            )
          ) {
            bestEntry = {
              projectedPoints,
              salarySpent,
              playersBySlot,
            };
          }
        }
      }
    }
  }

  if (!bestEntry) {
    throw new Error("Unable to build a legal salary-cap lineup from the current player pool.");
  }

  return salaryCapLineupSlots.map((slot) => ({
    lineup_slot: slot,
    player: bestEntry.playersBySlot[slot] ?? null,
  })) satisfies FantasySalaryCapSelection[];
}

export function buildSalaryCapActionLabel(
  player: FantasyPoolPlayer,
  selections: FantasySalaryCapSelection[]
) {
  const recommendedSlot = getRecommendedSalaryCapSlot(player, selections);

  return recommendedSlot
    ? `Add to ${lineupSlotLabels[recommendedSlot]}`
    : "Add to entry";
}
