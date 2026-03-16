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
      // Supabase returns "A user with this email address has already been registered"
      // for duplicates — pass that through directly.
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 422 }
      );
    }

    return NextResponse.json({ userId: data.user.id });
  } catch {
    return NextResponse.json(
      { error: "Unable to create your account." },
      { status: 500 }
    );
  }
}
