import { NextResponse } from "next/server";
import { getPredictionApiUrl } from "@/lib/prediction-api";
import {
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
} from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) {
    return createUnauthorizedResponse();
  }

  const predictionApiUrl = getPredictionApiUrl("/health");
  if (!predictionApiUrl) {
    return NextResponse.json(
      {
        status: "degraded",
        error: "PREDICTION_API_URL not configured",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(predictionApiUrl, {
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json().catch(() => null);

    return NextResponse.json(
      {
        status: response.ok ? "healthy" : "unhealthy",
        statusCode: response.status,
        data,
        timestamp: new Date().toISOString(),
      },
      { status: response.ok ? 200 : 502 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Model API unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 502 }
    );
  }
}
