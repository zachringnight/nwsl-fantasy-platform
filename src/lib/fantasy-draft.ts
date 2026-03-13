import type {
  FantasyDraftTurnContext,
  FantasyLeagueMembershipRecord,
  FantasyLineupSlot,
  FantasyPoolPlayer,
  FantasyRosterPlayer,
  PlayerPosition,
} from "@/types/fantasy";

export const starterLineupSlots: FantasyLineupSlot[] = [
  "GK",
  "DEF_1",
  "DEF_2",
  "MID_1",
  "MID_2",
  "MID_3",
  "FWD_1",
  "FWD_2",
  "FLEX",
];

export const benchLineupSlots: FantasyLineupSlot[] = [
  "BENCH_1",
  "BENCH_2",
  "BENCH_3",
];

export const allLineupSlots: FantasyLineupSlot[] = [
  ...starterLineupSlots,
  ...benchLineupSlots,
];

export const lineupSlotLabels: Record<FantasyLineupSlot, string> = {
  GK: "GK",
  DEF_1: "DEF 1",
  DEF_2: "DEF 2",
  MID_1: "MID 1",
  MID_2: "MID 2",
  MID_3: "MID 3",
  FWD_1: "FWD 1",
  FWD_2: "FWD 2",
  FLEX: "Flex",
  BENCH_1: "Bench 1",
  BENCH_2: "Bench 2",
  BENCH_3: "Bench 3",
};

export const slotEligibility: Record<FantasyLineupSlot, PlayerPosition[]> = {
  GK: ["GK"],
  DEF_1: ["DEF"],
  DEF_2: ["DEF"],
  MID_1: ["MID"],
  MID_2: ["MID"],
  MID_3: ["MID"],
  FWD_1: ["FWD"],
  FWD_2: ["FWD"],
  FLEX: ["DEF", "MID", "FWD"],
  BENCH_1: ["GK", "DEF", "MID", "FWD"],
  BENCH_2: ["GK", "DEF", "MID", "FWD"],
  BENCH_3: ["GK", "DEF", "MID", "FWD"],
};

export function getEligibleLineupSlots(position: PlayerPosition) {
  return allLineupSlots.filter((slot) => slotEligibility[slot].includes(position));
}

export function buildSnakeTurn(
  memberships: FantasyLeagueMembershipRecord[],
  overallPick: number,
  totalRounds: number
): FantasyDraftTurnContext | null {
  if (memberships.length === 0) {
    return null;
  }

  const orderedMemberships = memberships
    .filter((membership) => membership.draft_slot != null)
    .sort((left, right) => (left.draft_slot ?? 0) - (right.draft_slot ?? 0));

  if (orderedMemberships.length !== memberships.length) {
    return null;
  }

  const totalPicks = orderedMemberships.length * totalRounds;

  if (overallPick > totalPicks) {
    return {
      overallPick,
      roundNumber: totalRounds,
      pickNumber: orderedMemberships.length,
      membership: null,
      isFinalPick: true,
      totalPicks,
    };
  }

  const roundNumber = Math.floor((overallPick - 1) / orderedMemberships.length) + 1;
  const roundOffset = (overallPick - 1) % orderedMemberships.length;
  const isReverseRound = roundNumber % 2 === 0;
  const membership = isReverseRound
    ? orderedMemberships[orderedMemberships.length - 1 - roundOffset]
    : orderedMemberships[roundOffset];

  return {
    overallPick,
    roundNumber,
    pickNumber: roundOffset + 1,
    membership,
    isFinalPick: overallPick === totalPicks,
    totalPicks,
  };
}

export function validateDraftPick(
  player: FantasyPoolPlayer,
  roster: Array<Pick<FantasyRosterPlayer, "club_name" | "player_position">>
) {
  if (roster.length >= 12) {
    return "That roster is already full.";
  }

  const clubCount = roster.filter((entry) => entry.club_name === player.club_name).length;

  if (clubCount >= 4) {
    return "That roster already has the maximum four players from this club.";
  }

  return null;
}

