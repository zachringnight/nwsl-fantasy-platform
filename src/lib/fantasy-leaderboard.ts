import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { isSnapshotInWindow, type FantasyPointSnapshot } from "@/lib/fantasy-standings";
import type {
  FantasyLeagueMembershipRecord,
  FantasySalaryCapEntryRecord,
  FantasySalaryCapEntrySlotRecord,
  FantasySalaryCapLeaderboardEntry,
  FantasySalaryCapScoreDriver,
  FantasySlateWindow,
} from "@/types/fantasy";

export function buildSalaryCapLeaderboard(
  entries: FantasySalaryCapEntryRecord[],
  slots: FantasySalaryCapEntrySlotRecord[],
  memberships: FantasyLeagueMembershipRecord[],
  snapshots: FantasyPointSnapshot[],
  slate: FantasySlateWindow,
  now = new Date()
) {
  const relevantSnapshots = snapshots.filter((snapshot) =>
    isSnapshotInWindow(snapshot, slate)
  );
  const snapshotTotalsByPlayer = new Map<
    string,
    { points: number; approximated: boolean }
  >();

  for (const snapshot of relevantSnapshots) {
    const current = snapshotTotalsByPlayer.get(snapshot.player_id);
    snapshotTotalsByPlayer.set(snapshot.player_id, {
      points: (current?.points ?? 0) + Number(snapshot.points),
      approximated:
        Boolean(current?.approximated) || snapshot.is_approximated,
    });
  }

  const scoreStatus: FantasySalaryCapLeaderboardEntry["score_status"] =
    relevantSnapshots.length === 0
      ? "projected"
      : now.getTime() > new Date(slate.ends_at).getTime()
        ? "final"
        : "live";
  const driverMap = new Map<
    string,
    FantasySalaryCapScoreDriver
  >();

  const leaderboard = entries
    .filter((entry) => entry.status === "submitted")
    .map((entry) => {
      const entrySlots = slots.filter((slot) => slot.entry_id === entry.id);
      const scoredPlayers = entrySlots.map((slot) => {
        const real = snapshotTotalsByPlayer.get(slot.player_id);
        const projection = getFantasyPlayerById(slot.player_id)?.average_points ?? 0;
        const points = scoreStatus === "projected" ? projection : real?.points ?? 0;

        if (real) {
          const existingDriver = driverMap.get(slot.player_id);
          driverMap.set(slot.player_id, {
            player_id: slot.player_id,
            player_name: slot.player_name,
            player_position: slot.player_position,
            points: Math.max(existingDriver?.points ?? 0, real.points),
            is_approximated:
              Boolean(existingDriver?.is_approximated) || real.approximated,
          });
        }

        return {
          name: slot.player_name,
          points,
          approximated: Boolean(real?.approximated),
        };
      });
      const top = [...scoredPlayers].sort(
        (left, right) => right.points - left.points
      )[0];
      const membership = memberships.find(
        (candidate) => candidate.user_id === entry.user_id
      );

      return {
        entry_id: entry.id,
        user_id: entry.user_id,
        entry_name: entry.entry_name,
        manager_name: membership?.display_name ?? "Unknown manager",
        total_points: Number(
          scoredPlayers
            .reduce((sum, player) => sum + player.points, 0)
            .toFixed(2)
        ),
        is_approximated: scoredPlayers.some((player) => player.approximated),
        score_status: scoreStatus,
        top_scorer: top?.name ?? null,
      };
    })
    .sort(
      (left, right) =>
        right.total_points - left.total_points ||
        left.entry_name.localeCompare(right.entry_name)
    )
    .map(
      (entry, index) =>
        ({
          ...entry,
          rank: index + 1,
        }) satisfies FantasySalaryCapLeaderboardEntry
    );

  return {
    entries: leaderboard,
    scoreDrivers: [...driverMap.values()]
      .sort((left, right) => right.points - left.points)
      .slice(0, 5),
  };
}
