import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
} from "@/lib/request-auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) {
    return createUnauthorizedResponse();
  }

  const predictionApiUrl = process.env.PREDICTION_API_URL;
  if (!predictionApiUrl) {
    return NextResponse.json(
      { error: "PREDICTION_API_URL not configured" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${predictionApiUrl}/health`, {
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