export function chooseAutopickPlayer(
  availablePlayers: FantasyPoolPlayer[],
  roster: Array<Pick<FantasyRosterPlayer, "player_position" | "club_name">>,
  queue: FantasyPoolPlayer[]
) {
  const queuedAvailable = queue.find((player) => {
    const isAvailable = availablePlayers.some((available) => available.id === player.id);
    return isAvailable && !validateDraftPick(player, roster);
  });

  if (queuedAvailable) {
    return queuedAvailable;
  }

  const counts = roster.reduce<Record<PlayerPosition, number>>(
    (accumulator, player) => {
      accumulator[player.player_position] += 1;
      return accumulator;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );

  const starterTargets: Record<PlayerPosition, number> = {
    GK: 1,
    DEF: 2,
    MID: 3,
    FWD: 2,
  };

  const scoredPlayers = availablePlayers
    .map((player) => {
      const validationError = validateDraftPick(player, roster);

      if (validationError) {
        return null;
      }

      const starterNeedBonus =
        counts[player.position] < starterTargets[player.position] ? 4 : 0;
      const scarcityPenalty = counts[player.position] >= 4 ? -1.5 : 0;

      return {
        player,
        weightedScore: player.average_points + starterNeedBonus + scarcityPenalty,
      };
    })
    .filter((entry): entry is { player: FantasyPoolPlayer; weightedScore: number } => entry != null)
    .sort((left, right) => right.weightedScore - left.weightedScore);

  return scoredPlayers[0]?.player ?? null;
}

export function buildSuggestedLineup(roster: FantasyRosterPlayer[]) {
  const byPosition: Record<PlayerPosition, FantasyRosterPlayer[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };

  roster.forEach((player) => {
    byPosition[player.player_position].push(player);
  });

  for (const players of Object.values(byPosition)) {
    players.sort((left, right) => right.player.average_points - left.player.average_points);
  }

  const assignments = new Map<string, FantasyLineupSlot | null>();

  const claimSlot = (slot: FantasyLineupSlot, players: FantasyRosterPlayer[]) => {
    const player = players.shift();

    if (player) {
      assignments.set(player.id, slot);
    }
  };

  claimSlot("GK", byPosition.GK);
  claimSlot("DEF_1", byPosition.DEF);
  claimSlot("DEF_2", byPosition.DEF);
  claimSlot("MID_1", byPosition.MID);
  claimSlot("MID_2", byPosition.MID);
  claimSlot("MID_3", byPosition.MID);
  claimSlot("FWD_1", byPosition.FWD);
  claimSlot("FWD_2", byPosition.FWD);

  const flexPool = [...byPosition.DEF, ...byPosition.MID, ...byPosition.FWD].sort(
    (left, right) => right.player.average_points - left.player.average_points
  );
  const flexPlayer = flexPool.shift();

  if (flexPlayer) {
    assignments.set(flexPlayer.id, "FLEX");
    byPosition[flexPlayer.player_position] = byPosition[flexPlayer.player_position].filter(
      (entry) => entry.id !== flexPlayer.id
    );
  }

  const benchPool = [...byPosition.GK, ...byPosition.DEF, ...byPosition.MID, ...byPosition.FWD].sort(
    (left, right) => right.player.average_points - left.player.average_points
  );

  benchLineupSlots.forEach((slot) => {
    const nextBenchPlayer = benchPool.shift();

    if (nextBenchPlayer) {
      assignments.set(nextBenchPlayer.id, slot);
    }
  });

  roster.forEach((player) => {
    if (!assignments.has(player.id)) {
      assignments.set(player.id, null);
    }
  });

  return assignments;
}

export function isLineupSlotValid(slot: FantasyLineupSlot, position: PlayerPosition) {
  return slotEligibility[slot].includes(position);
}
