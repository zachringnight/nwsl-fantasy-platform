import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeFantasyDisplayName,
  normalizeFantasyEmail,
  validateFantasyPassword,
} from "@/lib/fantasy-profile";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  password: z.string(),
});

function getSignupErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unable to create your account.";
  }

  const normalizedMessage = error.message.toLowerCase();

  if (normalizedMessage.includes("already")) {
    return "That email already has an account. Sign in instead.";
  }

  return error.message;
}

export async function POST(request: NextRequest) {
  try {
    const payload = signupSchema.parse(await request.json());
    const displayName = normalizeFantasyDisplayName(payload.displayName);
    const email = normalizeFantasyEmail(payload.email);
    const password = validateFantasyPassword(payload.password);
    const supabase = getSupabaseServerClient();

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        display_name: displayName,
      },
    });

    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error("Unable to create your account.");
    }

    const { error: profileError } = await supabase.from("fantasy_profiles").upsert(
      {
        user_id: createdUser.user.id,
        email,
        display_name: displayName,
        onboarding_complete: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (profileError) {
      await supabase.auth.admin.deleteUser(createdUser.user.id);
      throw profileError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Enter a display name, valid email, and password."
        : getSignupErrorMessage(error);

    const status = message.includes("already has an account") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
