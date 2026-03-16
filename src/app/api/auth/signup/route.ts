import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { email, password, displayName } = await request.json();

    if (!email || !password || !displayName) {
      return NextResponse.json(
        { error: "Email, password, and display name are required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    // Create the user with the admin API — auto-confirms email
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 422 }
      );
    }

    // Create the fantasy profile server-side so it's immediately available
    // after the client signs in. The service role key bypasses RLS.
    const { error: profileError } = await supabase
      .from("fantasy_profiles")
      .upsert(
        {
          user_id: data.user.id,
          email: email.trim(),
          display_name: displayName.trim(),
          onboarding_complete: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (profileError) {
      // User was created but profile insert failed — log but don't block.
      // The client-side upsertFantasyProfile call will retry.
      console.error("Profile insert failed after signup:", profileError.message);
    }

    return NextResponse.json({ userId: data.user.id });
  } catch {
    return NextResponse.json(
      { error: "Unable to create your account." },
      { status: 500 }
    );
  }
}
