import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  nwslDataPublicationResultSchema,
  nwslDataPublishPayloadSchema,
  validateNwslDataPublishInvariants,
} from "@/lib/nwsl-public-data/publish-payload";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

const MAX_PAYLOAD_BYTES = 4_400_000;

function secretsMatch(received: string | null, expected: string): boolean {
  if (!received?.startsWith("Bearer ")) return false;

  const suppliedDigest = createHash("sha256")
    .update(received.slice("Bearer ".length), "utf8")
    .digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.NWSL_DATA_PUBLISH_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "NWSL data publishing is not configured" },
      { status: 503 }
    );
  }

  if (!secretsMatch(request.headers.get("authorization"), expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : null;
  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > MAX_PAYLOAD_BYTES
  ) {
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

  const parsed = nwslDataPublishPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid NWSL data publish payload",
        issues: parsed.error.issues.slice(0, 100).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const invariantErrors = validateNwslDataPublishInvariants(parsed.data);
  if (invariantErrors.length > 0) {
    return NextResponse.json(
      {
        error: "NWSL data publish safeguards failed",
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
  const rpcPayload = {
    ...parsed.data,
    run: {
      ...parsed.data.run,
      payloadChecksum,
    },
  };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_nwsl_data_snapshot", {
    p_payload: rpcPayload,
  });

  if (error) {
    console.error("NWSL public data publish failed", { code: error.code });
    return NextResponse.json(
      { error: "NWSL data snapshot could not be published" },
      { status: 500 }
    );
  }

  const publication = nwslDataPublicationResultSchema.safeParse(data);
  if (!publication.success) {
    console.error("NWSL public data publish returned an invalid receipt");
    return NextResponse.json(
      { error: "NWSL data publication could not be verified" },
      { status: 500 }
    );
  }

  const expectedCounts = {
    teams: parsed.data.teams.length,
    players: parsed.data.players.length,
    matches: parsed.data.matches.length,
    playerSeasonStats: parsed.data.playerSeasonStats.length,
    teamSeasonStats: parsed.data.teamSeasonStats.length,
    playerMatchStats: parsed.data.playerMatchStats.length,
    finishedMatches: parsed.data.matches.filter(
      (match) => match.status === "FINISHED"
    ).length,
  };
  const receipt = publication.data;
  const countsMatch = (
    Object.keys(expectedCounts) as Array<keyof typeof expectedCounts>
  ).every((key) => receipt.counts[key] === expectedCounts[key]);

  if (
    receipt.runKey !== parsed.data.run.runKey ||
    receipt.payloadChecksum !== payloadChecksum ||
    !countsMatch
  ) {
    console.error("NWSL public data publish receipt did not match the request");
    return NextResponse.json(
      { error: "NWSL data publication could not be verified" },
      { status: 500 }
    );
  }

  revalidateTag("nwsl-public-data", "max");
  revalidateTag("nwsl-teams", "max");
  revalidateTag("nwsl-players", "max");
  revalidateTag("nwsl-matches", "max");
  revalidatePath("/analytics/teams", "layout");
  revalidatePath("/analytics/players", "layout");
  revalidatePath("/analytics/matches", "layout");

  return NextResponse.json({
    ok: true,
    run: {
      id: receipt.runId,
      key: receipt.runKey,
      season: receipt.season,
      checksum: receipt.payloadChecksum,
      idempotent: receipt.idempotent,
    },
    counts: receipt.counts,
  });
}
