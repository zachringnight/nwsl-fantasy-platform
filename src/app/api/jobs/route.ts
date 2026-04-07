import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { jobRegistry, getJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.JOBS_API_SECRET;
  if (!expectedToken || !authHeader) return false;

  const expected = `Bearer ${expectedToken}`;
  if (authHeader.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(authHeader),
    Buffer.from(expected)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    jobs: jobRegistry.map((job) => ({
      id: job.id,
      description: job.description,
      frequency: job.frequency,
    })),
  });
}

const postSchema = z.object({
  jobId: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = postSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const job = getJob(parseResult.data.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    const result = await job.run({
      startedAt: new Date().toISOString(),
      requestedBy: "api",
    });
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err, jobId: parseResult.data.jobId }, "[jobs:POST]");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Job execution failed" },
      { status: 500 }
    );
  }
}
