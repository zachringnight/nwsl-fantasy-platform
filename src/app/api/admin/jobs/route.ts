import { NextResponse } from "next/server";
import { getJob, jobRegistry } from "@/lib/jobs/registry";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

export async function GET() {
  type JobRunRow = {
    job_id: string;
    status: string;
    summary: string;
    started_at: string;
    completed_at: string;
  };
  const latestByJob = new Map<string, JobRunRow>();
  let unavailable: string | undefined;

  if (hasSupabaseServerConfig()) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("fantasy_job_runs")
      .select("job_id, status, summary, started_at, completed_at")
      .order("completed_at", { ascending: false })
      .limit(100);

    for (const run of (data ?? []) as JobRunRow[]) {
      if (!latestByJob.has(run.job_id)) latestByJob.set(run.job_id, run);
    }
  } else {
    unavailable = "Job history is unavailable until Supabase is configured.";
  }

  return NextResponse.json({
    jobs: jobRegistry.map((job) => ({
      id: job.id,
      description: job.description,
      frequency: job.frequency,
      lastRun: latestByJob.get(job.id) ?? null,
    })),
    unavailable,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    jobId?: string;
    params?: Record<string, unknown>;
  };
  const job = body.jobId ? getJob(body.jobId) : undefined;

  if (!job) {
    return NextResponse.json({ error: "Unknown job." }, { status: 404 });
  }

  const startedAt = new Date().toISOString();
  const supabase = hasSupabaseServerConfig()
    ? getSupabaseServerClient()
    : null;

  try {
    const result = await job.run({
      startedAt,
      requestedBy: "admin",
      params: body.params,
    });
    if (supabase) {
      await supabase.from("fantasy_job_runs").insert({
        job_id: job.id,
        status: result.status,
        summary: result.summary,
        started_at: startedAt,
      });
    }
    return NextResponse.json({
      ...result,
      persisted: Boolean(supabase),
    });
  } catch (error) {
    const summary =
      error instanceof Error ? error.message : "Job execution failed.";
    if (supabase) {
      await supabase.from("fantasy_job_runs").insert({
        job_id: job.id,
        status: "error",
        summary,
        started_at: startedAt,
      });
    }
    return NextResponse.json({ error: summary }, { status: 500 });
  }
}
