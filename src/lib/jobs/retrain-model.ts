import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "retrain-model";
  const apiUrl = process.env.PREDICTION_API_URL;
  const apiSecret = process.env.PREDICTION_API_SECRET;

  if (!apiUrl) {
    return {
      jobId,
      status: "skipped",
      summary: "PREDICTION_API_URL not configured",
    };
  }

  const response = await fetch(`${apiUrl}/retrain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiSecret}`,
    },
    body: JSON.stringify({ model: "all", config: "configs/default.yaml" }),
  });

  if (!response.ok) {
    throw new Error(`Retrain API returned ${response.status}`);
  }

  const result = await response.json();

  return {
    jobId,
    status: "success",
    summary: `Model retrain completed: ${result.message}. Started at ${context.startedAt}.`,
  };
}

export const retrainModelJob: JobDefinition = {
  id: "retrain-model",
  description: "Trigger model retraining via the prediction API",
  frequency: "weekly",
  run,
};
