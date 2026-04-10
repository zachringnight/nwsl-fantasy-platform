import { NextResponse } from "next/server";
import { getPredictionApiUrl } from "@/lib/prediction-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<
    string,
    { status: "healthy" | "unhealthy" | "degraded"; message?: string }
  > = {};

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "healthy" };
  } catch (err) {
    checks.database = {
      status: "unhealthy",
      message: err instanceof Error ? err.message : "Database connection failed",
    };
  }

  // Check model API health
  const predictionApiUrl = getPredictionApiUrl("/health");
  if (predictionApiUrl) {
    try {
      const response = await fetch(predictionApiUrl, {
        signal: AbortSignal.timeout(5000),
      });
      checks.modelApi = response.ok
        ? { status: "healthy" }
        : { status: "unhealthy", message: `Model API returned ${response.status}` };
    } catch (err) {
      checks.modelApi = {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Model API unreachable",
      };
    }
  } else {
    checks.modelApi = {
      status: "degraded",
      message: "PREDICTION_API_URL not set",
    };
  }

  const statuses = Object.values(checks).map((check) => check.status);
  const overall = statuses.includes("unhealthy")
    ? "unhealthy"
    : statuses.includes("degraded")
      ? "degraded"
      : "healthy";

  const statusCode = overall === "healthy" ? 200 : 503;

  return NextResponse.json(
    { status: overall, checks, timestamp: new Date().toISOString() },
    { status: statusCode }
  );
}
