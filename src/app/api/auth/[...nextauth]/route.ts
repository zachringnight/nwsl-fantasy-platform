import { NextResponse } from "next/server";

// The public app authenticates directly with Supabase Auth.
// Disable the legacy NextAuth surface so launch traffic cannot hit an unused auth path.
function disabledAuthRoute() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export const GET = disabledAuthRoute;
export const POST = disabledAuthRoute;
