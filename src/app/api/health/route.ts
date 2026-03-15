import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health
 *
 * Liveness/readiness probe for deployment infrastructure.
 * Returns 200 when the app is healthy, 503 otherwise.
 */
export async function GET() {
  const checks: Record<string, boolean> = {
    app: true,
    database: false,
  };

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const healthy = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}
