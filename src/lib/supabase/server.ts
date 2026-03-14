import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

const SUPABASE_SERVER_KEY = SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseServerClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
    throw new Error(
      "Missing Supabase server configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
