import { NextResponse } from "next/server";
import { z } from "zod";
import { logAuthEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { authLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url(),
});

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = await checkRateLimit(authLimiter, `forgot:${ip}`);
  if (rateLimited) return rateLimited;

  const parseResult = bodySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const { email, redirectTo } = parseResult.data;

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      logger.warn({ err: error, email }, "[forgot-password] Supabase error");
    }
  } catch (err) {
    logger.error({ err }, "[forgot-password] Unexpected error");
  }

  void logAuthEvent("password_reset_requested", {
    metadata: { email },
  });

  // Always return success to avoid email enumeration
  return NextResponse.json({ success: true });
}
