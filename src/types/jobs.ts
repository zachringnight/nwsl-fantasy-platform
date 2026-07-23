export interface JobContext {
  startedAt: string;
  requestedBy?: string;
  params?: Record<string, unknown>;
}

export interface JobResult {
  jobId: string;
  status: "success" | "skipped";
  summary: string;
}

export interface JobDefinition {
  id: string;
  description: string;
  frequency: string;
  run: (context: JobContext) => Promise<JobResult>;
}
