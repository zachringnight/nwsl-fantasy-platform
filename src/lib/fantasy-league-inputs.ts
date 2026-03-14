import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import { getFantasyDefaultLockAt } from "@/lib/fantasy-slate-engine";
import type { FantasyGameVariant } from "@/types/fantasy";

const minimumLeagueNameLength = 3;
const maximumLeagueNameLength = 48;

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeFantasyLeagueName(name: string) {
  const normalizedName = collapseWhitespace(name);

  if (normalizedName.length < minimumLeagueNameLength) {
    throw new Error("Give your league a name with at least 3 characters.");
  }

  if (normalizedName.length > maximumLeagueNameLength) {
    throw new Error("Keep the league name under 48 characters.");
  }

  return normalizedName;
}

export function normalizeFantasyLeagueCode(code: string) {
  const normalizedCode = code.replace(/\s+/g, "").toUpperCase();

  if (!normalizedCode) {
    throw new Error("Enter your league code.");
  }

  if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
    throw new Error("Enter the 6-character league code.");
  }

  return normalizedCode;
}

export function validateFantasyManagerCountTarget(managerCountTarget: number) {
  if (!Number.isInteger(managerCountTarget) || managerCountTarget < 8 || managerCountTarget > 12) {
    throw new Error("Choose a league size between 8 and 12 managers.");
  }

  return managerCountTarget;
}

function resolveClassicDraftAt(draftAt: string | undefined, now: Date) {
  if (!draftAt) {
    throw new Error("Choose a draft date and time for this classic league.");
  }

  const scheduledAt = new Date(draftAt);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Choose a valid draft date and time.");
  }

  if (scheduledAt.getTime() <= now.getTime()) {
    throw new Error("Choose a draft time in the future.");
  }

  return scheduledAt.toISOString();
}

export function resolveFantasyLeagueStartAt(
  gameVariant: FantasyGameVariant,
  draftAt?: string,
  now = new Date()
) {
  const modeConfig = getFantasyModeConfig(gameVariant);

  if (modeConfig.usesSalaryCap) {
    return getFantasyDefaultLockAt(gameVariant);
  }

  return resolveClassicDraftAt(draftAt, now);
}

export function buildLocalDateTimeInputMin(now = new Date()) {
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}
