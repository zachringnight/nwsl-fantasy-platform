import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  generalPredictionPublishPayloadSchema,
  validateGeneralPredictionPublishInvariants,
} from "@/lib/general-predictions/publish-payload";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const MAX_PAYLOAD_BYTES = 2_000_000;
const RUN_KEY_PATTERN = /^nwsl-general:[A-Za-z0-9._:+-]+$/;

function secretsMatch(received: string | null, expected: string): boolean {
  if (!received?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256")
    .update(received.slice("Bearer ".length), "utf8")
    .digest();
  const configured = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(supplied, configured);
}

function authorized(request: Request): NextResponse | null {
  const expectedSecret = process.env.NWSL_MODEL_PUBLISH_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "General prediction publishing is not configured" },
      { status: 503 }
    );
  }
  if (!secretsMatch(request.headers.get("authorization"), expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const authError = authorized(request);
  if (authError) return authError;
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Supabase server configuration is unavailable" },
      { status: 503 }
    );
  }

  const runKey = new URL(request.url).searchParams.get("runKey") ?? "";
  if (!RUN_KEY_PATTERN.test(runKey)) {
    return NextResponse.json({ error: "Invalid run key" }, { status: 400 });
  }

  const { data, error } = await getSupabaseServerClient()
    .from("nwsl_prediction_runs")
    .select(
      "id,run_key,model_version,model_family,training_cutoff,source_manifest_generated_at,generated_at,gating_status,feature_status,row_count,first_prediction_date,last_prediction_date,payload_checksum,published_at"
    )
    .eq("run_key", runKey)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "General prediction readback failed" },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    publication: {
      runId: data.id,
      runKey: data.run_key,
      modelVersion: data.model_version,
      modelFamily: data.model_family,
      trainingCutoff: data.training_cutoff,
      sourceManifestGeneratedAt: data.source_manifest_generated_at,
      generatedAt: data.generated_at,
      gatingStatus: data.gating_status,
      featureStatus: data.feature_status,
      rowCount: data.row_count,
      firstPredictionDate: data.first_prediction_date,
      lastPredictionDate: data.last_prediction_date,
      payloadChecksum: data.payload_checksum,
      publishedAt: data.published_at,
    },
  });
}

export async function POST(request: Request) {
  const authError = authorized(request);
  if (authError) return authError;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = generalPredictionPublishPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid general prediction payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }
  const invariantErrors = validateGeneralPredictionPublishInvariants(parsed.data);
  if (invariantErrors.length > 0) {
    return NextResponse.json(
      {
        error: "General prediction safeguards failed",
        issues: invariantErrors,
      },
      { status: 409 }
    );
  }
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Supabase server configuration is unavailable" },
      { status: 503 }
    );
  }

  const payloadChecksum = createHash("sha256")
    .update(JSON.stringify(parsed.data), "utf8")
    .digest("hex");
  const payload = {
    ...parsed.data,
    run: {
      ...parsed.data.run,
      payloadChecksum,
    },
  };
  const { data, error } = await getSupabaseServerClient().rpc(
    "publish_nwsl_prediction_snapshot",
    { p_payload: payload }
  );
  if (error) {
    console.error("General NWSL prediction publish failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "General prediction snapshot could not be published" },
      { status: 500 }
    );
  }
  const receipt = data as
    | {
        runKey?: string;
        modelVersion?: string;
        rowCount?: number;
        payloadChecksum?: string;
      }
    | null;
  if (
    receipt?.runKey !== parsed.data.run.runKey ||
    receipt.modelVersion !== parsed.data.run.modelVersion ||
    receipt.rowCount !== parsed.data.predictions.length ||
    receipt.payloadChecksum !== payloadChecksum
  ) {
    return NextResponse.json(
      { error: "General prediction publication could not be verified" },
      { status: 500 }
    );
  }

  revalidatePath("/analytics");
  revalidatePath("/analytics/predictions");
  revalidatePath("/analytics/matches");
  return NextResponse.json({ ok: true, publication: data });
}
