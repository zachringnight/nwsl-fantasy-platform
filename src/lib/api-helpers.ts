import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiLimiter,
  authLimiter,
  mutationLimiter,
  rateLimitResponse,
} from "@/lib/rate-limit";

export async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

export async function getLeagueMembership(leagueId: string, userId: string) {
  return prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    include: { team: true },
  });
}

export async function requireMembership(leagueId: string, userId: string) {
  const membership = await getLeagueMembership(leagueId, userId);
  if (!membership) return null;
  return membership;
}

export async function requireCommissioner(leagueId: string, userId: string) {
  const membership = await getLeagueMembership(leagueId, userId);
  if (!membership || membership.role !== "COMMISSIONER") return null;
  return membership;
}

/**
 * Check rate limit for an API request. Returns a 429 response if the limit is
 * exceeded, or null if the request is allowed.
 *
 * Usage in route handlers:
 *   const limited = checkRateLimit(request, "api");
 *   if (limited) return limited;
 */
export function checkRateLimit(
  request: Request,
  tier: "api" | "auth" | "mutation" = "api"
): NextResponse | null {
  const limiter =
    tier === "auth"
      ? authLimiter
      : tier === "mutation"
        ? mutationLimiter
        : apiLimiter;

  const limit = tier === "auth" ? 10 : tier === "mutation" ? 30 : 60;
  const result = limiter(request);

  if (!result.success) {
    return rateLimitResponse(result, limit);
  }

  return null;
}
