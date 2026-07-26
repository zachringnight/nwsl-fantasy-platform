import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  modelPublishPayloadSchema,
  validateModelPublishInvariants,
} from "@/lib/model-picks/publish-payload";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const MAX_PAYLOAD_BYTES = 1_000_000;

function secretsMatch(received: string | null, expected: string): boolean {
  if (!received?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(received.slice("Bearer ".length), "utf8");
  const configured = Buffer.from(expected, "utf8");
  if (supplied.length !== configured.length) return false;
  return timingSafeEqual(supplied, configured);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.NWSL_MODEL_PUBLISH_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Model publishing is not configured" },
      { status: 503 }
    );
  }

  if (!secretsMatch(request.headers.get("authorization"), expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let input: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    input = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = modelPublishPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid model publish payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const invariantErrors = validateModelPublishInvariants(parsed.data);
  if (invariantErrors.length > 0) {
    return NextResponse.json(
      { error: "Model publish safeguards failed", issues: invariantErrors },
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
    .update(JSON.stringify(parsed.data))
    .digest("hex");
  const payload = {
    ...parsed.data,
    run: {
      ...parsed.data.run,
      payloadChecksum,
    },
  };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_nwsl_model_snapshot", {
    p_payload: payload,
  });

  if (error) {
    console.error("NWSL model publish failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Model snapshot could not be published" },
      { status: 500 }
    );
  }

  revalidatePath("/analytics/predictions");
  return NextResponse.json({ ok: true, publication: data });
}
