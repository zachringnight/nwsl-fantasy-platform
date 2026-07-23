import type { FantasySlateWindow } from "@/types/fantasy";

export interface ClassicLineupLockState {
  isLocked: boolean;
  lockAt: string;
  label: string;
}

export function buildClassicLineupLockState(
  window: FantasySlateWindow,
  earliestKickoff: string | null,
  now = new Date()
): ClassicLineupLockState {
  const lockAt = earliestKickoff ?? window.lock_at;
  const isLocked = earliestKickoff
    ? now.getTime() >= new Date(earliestKickoff).getTime()
    : false;

  return {
    isLocked,
    lockAt,
    label: isLocked
      ? `Lineup locked at ${new Date(lockAt).toLocaleString()}.`
      : earliestKickoff
        ? `Lineup locks at ${new Date(lockAt).toLocaleString()}.`
        : "Lineup remains editable until the first official match is ingested.",
  };
}

export function assertClassicLineupUnlocked(
  state: ClassicLineupLockState
): void {
  if (state.isLocked) {
    throw new Error(
      "This weekly lineup is locked because the first match has kicked off."
    );
  }
}
