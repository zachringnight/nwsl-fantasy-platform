import { NextResponse, type NextRequest } from "next/server";

function getCanonicalOrigin() {
  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";

  if (!rawOrigin) {
    return null;
  }

  try {
    return new URL(rawOrigin);
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.next();
  }

  const canonicalOrigin = getCanonicalOrigin();

  if (!canonicalOrigin) {
    return NextResponse.next();
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const requestHost = forwardedHost ?? request.nextUrl.host;
  const requestProto = forwardedProto ?? request.nextUrl.protocol.replace(":", "");
  const canonicalProto = canonicalOrigin.protocol.replace(":", "");

  if (requestHost === canonicalOrigin.host && requestProto === canonicalProto) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = canonicalOrigin.protocol;
  redirectUrl.host = canonicalOrigin.host;

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
