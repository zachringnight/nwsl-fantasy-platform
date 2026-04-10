import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import {
  getPredictionApiJsonHeaders,
  getPredictionApiUrl,
  type PredictionApiRetrainResponse,
} from "@/lib/prediction-api";

function isRetrainResponse(
  payload: unknown
): payload is PredictionApiRetrainResponse {
  const response = payload as Partial<PredictionApiRetrainResponse> | null;
  return (
    !!response &&
    typeof response === "object" &&
    typeof response.success === "boolean" &&
    typeof response.message === "string" &&
    typeof response.returncode === "number"
  );
}

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "retrain-model";
  const apiUrl = getPredictionApiUrl("/retrain");

  if (!apiUrl) {
    return {
      jobId,
      status: "skipped",
      summary: "PREDICTION_API_URL not configured",
    };
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: getPredictionApiJsonHeaders(),
    body: JSON.stringify({ model: "all", config: "configs/default.yaml" }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRetrainResponse(result) && result.message
        ? result.message
        : `Retrain API returned ${response.status}`;
    throw new Error(message);
  }

  if (!isRetrainResponse(result)) {
    throw new Error("Retrain API returned an invalid response payload");
  }
  if (!result.success) {
    throw new Error(
      `Model retrain failed: ${result.message} (exit code ${result.returncode})`
    );
  }

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
