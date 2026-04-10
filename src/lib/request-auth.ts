import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthenticatedRequestUser {
  email: string | null;
  id: string;
}

function getBearerToken(request?: Request) {
  if (!request) {
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

export async function getAuthenticatedRequestUser(
  request?: Request
): Promise<AuthenticatedRequestUser | null> {
  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser(bearerToken);

      if (!error && data.user) {
        return {
          email: data.user.email ?? null,
          id: data.user.id,
        };
      }
    } catch {
      // Fall through to NextAuth session checks when server Supabase auth is unavailable.
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }

  return {
    email: session.user.email ?? null,
    id: session.user.id,
  };
}

export function createUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
