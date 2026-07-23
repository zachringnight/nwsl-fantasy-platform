import type { FantasyPointSnapshot } from "@/lib/fantasy-standings";

export interface FantasyScoringOverride {
  id: string;
  player_id: string;
  player_name: string;
  match_id: string;
  original_points: number;
  corrected_points: number;
  reason: string;
  status: "applied" | "reverted";
  created_by: string | null;
  created_at: string;
}

export function applyScoringOverrides(
  snapshots: FantasyPointSnapshot[],
  overrides: FantasyScoringOverride[]
) {
  const latestByKey = new Map<string, FantasyScoringOverride>();

  for (const override of [...overrides].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  )) {
    latestByKey.set(`${override.player_id}:${override.match_id}`, override);
  }

  return snapshots.map((snapshot) => {
    const override = latestByKey.get(
      `${snapshot.player_id}:${snapshot.match_id}`
    );
    if (!override || override.status !== "applied") return snapshot;

    return {
      ...snapshot,
      points: Number(override.corrected_points),
      breakdown: {
        ...snapshot.breakdown,
        adminOverride:
          Number(override.corrected_points) - Number(snapshot.points),
      },
    };
  });
}
