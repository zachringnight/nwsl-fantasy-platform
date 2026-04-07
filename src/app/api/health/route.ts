import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {};

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
  const predictionApiUrl = process.env.PREDICTION_API_URL;
  if (predictionApiUrl) {
    try {
      const response = await fetch(`${predictionApiUrl}/health`, {
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
    checks.modelApi = { status: "unconfigured", message: "PREDICTION_API_URL not set" };
  }

  const overall = Object.values(checks).every(
    (c) => c.status === "healthy" || c.status === "unconfigured"
  )
    ? "healthy"
    : "unhealthy";

  const statusCode = overall === "healthy" ? 200 : 503;

  return NextResponse.json(
    { status: overall, checks, timestamp: new Date().toISOString() },
    { status: statusCode }
  );
}
