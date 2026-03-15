import { NextResponse } from "next/server";

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * Sliding window rate limiter using an in-memory Map.
 * Each key maps to an array of request timestamps within the current window.
 */
class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly hits: Map<string, number[]> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;

    // Auto-cleanup expired entries every 60s to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    // Allow the Node process to exit even if the timer is still active
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing timestamps and filter to only those within the current window
    const timestamps = this.hits.get(key) ?? [];
    const windowTimestamps = timestamps.filter((t) => t > windowStart);

    // Add the current request timestamp
    windowTimestamps.push(now);
    this.hits.set(key, windowTimestamps);

    const count = windowTimestamps.length;
    const success = count <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - count);

    // Reset time: when the oldest request in the window expires
    const oldestInWindow = windowTimestamps[0];
    const reset = oldestInWindow + this.windowMs;

    return { success, remaining, reset };
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.hits) {
      const valid = timestamps.filter((t) => t > windowStart);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

function getIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain a comma-separated list; take the first IP
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a rate limit checker bound to a specific limiter instance.
 * Returns a function that accepts a Request and returns the rate limit result.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const limiter = new SlidingWindowRateLimiter(options);

  return function rateLimit(request: Request): RateLimitResult {
    const ip = getIP(request);
    return limiter.check(ip);
  };
}

/**
 * Default rate limiter: 60 requests per 60-second window.
 */
export const rateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
});

// ---------------------------------------------------------------------------
// Pre-configured tier limiters
// ---------------------------------------------------------------------------

/** General API routes — 60 requests per minute */
export const apiLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
});

/** Auth routes (login / signup) — 10 requests per minute */
export const authLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
});

/** Mutation routes (POST / PUT / PATCH / DELETE) — 30 requests per minute */
export const mutationLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
});

// ---------------------------------------------------------------------------
// 429 Response helper
// ---------------------------------------------------------------------------

/**
 * Returns a 429 Too Many Requests NextResponse with standard rate-limit headers.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  limit: number = 60
): NextResponse {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
        "Retry-After": String(Math.max(0, retryAfter)),
      },
    }
  );
}
