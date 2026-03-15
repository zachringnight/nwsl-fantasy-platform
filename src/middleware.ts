import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Routes that require authentication. Unauthenticated users are redirected
 * to /login with a callbackUrl so they return after signing in.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leagues",
  "/settings",
  "/notifications",
  "/matchup-center",
  "/admin",
];

/** Routes that authenticated users should not visit (redirect to /dashboard). */
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];

/** Public routes and prefixes that never require auth. */
const PUBLIC_PREFIXES = [
  "/api",
  "/onboarding",
  "/players",
  "/rules",
  "/help",
  "/contact",
  "/terms",
  "/privacy",
  "/draft-room",
  "/_next",
  "/favicon",
  "/opengraph-image",
];

function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

// ---------------------------------------------------------------------------
// Security headers applied to every response
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://media.api-sports.io",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

if (process.env.NODE_ENV === "production") {
  SECURITY_HEADERS["Strict-Transport-Security"] =
    "max-age=31536000; includeSubDomains; preload";
}

function applySecurityHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always apply security headers.
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const isAuthenticated = !!token;

  // Redirect authenticated users away from auth pages.
  if (isAuthRoute(pathname) && isAuthenticated) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", request.url))
    );
  }

  // Redirect unauthenticated users away from protected pages.
  if (isProtected(pathname) && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Public routes — pass through with security headers.
  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next.js internals.
     * This negative lookahead skips _next/static, _next/image, and common
     * static file extensions.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
