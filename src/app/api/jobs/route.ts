import { NextResponse } from "next/server";
import { jobRegistry, getJob } from "@/lib/jobs/registry";

function authorizeJobsRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.JOBS_API_SECRET;

  if (!expectedToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const authorization = authorizeJobsRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  return NextResponse.json({
    jobs: jobRegistry.map((job) => ({
      id: job.id,
      description: job.description,
      frequency: job.frequency,
    })),
  });
}

export async function POST(request: Request) {
  const authorization = authorizeJobsRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await request.json()) as { jobId?: string };

  if (!body.jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = getJob(body.jobId);

  if (!job) {
    return NextResponse.json(
      { error: `Job not found: ${body.jobId}` },
      { status: 404 }
    );
  }

  try {
    const result = await job.run({
      startedAt: new Date().toISOString(),
      requestedBy: "api",
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Job execution failed",
        jobId: body.jobId,
      },
      { status: 500 }
    );
  }
}
