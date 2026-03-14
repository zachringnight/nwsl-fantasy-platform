import type { User } from "@supabase/supabase-js";

const minimumDisplayNameLength = 2;

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function titleCaseSegment(segment: string) {
  if (!segment) {
    return "";
  }

  return segment[0]!.toUpperCase() + segment.slice(1).toLowerCase();
}

function getDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const normalizedLocalPart = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedLocalPart) {
    return "";
  }

  return normalizedLocalPart
    .split(" ")
    .map(titleCaseSegment)
    .join(" ");
}

export function normalizeFantasyDisplayName(displayName: string) {
  const normalizedDisplayName = collapseWhitespace(displayName);

  if (normalizedDisplayName.length < minimumDisplayNameLength) {
    throw new Error("Add a display name with at least 2 characters.");
  }

  return normalizedDisplayName;
}

export function normalizeFantasyEmail(email: string) {
  const normalizedEmail = collapseWhitespace(email).toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Add your email address.");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }

  return normalizedEmail;
}

export function validateFantasyPassword(password: string) {
  if (password.length < 6) {
    throw new Error("Use a password with at least 6 characters.");
  }

  return password;
}

export interface FantasyProfileSeed {
  displayName: string;
  email: string | null;
  onboardingComplete: false;
}

export function buildFantasyProfileSeed(user: Pick<User, "email" | "is_anonymous" | "user_metadata">) {
  if (user.is_anonymous) {
    return null;
  }

  const rawMetadata = user.user_metadata ?? {};
  const candidateDisplayNames = [
    rawMetadata.display_name,
    rawMetadata.full_name,
    rawMetadata.name,
    user.email ? getDisplayNameFromEmail(user.email) : "",
  ];

  for (const candidate of candidateDisplayNames) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalizedCandidate = collapseWhitespace(candidate);

    if (normalizedCandidate.length >= minimumDisplayNameLength) {
      return {
        displayName: normalizedCandidate,
        email: user.email?.trim().toLowerCase() || null,
        onboardingComplete: false as const,
      } satisfies FantasyProfileSeed;
    }
  }

  return null;
}
