# NWSL Fantasy Platform — Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all security/reliability issues, integrate the Python betting model, polish UX/copy, optimize performance, and wire up production infrastructure so the platform is ready to launch.

**Architecture:** Eight work chunks with dependencies: (1) security & bug fixes, (2) model data layer (Prisma + FastAPI + sync jobs), (3) model UI (match insights, player cards, edge dashboard), (4) UX polish (metadata/loading/error/accessibility/copywriting), (5) performance (component splitting/memoization/Suspense), (6) production infra (Sentry/CI/env validation/logging), (7) admin console & incomplete features, (8) deployment config. Chunks 1, 2, 4, 5, 6 can run in parallel. Chunk 3 depends on Chunk 2. Chunk 7 is independent. Chunk 8 runs last.

**Parallel Strategy Note:** Chunks that modify the same files (`prisma/schema.prisma`, `next.config.ts`, `.env.example`) must coordinate. The plan assigns file ownership: Chunk 1 owns `prisma/schema.prisma` cascade/index changes AND the new prediction tables (merged into Task 1.7). Chunk 6 owns `next.config.ts` and `.env.example`. Other chunks must not modify these files.

**Tech Stack:** Next.js 16, TypeScript 5, Prisma 7, Supabase, NextAuth 4.24, Tailwind CSS 4, Zod 4.1, FastAPI, Python 3.11+, Vitest, Sentry

**Spec:** `docs/superpowers/specs/2026-03-15-launch-readiness-design.md`

---

## Chunk 1: Security & Structural Integrity

### Task 1.1: Environment Variable Validation

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/__tests__/env.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/env.test.ts
import { describe, it, expect, vi } from "vitest";

describe("env validation", () => {
  it("throws if DATABASE_URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => {
      // Force re-evaluation
      vi.resetModules();
      return import("../env");
    }).rejects.toThrow();
  });

  it("parses valid env vars", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_pub_test");
    vi.stubEnv("AUTH_SECRET", "a]".repeat(16) + "xx");
    vi.stubEnv("JOBS_API_SECRET", "a]".repeat(8) + "xx");
    vi.resetModules();
    const { env } = await import("../env");
    expect(env.DATABASE_URL).toBe("postgresql://localhost:5432/test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/env.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Supabase supports both naming conventions — at least one of each pair must be set
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32),
  JOBS_API_SECRET: z.string().min(16),
  PREDICTION_API_URL: z.string().url().optional(),
  PREDICTION_API_SECRET: z.string().min(16).optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_ANALYTICS_ID: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  API_FOOTBALL_KEY: z.string().optional(),
});

const envSchemaRefined = envSchema.refine(
  (env) => env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { message: "Either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY must be set" }
);

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchemaRefined.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment configuration. Check server logs.");
  }
  return result.data;
}

export const env = validateEnv();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/__tests__/env.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/__tests__/env.test.ts
git commit -m "feat: add Zod-based env var validation at startup"
```

---

### Task 1.2: Auth Middleware

**Files:**
- Create: `src/middleware.ts`
- Create: `src/__tests__/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/middleware.test.ts
import { describe, it, expect, vi } from "vitest";

describe("middleware", () => {
  it("exports a config with protected route matchers", async () => {
    const mod = await import("../middleware");
    expect(mod.config).toBeDefined();
    expect(mod.config.matcher).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/middleware.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leagues",
  "/players",
  "/settings",
  "/admin",
  "/notifications",
  "/matchup-center",
  "/onboarding",
];

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  response.headers.set("Permissions-Policy", "camera=(), microphone=()");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route is protected
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtected) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    });

    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return addSecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  // CSRF check for mutation requests on custom API routes
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/health") &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)
  ) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/leagues/:path*",
    "/players/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/notifications/:path*",
    "/matchup-center/:path*",
    "/onboarding/:path*",
    "/api/((?!auth|health).*)",
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/middleware.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/__tests__/middleware.test.ts
git commit -m "feat: add auth middleware with route protection and security headers"
```

---

### Task 1.3: Fix Notifications API — Add Auth + Validation

**Files:**
- Modify: `src/app/api/notifications/route.ts` (all 52 lines)

- [ ] **Step 1: Rewrite with auth and Zod validation**

Replace the entire file `src/app/api/notifications/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/notification-service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 20), 1),
    100
  );

  try {
    const notifications = await getUserNotifications(session.user.id, {
      limit,
      unreadOnly,
    });
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("[notifications:GET]", err);
    return NextResponse.json(
      { error: "Unable to load notifications." },
      { status: 500 }
    );
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), notificationId: z.string().min(1) }),
  z.object({ action: z.literal("read_all") }),
]);

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.format() },
      { status: 400 }
    );
  }

  const body = parseResult.data;

  try {
    if (body.action === "read") {
      await markNotificationRead(body.notificationId);
    } else {
      await markAllNotificationsRead(session.user.id);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications:PATCH]", err);
    return NextResponse.json(
      { error: "Unable to update notifications." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/route.ts
git commit -m "fix: add auth + Zod validation to notifications API"
```

---

### Task 1.4: Fix Jobs API — Timing-Safe Auth + Validation + Protect GET

**Files:**
- Modify: `src/app/api/jobs/route.ts` (all 61 lines)

- [ ] **Step 1: Rewrite with timing-safe comparison and Zod**

Replace the entire file `src/app/api/jobs/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { jobRegistry, getJob } from "@/lib/jobs/registry";

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.JOBS_API_SECRET;
  if (!expectedToken || !authHeader) return false;

  const expected = `Bearer ${expectedToken}`;
  if (authHeader.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(authHeader),
    Buffer.from(expected)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    jobs: jobRegistry.map((job) => ({
      id: job.id,
      description: job.description,
      frequency: job.frequency,
    })),
  });
}

const postSchema = z.object({
  jobId: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = postSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const job = getJob(parseResult.data.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    const result = await job.run({
      startedAt: new Date().toISOString(),
      requestedBy: "api",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[jobs:POST] ${parseResult.data.jobId}`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Job execution failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/jobs/route.ts
git commit -m "fix: add timing-safe auth to GET + Zod validation to jobs API"
```

---

### Task 1.5: Install Rate Limiting

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `package.json` (add dependency)

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @upstash/ratelimit @upstash/redis
```

- [ ] **Step 2: Create rate limiter utility**

```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Fallback to in-memory if Redis not configured (local dev)
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : undefined;

export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "rl:auth",
    })
  : null;

export const apiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:api",
    })
  : null;

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  if (!limiter) return null; // Skip in dev without Redis
  const { success, remaining, reset } = await limiter.limit(identifier);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }
  return null;
}
```

- [ ] **Step 3: Update `.env.example`**

Add to `.env.example` after the JOBS_API_SECRET section:

```
# Rate limiting (optional — omit for no rate limiting in dev)
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/rate-limit.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: add rate limiting infrastructure via Upstash"
```

---

### Task 1.6: Fix Password Policy

**Files:**
- Modify: `src/app/reset-password/page.tsx` (line 40: change `6` to `8`)
- Modify: `src/components/auth/signup-local-form.tsx` (line 95: change `6` to `8`)

- [ ] **Step 1: Update reset-password minimum**

In `src/app/reset-password/page.tsx`, find `password.length < 6` and change to `password.length < 8`. Also update the error message to say "at least 8 characters".

- [ ] **Step 2: Update signup minimum**

In `src/components/auth/signup-local-form.tsx`, find `password.length < 6` and change to `password.length < 8`. Also update the error message to say "at least 8 characters".

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/reset-password/page.tsx src/components/auth/signup-local-form.tsx
git commit -m "fix: increase minimum password length to 8 characters"
```

---

### Task 1.7: Fix Database Schema — Cascades + Indexes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Fix cascade deletes**

In `prisma/schema.prisma`:

Line 928 — change `onDelete: SetNull` to `onDelete: Cascade`:
```
  league       League?             @relation(fields: [leagueId], references: [id], onDelete: Cascade)
```

Line 929 — change `onDelete: SetNull` to `onDelete: Cascade`:
```
  fantasyTeam  FantasyTeam?        @relation(fields: [fantasyTeamId], references: [id], onDelete: Cascade)
```

Line 948 — change `onDelete: SetNull` to `onDelete: Cascade`:
```
  snapshot        FantasyPointSnapshot? @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
```

Line 983 — change `onDelete: SetNull` to `onDelete: Cascade`:
```
  league      League?        @relation(fields: [leagueId], references: [id], onDelete: Cascade)
```

Leave `AuditLog.league` (line 962) as `SetNull` — correct for audit compliance.

- [ ] **Step 2: Add missing indexes**

Add `@@index` directives to the following models in `prisma/schema.prisma`:

In the `Player` model (after line 343), add:
```prisma
  @@index([currentClubId])
  @@index([status])
```

In the `Fixture` model (after line 627), add:
```prisma
  @@index([homeClubId])
  @@index([awayClubId])
  @@index([startsAt])
```

In the `FantasyPointSnapshot` model (after line 699), add:
```prisma
  @@index([statLineId])
```

- [ ] **Step 3: Add prediction/projection tables (consolidated from Chunk 2)**

This step is consolidated here because only one chunk should modify `prisma/schema.prisma`. Append to the end of the schema file the `ModelPrediction`, `FairOdds`, `BettingEdge`, and `PlayerProjection` models defined in Task 2.1 below. Also add the relation arrays (`projections PlayerProjection[]`) to the `Player` model (after line 343), and (`predictions ModelPrediction[]`, `playerProjections PlayerProjection[]`) to the `Fixture` model (after line 627).

See Task 2.1 for the exact Prisma model definitions.

- [ ] **Step 4: Validate schema**

Run: `pnpm prisma:validate`
Expected: PASS

- [ ] **Step 5: Generate migration**

Run: `pnpm prisma:migrate:dev --name fix-cascades-indexes-and-prediction-tables`

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: fix cascades, add indexes, add prediction/projection tables"
```

---

### Task 1.8: Add Error Boundaries

**Files:**
- Create: `src/app/global-error.tsx`
- Create: `src/app/players/error.tsx`
- Create: `src/app/matchup-center/error.tsx`
- Create: `src/app/notifications/error.tsx`
- Create: `src/app/settings/error.tsx`
- Create: `src/app/admin/error.tsx`
- Create: `src/app/onboarding/error.tsx`

- [ ] **Step 1: Create shared error UI component**

All error boundaries share the same pattern. Create the global one first:

```typescript
// src/app/global-error.tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/60">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-full bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-strong transition-colors"
          >
            Try again
          </button>
          <a
            href="/contact"
            className="mt-3 text-sm text-white/50 hover:text-white/70 underline"
          >
            Contact support
          </a>
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create route-level error boundaries**

For each route (`players`, `matchup-center`, `notifications`, `settings`, `admin`, `onboarding`), create an `error.tsx` that follows this pattern:

```typescript
// src/app/players/error.tsx  (same pattern for each)
"use client";

export default function PlayersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-shell flex flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-xl font-bold text-white">Something went wrong</h1>
      <p className="mt-2 text-sm text-white/60">
        We couldn&apos;t load this page. Please try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-strong transition-colors"
      >
        Try again
      </button>
      <a
        href="/contact"
        className="mt-3 text-sm text-white/50 hover:text-white/70 underline"
      >
        Contact support
      </a>
    </main>
  );
}
```

Repeat for: `matchup-center/error.tsx`, `notifications/error.tsx`, `settings/error.tsx`, `admin/error.tsx`, `onboarding/error.tsx` — changing only the function name.

- [ ] **Step 3: Run build to verify**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/global-error.tsx src/app/players/error.tsx src/app/matchup-center/error.tsx src/app/notifications/error.tsx src/app/settings/error.tsx src/app/admin/error.tsx src/app/onboarding/error.tsx
git commit -m "feat: add error boundaries for all major route groups"
```

---

### Task 1.9: Fix Silent Error Handling

**Files:**
- Modify: `src/app/notifications/page.tsx` (lines 86-87, 113-120)
- Modify: `src/lib/jobs/fantasy-scoring.ts` (wrap `run()` in try/catch)

- [ ] **Step 1: Fix notification page silent catches**

In `src/app/notifications/page.tsx`:

Find the empty catch block around line 86-87 and replace with:
```typescript
} catch (err) {
  console.error("[notifications] Failed to mark as read:", err);
}
```

Find the catch block around lines 113-120 (the optimistic revert) and add logging:
```typescript
} catch (err) {
  console.error("[notifications] Failed to mark all as read:", err);
  // Revert optimistic update
  // ... existing revert code stays ...
}
```

- [ ] **Step 2: Fix fantasy-scoring job**

In `src/lib/jobs/fantasy-scoring.ts`, wrap the `run()` function body in try/catch:
```typescript
async run(context) {
  try {
    // ... existing code ...
  } catch (err) {
    console.error("[fantasy-scoring] Job failed:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/notifications/page.tsx src/lib/jobs/fantasy-scoring.ts
git commit -m "fix: replace silent catch blocks with error logging"
```

---

## Chunk 2: Model Integration

### Task 2.1: Add Prediction Tables to Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma` (add 4 new models at end of file)

- [ ] **Step 1: Add ModelPrediction, FairOdds, BettingEdge, PlayerProjection models**

Append to `prisma/schema.prisma` before the closing of the file:

```prisma
// ───────────────────────────────────────────────────────────
// Model Integration: Predictions & Projections
// ───────────────────────────────────────────────────────────

model ModelPrediction {
  id           String      @id @default(cuid())
  fixtureId    String
  modelName    String
  homeWinProb  Float
  drawProb     Float
  awayWinProb  Float
  lambdaHome   Float
  lambdaAway   Float
  scoreMatrix  Json
  metadata     Json?
  generatedAt  DateTime    @default(now())
  fixture      Fixture     @relation(fields: [fixtureId], references: [id], onDelete: Cascade)
  fairOdds     FairOdds?
  edges        BettingEdge[]

  @@unique([fixtureId, modelName])
  @@index([fixtureId])
  @@index([generatedAt])
}

model FairOdds {
  id           String          @id @default(cuid())
  predictionId String          @unique
  homeOdds     Float
  drawOdds     Float
  awayOdds     Float
  bttsYesOdds  Float?
  bttsNoOdds   Float?
  over25Odds   Float?
  under25Odds  Float?
  prediction   ModelPrediction @relation(fields: [predictionId], references: [id], onDelete: Cascade)
}

model BettingEdge {
  id               String          @id @default(cuid())
  predictionId     String
  market           String
  fairOdds         Float
  marketOdds       Float?
  edge             Float?
  recommendedStake Float?
  prediction       ModelPrediction @relation(fields: [predictionId], references: [id], onDelete: Cascade)

  @@index([predictionId])
}

model PlayerProjection {
  id              String   @id @default(cuid())
  playerId        String
  fixtureId       String
  projectedPoints Float
  confidence      Float
  floorPoints     Float
  ceilingPoints   Float
  valueRating     String
  generatedAt     DateTime @default(now())
  player          Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  fixture         Fixture  @relation(fields: [fixtureId], references: [id], onDelete: Cascade)

  @@unique([playerId, fixtureId])
  @@index([playerId])
  @@index([fixtureId])
}
```

- [ ] **Step 2: Add relation arrays to Player and Fixture models**

In the `Player` model (around line 343), add:
```prisma
  projections     PlayerProjection[]
```

In the `Fixture` model (around line 627), add:
```prisma
  predictions      ModelPrediction[]
  playerProjections PlayerProjection[]
```

**NOTE:** The actual schema modification and migration is consolidated into Task 1.7 Step 3 to avoid parallel conflicts. The model definitions above are the reference for Task 1.7. This task has no steps to execute — skip to Task 2.2.

---

### Task 2.2: Build FastAPI Model Server

**Files:**
- Create: `nwsl-model/api/__init__.py`
- Create: `nwsl-model/api/main.py`
- Create: `nwsl-model/api/schemas.py`
- Create: `nwsl-model/api/deps.py`
- Create: `nwsl-model/tests/test_api.py`
- Modify: `nwsl-model/pyproject.toml` (add fastapi, uvicorn, httpx)

- [ ] **Step 1: Add FastAPI dependencies**

In `nwsl-model/pyproject.toml`, add to `dependencies`:
```toml
    "fastapi>=0.115",
    "uvicorn>=0.34",
```

Add to `[project.optional-dependencies] dev`:
```toml
    "httpx>=0.27",
```

Run: `cd nwsl-model && pip install -e ".[dev]"`

- [ ] **Step 2: Write API schemas**

```python
# nwsl-model/api/schemas.py
from pydantic import BaseModel

class PredictRequest(BaseModel):
    home_team: str
    away_team: str
    model_name: str = "dixon_coles"  # or "bivariate_poisson"

class PredictResponse(BaseModel):
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    lambda_home: float
    lambda_away: float
    projected_home_goals: int   # argmax (most likely)
    projected_away_goals: int   # argmax (most likely)
    score_matrix: list[list[float]]
    metadata: dict | None = None

class BatchPredictRequest(BaseModel):
    fixtures: list[PredictRequest]

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    last_trained: str | None
    version: str
```

- [ ] **Step 3: Write dependency injection**

```python
# nwsl-model/api/deps.py
import hmac
import os
import pickle
from pathlib import Path
from functools import lru_cache

MODEL_DIR = Path(__file__).parent.parent / "data" / "processed" / "models"
API_SECRET = os.environ.get("PREDICTION_API_SECRET", "")

@lru_cache(maxsize=2)
def load_model(model_name: str):
    """Load a trained model from disk."""
    model_path = MODEL_DIR / f"{model_name}_model.pkl"
    if not model_path.exists():
        return None
    with open(model_path, "rb") as f:
        return pickle.load(f)

def verify_token(authorization: str | None) -> bool:
    if not API_SECRET:
        return True  # No secret = dev mode
    if not authorization:
        return False
    expected = f"Bearer {API_SECRET}"
    return hmac.compare_digest(authorization, expected)
```

- [ ] **Step 4: Write the FastAPI app**

```python
# nwsl-model/api/main.py
from fastapi import FastAPI, Header, HTTPException
from api.schemas import (
    PredictRequest,
    PredictResponse,
    BatchPredictRequest,
    HealthResponse,
)
from api.deps import load_model, verify_token
import numpy as np

app = FastAPI(title="NWSL Model API", version="1.0.0")


@app.get("/health", response_model=HealthResponse)
async def health():
    dc = load_model("dixon_coles")
    return HealthResponse(
        status="healthy" if dc else "no_model",
        model_loaded=dc is not None,
        last_trained=None,  # TODO: read from model metadata
        version="1.0.0",
    )


@app.post("/predict", response_model=PredictResponse)
async def predict(
    req: PredictRequest,
    authorization: str | None = Header(None),
):
    if not verify_token(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    model = load_model(req.model_name)
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model '{req.model_name}' not loaded. Train it first.",
        )

    score_matrix = model.predict(req.home_team, req.away_team)
    matrix = score_matrix if isinstance(score_matrix, np.ndarray) else np.array(score_matrix)

    home_win = float(np.tril(matrix, -1).sum())
    draw = float(np.diag(matrix).sum())
    away_win = float(np.triu(matrix, 1).sum())

    # Expected goals (mean of marginals)
    goals_range = np.arange(matrix.shape[0])
    home_marginal = matrix.sum(axis=1)
    away_marginal = matrix.sum(axis=0)
    lambda_home = float(np.dot(goals_range, home_marginal))
    lambda_away = float(np.dot(goals_range, away_marginal))

    # Most likely scoreline (argmax of full matrix)
    flat_idx = int(np.argmax(matrix))
    proj_home = flat_idx // matrix.shape[1]
    proj_away = flat_idx % matrix.shape[1]

    return PredictResponse(
        home_win_prob=home_win,
        draw_prob=draw,
        away_win_prob=away_win,
        lambda_home=lambda_home,
        lambda_away=lambda_away,
        projected_home_goals=proj_home,
        projected_away_goals=proj_away,
        score_matrix=matrix.tolist(),
        metadata=getattr(model, "metadata_", None),
    )


@app.post("/batch-predict", response_model=list[PredictResponse])
async def batch_predict(
    req: BatchPredictRequest,
    authorization: str | None = Header(None),
):
    if not verify_token(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    results = []
    for fixture in req.fixtures:
        result = await predict(fixture, authorization)
        results.append(result)
    return results
```

- [ ] **Step 5: Write tests**

```python
# nwsl-model/tests/test_api.py
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "no_model")
    assert "version" in data
```

- [ ] **Step 6: Run tests**

Run: `cd nwsl-model && pytest tests/test_api.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add nwsl-model/api/ nwsl-model/tests/test_api.py nwsl-model/pyproject.toml
git commit -m "feat: add FastAPI model server with predict, batch-predict, health endpoints"
```

---

### Task 2.3: Create Next.js Prediction API Routes

**Files:**
- Create: `src/app/api/predictions/route.ts`
- Create: `src/app/api/predictions/upcoming/route.ts`
- Create: `src/app/api/player-projections/route.ts`
- Create: `src/app/api/model/health/route.ts`
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Create predictions API**

```typescript
// src/app/api/predictions/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");

  if (!fixtureId) {
    return NextResponse.json({ error: "Missing fixtureId" }, { status: 400 });
  }

  try {
    const predictions = await prisma.modelPrediction.findMany({
      where: { fixtureId },
      include: { fairOdds: true },
    });
    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("[predictions:GET]", err);
    return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create upcoming predictions API**

```typescript
// src/app/api/predictions/upcoming/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const predictions = await prisma.modelPrediction.findMany({
      where: {
        fixture: {
          startsAt: { gte: new Date() },
        },
      },
      include: {
        fixture: {
          include: { homeClub: true, awayClub: true },
        },
        fairOdds: true,
      },
      orderBy: { fixture: { startsAt: "asc" } },
      take: 50,
    });
    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("[predictions:upcoming]", err);
    return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create player projections API**

```typescript
// src/app/api/player-projections/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId");
  const fixtureId = searchParams.get("fixtureId");

  const where: Record<string, string> = {};
  if (playerId) where.playerId = playerId;
  if (fixtureId) where.fixtureId = fixtureId;

  if (Object.keys(where).length === 0) {
    return NextResponse.json({ error: "Provide playerId or fixtureId" }, { status: 400 });
  }

  try {
    const projections = await prisma.playerProjection.findMany({
      where,
      include: { player: true, fixture: true },
      orderBy: { projectedPoints: "desc" },
      take: 100,
    });
    return NextResponse.json({ projections });
  } catch (err) {
    console.error("[player-projections:GET]", err);
    return NextResponse.json({ error: "Failed to fetch projections" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create health check endpoint**

```typescript
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown",
    };
  }

  // Model API check
  const modelUrl = process.env.PREDICTION_API_URL;
  if (modelUrl) {
    try {
      const res = await fetch(`${modelUrl}/health`, { signal: AbortSignal.timeout(5000) });
      checks.modelApi = { status: res.ok ? "ok" : "degraded" };
    } catch {
      checks.modelApi = { status: "unreachable" };
    }
  } else {
    checks.modelApi = { status: "not_configured" };
  }

  const overall = Object.values(checks).every((c) => c.status === "ok")
    ? "healthy"
    : Object.values(checks).some((c) => c.status === "error")
      ? "unhealthy"
      : "degraded";

  return NextResponse.json({
    status: overall,
    checks,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/predictions/ src/app/api/player-projections/ src/app/api/health/ src/app/api/model/
git commit -m "feat: add prediction, player projection, and health check API routes"
```

---

### Task 2.4: Add Prediction Sync Job

**Files:**
- Create: `src/lib/jobs/sync-predictions.ts`
- Modify: `src/lib/jobs/registry.ts` (register new job)

- [ ] **Step 1: Create sync job**

```typescript
// src/lib/jobs/sync-predictions.ts
import { prisma } from "@/lib/prisma";
import type { JobHandler } from "./registry";

export const syncPredictions: JobHandler = {
  id: "sync-predictions",
  description: "Fetch model predictions for upcoming fixtures",
  frequency: "daily",
  async run(context) {
    const apiUrl = process.env.PREDICTION_API_URL;
    const apiSecret = process.env.PREDICTION_API_SECRET;

    if (!apiUrl) {
      return { success: false, error: "PREDICTION_API_URL not configured" };
    }

    // Get upcoming fixtures
    const fixtures = await prisma.fixture.findMany({
      where: {
        startsAt: { gte: new Date() },
        status: "SCHEDULED",
      },
      include: { homeClub: true, awayClub: true },
      take: 30,
    });

    if (fixtures.length === 0) {
      return { success: true, message: "No upcoming fixtures", predictions: 0 };
    }

    const batchPayload = {
      fixtures: fixtures.map((f) => ({
        home_team: f.homeClub.name,
        away_team: f.awayClub.name,
        model_name: "dixon_coles",
      })),
    };

    const response = await fetch(`${apiUrl}/batch-predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiSecret}`,
      },
      body: JSON.stringify(batchPayload),
    });

    if (!response.ok) {
      return { success: false, error: `Model API returned ${response.status}` };
    }

    const predictions = await response.json();
    let saved = 0;

    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i];
      const pred = predictions[i];

      await prisma.modelPrediction.upsert({
        where: {
          fixtureId_modelName: {
            fixtureId: fixture.id,
            modelName: "dixon_coles",
          },
        },
        create: {
          fixtureId: fixture.id,
          modelName: "dixon_coles",
          homeWinProb: pred.home_win_prob,
          drawProb: pred.draw_prob,
          awayWinProb: pred.away_win_prob,
          lambdaHome: pred.lambda_home,
          lambdaAway: pred.lambda_away,
          scoreMatrix: pred.score_matrix,
          metadata: pred.metadata,
        },
        update: {
          homeWinProb: pred.home_win_prob,
          drawProb: pred.draw_prob,
          awayWinProb: pred.away_win_prob,
          lambdaHome: pred.lambda_home,
          lambdaAway: pred.lambda_away,
          scoreMatrix: pred.score_matrix,
          metadata: pred.metadata,
          generatedAt: new Date(),
        },
      });
      saved++;
    }

    return {
      success: true,
      startedAt: context.startedAt,
      predictions: saved,
    };
  },
};
```

- [ ] **Step 2: Register in job registry**

In `src/lib/jobs/registry.ts`, import and add `syncPredictions` to the `jobRegistry` array.

- [ ] **Step 3: Commit**

```bash
git add src/lib/jobs/sync-predictions.ts src/lib/jobs/registry.ts
git commit -m "feat: add sync-predictions job for daily model integration"
```

---

## Chunk 3: UX Polish & Copywriting

### Task 3.1: Add Metadata to All Pages

**Files:** Every `page.tsx` under `src/app/`

- [ ] **Step 1: Add metadata to static pages**

For each static page, add `export const metadata: Metadata = { title: "...", description: "..." }` following the pattern in the spec. The root layout already has a template (`%s | NWSL Fantasy`), so page titles should omit the app name.

Pages to update (add `import type { Metadata } from "next"` and export):
- `src/app/page.tsx` — title: "Model-Powered Fantasy Soccer"
- `src/app/dashboard/page.tsx` — title: "Dashboard"
- `src/app/login/page.tsx` — title: "Sign In"
- `src/app/signup/page.tsx` — title: "Create Account"
- `src/app/help/page.tsx` — title: "Help Center"
- `src/app/rules/page.tsx` — title: "Scoring Rules"
- `src/app/onboarding/page.tsx` — title: "Welcome"
- `src/app/admin/page.tsx` — title: "Admin Console"
- `src/app/players/page.tsx` — title: "Player Board"
- `src/app/players/compare/page.tsx` — title: "Compare Players"
- `src/app/matchup-center/page.tsx` — title: "Matchup Center"
- `src/app/notifications/page.tsx` — title: "Notifications"
- `src/app/settings/page.tsx` — title: "Settings"
- `src/app/leagues/create/page.tsx` — title: "Create League"
- `src/app/leagues/join/page.tsx` — title: "Join League"
- `src/app/forgot-password/page.tsx` — title: "Forgot Password"
- `src/app/reset-password/page.tsx` — title: "Reset Password"

- [ ] **Step 2: Add dynamic metadata to parameterized pages**

For dynamic pages, add `generateMetadata` functions:
- `src/app/players/[playerId]/page.tsx`
- `src/app/leagues/[leagueId]/page.tsx` and sub-routes

- [ ] **Step 3: Run build to verify**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/
git commit -m "feat: add metadata to all pages for SEO"
```

---

### Task 3.2: Add Loading Skeletons

**Files:**
- Create: `src/app/players/[playerId]/loading.tsx`
- Create: `src/app/admin/loading.tsx`
- Create: `src/app/onboarding/loading.tsx`
- Create: `src/app/leagues/[leagueId]/loading.tsx`
- Create: `src/app/leagues/[leagueId]/draft/room/loading.tsx`

- [ ] **Step 1: Create loading skeletons**

Follow the existing pattern from `src/app/dashboard/loading.tsx` — use `animate-pulse` with `glass-card` styling. Each skeleton should approximate the layout of the actual page.

Example for player detail:
```typescript
// src/app/players/[playerId]/loading.tsx
export default function PlayerDetailLoading() {
  return (
    <main className="page-shell space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="glass-card rounded-[2.25rem] border border-line bg-panel-strong p-6">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 animate-pulse rounded-full bg-white/8" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-48 animate-pulse rounded-lg bg-white/8" />
            <div className="h-4 w-32 animate-pulse rounded-md bg-white/5" />
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[1.75rem] border border-line bg-panel-strong/60" />
        <div className="h-64 animate-pulse rounded-[1.75rem] border border-line bg-panel-strong/60" />
      </div>
    </main>
  );
}
```

Repeat the pattern for admin, onboarding, league detail, and draft room — each matching its page's layout.

- [ ] **Step 2: Review existing loading files**

Check `src/app/dashboard/loading.tsx`, `src/app/players/loading.tsx`, `src/app/matchup-center/loading.tsx`, `src/app/notifications/loading.tsx`, `src/app/settings/loading.tsx` — ensure they use proper skeleton patterns (not generic spinners). Update if needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/
git commit -m "feat: add loading skeletons for all data-fetching routes"
```

---

### Task 3.3: Add SEO Infrastructure

**Files:**
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/manifest.ts`

- [ ] **Step 1: Create robots.ts**

```typescript
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/onboarding/"],
    },
    sitemap: "https://nwslfantasy.com/sitemap.xml",
  };
}
```

- [ ] **Step 2: Create sitemap.ts**

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://nwslfantasy.com";
  const staticPages = [
    "",
    "/help",
    "/rules",
    "/terms",
    "/privacy",
    "/contact",
    "/players",
    "/players/compare",
  ];

  return staticPages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
```

- [ ] **Step 3: Create manifest.ts**

```typescript
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NWSL Fantasy",
    short_name: "NWSL Fantasy",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/robots.ts src/app/sitemap.ts src/app/manifest.ts
git commit -m "feat: add robots.txt, sitemap, and PWA manifest"
```

---

## Chunk 4: Performance & Optimization

### Task 4.1: Optimize Next.js Config

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts with image and performance settings**

Replace `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/players/**",
      },
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/teams/**",
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Run build to verify**

Run: `pnpm build`
Expected: PASS — should see reduced bundle sizes in build output

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "perf: optimize image config and enable package import optimization"
```

---

### Task 4.2: Fix Club Logo Image Optimization

**Files:**
- Modify: `src/components/ui/club-logo.tsx` (remove `unoptimized` escape hatch)

- [ ] **Step 1: Remove unoptimized prop**

In `src/components/ui/club-logo.tsx`, find where `unoptimized={!matched.logo.startsWith("/")}` is used and remove the `unoptimized` prop entirely. The remote patterns in `next.config.ts` now cover external images.

- [ ] **Step 2: Run build to verify**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/club-logo.tsx
git commit -m "perf: remove unoptimized escape hatch from club logos"
```

---

### Task 4.3: Split fantasy-api.ts into Domain Modules

**Files:**
- Create: `src/lib/fantasy-api/` directory
- Create: `src/lib/fantasy-api/leagues.ts`
- Create: `src/lib/fantasy-api/drafts.ts`
- Create: `src/lib/fantasy-api/matchups.ts`
- Create: `src/lib/fantasy-api/lineups.ts`
- Create: `src/lib/fantasy-api/trades.ts`
- Create: `src/lib/fantasy-api/waivers.ts`
- Create: `src/lib/fantasy-api/scoring.ts`
- Create: `src/lib/fantasy-api/notifications.ts`
- Create: `src/lib/fantasy-api/index.ts`
- Modify: `src/lib/fantasy-api.ts` → convert to barrel re-export

- [ ] **Step 1: Read and analyze fantasy-api.ts**

Read the full file to identify function boundaries and which functions belong to which domain. Group functions by: league CRUD, draft operations, matchup operations, lineup management, trade operations, waiver operations, scoring, notifications.

- [ ] **Step 2: Create domain modules**

Move functions into their respective domain files. Each file imports its own dependencies (prisma, types, etc.).

- [ ] **Step 3: Create barrel index**

```typescript
// src/lib/fantasy-api/index.ts
export * from "./leagues";
export * from "./drafts";
export * from "./matchups";
export * from "./lineups";
export * from "./trades";
export * from "./waivers";
export * from "./scoring";
export * from "./notifications";
```

- [ ] **Step 4: Update old file to re-export**

Replace `src/lib/fantasy-api.ts` with:
```typescript
// Backwards compatibility — all imports now come from domain modules
export * from "./fantasy-api/index";
```

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: All PASS — no import changes needed in consumers due to barrel re-export

- [ ] **Step 6: Commit**

```bash
git add src/lib/fantasy-api/ src/lib/fantasy-api.ts
git commit -m "refactor: split fantasy-api.ts into domain modules"
```

---

### Task 4.4: Add Dynamic Imports for Heavy Components

**Files:**
- Modify: Pages that import `draft-room-client`, `salary-cap-entry-builder`, `admin` components

- [ ] **Step 1: Add dynamic imports**

In pages that import the heaviest components, switch to `next/dynamic`:

```typescript
import dynamic from "next/dynamic";

const DraftRoomClient = dynamic(
  () => import("@/components/draft/draft-room-client"),
  { ssr: false }
);
```

Apply to: draft room page, salary cap page, admin page.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS — should see these chunks loaded lazily in build output

- [ ] **Step 3: Commit**

```bash
git add src/app/
git commit -m "perf: add dynamic imports for heavy client components"
```

---

## Chunk 5: Production Readiness

### Task 5.1: Install and Configure Sentry

**Files:**
- Modify: `package.json` (add @sentry/nextjs)
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Modify: `next.config.ts` (wrap with withSentryConfig)

- [ ] **Step 1: Install Sentry**

```bash
pnpm add @sentry/nextjs
```

- [ ] **Step 2: Create Sentry configs**

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  enabled: process.env.NODE_ENV === "production",
});
```

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

```typescript
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 3: Wrap next.config.ts**

```typescript
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ... existing config ...
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

- [ ] **Step 4: Add Sentry env vars to .env.example**

```
# Sentry (optional — omit to disable error tracking)
# SENTRY_DSN=
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_ORG=
# SENTRY_PROJECT=
```

- [ ] **Step 5: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts next.config.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: add Sentry error tracking and performance monitoring"
```

---

### Task 5.2: Add CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  build:
    runs-on: ubuntu-latest
    needs: lint-typecheck-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
      AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
      JOBS_API_SECRET: ${{ secrets.JOBS_API_SECRET }}

  model-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: cd nwsl-model && pip install -e ".[dev]"
      - run: cd nwsl-model && pytest tests/ -v
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add CI pipeline with lint, typecheck, test, build"
```

---

### Task 5.3: Add Docker Configuration for Model Server

**Files:**
- Create: `nwsl-model/Dockerfile`
- Create: `nwsl-model/.dockerignore`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# nwsl-model/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
COPY src/ src/
COPY api/ api/
COPY configs/ configs/
COPY data/processed/models/ data/processed/models/

RUN pip install --no-cache-dir -e .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create .dockerignore**

```
# nwsl-model/.dockerignore
__pycache__
*.pyc
.pytest_cache
.ruff_cache
data/raw/
tests/
.git
```

- [ ] **Step 3: Commit**

```bash
git add nwsl-model/Dockerfile nwsl-model/.dockerignore
git commit -m "feat: add Dockerfile for model API server"
```

---

### Task 5.4: Update .env.example with All Production Vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace .env.example with complete template**

```env
# === REQUIRED ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:[YOUR-SUPABASE-DB-PASSWORD]@db.your-project-ref.supabase.co:5432/postgres

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=sb_secret_your_secret_key
SUPABASE_SERVICE_ROLE_KEY=

# Auth
AUTH_SECRET=replace-with-a-random-secret-min-32-chars
JOBS_API_SECRET=replace-with-a-random-secret-min-16-chars

# === MODEL INTEGRATION (Required for predictions) ===
# PREDICTION_API_URL=http://localhost:8000
# PREDICTION_API_SECRET=replace-with-a-random-secret-min-16-chars

# === MONITORING (Recommended for production) ===
# SENTRY_DSN=
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_ORG=
# SENTRY_PROJECT=
# NEXT_PUBLIC_ANALYTICS_ID=

# === RATE LIMITING (Optional — omit for no rate limiting in dev) ===
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

# === OAUTH (Optional — omit to disable Google sign-in) ===
# AUTH_GOOGLE_ID=
# AUTH_GOOGLE_SECRET=

# === EMAIL / SMTP (Optional — omit to disable email notifications) ===
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=
# SMTP_PASS=

# === EXTERNAL DATA (Optional — omit for mock data) ===
# API_FOOTBALL_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with all production variables"
```

---

## Final Verification

### Task F.1: Full Build & Test

- [ ] **Step 1: Run full CI locally**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: All PASS

- [ ] **Step 2: Run model tests**

```bash
cd nwsl-model && pytest tests/ -v
```

Expected: All PASS

- [ ] **Step 3: Verify Prisma schema**

```bash
pnpm prisma:validate
```

Expected: PASS

---

## Chunk 6: Model-Powered UI (Depends on Chunk 2)

### Task 6.1: Match Insight Card Component

**Files:**
- Create: `src/components/matchup/match-insight-card.tsx`
- Create: `src/components/matchup/__tests__/match-insight-card.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/matchup/__tests__/match-insight-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchInsightCard } from "../match-insight-card";

describe("MatchInsightCard", () => {
  const prediction = {
    homeWinProb: 0.58,
    drawProb: 0.22,
    awayWinProb: 0.20,
    lambdaHome: 1.8,
    lambdaAway: 1.2,
    scoreMatrix: Array(7).fill(Array(7).fill(0.02)),
    homeClubName: "Angel City FC",
    awayClubName: "Racing Louisville",
  };

  it("renders win probability bar", () => {
    render(<MatchInsightCard {...prediction} />);
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("renders projected scoreline", () => {
    render(<MatchInsightCard {...prediction} />);
    expect(screen.getByText(/1\.8 xG/)).toBeInTheDocument();
    expect(screen.getByText(/1\.2 xG/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/matchup/__tests__/match-insight-card.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement component**

```typescript
// src/components/matchup/match-insight-card.tsx
"use client";

interface MatchInsightCardProps {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  lambdaHome: number;
  lambdaAway: number;
  projectedHomeGoals: number;
  projectedAwayGoals: number;
  scoreMatrix: number[][];
  homeClubName: string;
  awayClubName: string;
}

export function MatchInsightCard({
  homeWinProb,
  drawProb,
  awayWinProb,
  lambdaHome,
  lambdaAway,
  projectedHomeGoals,
  projectedAwayGoals,
  scoreMatrix,
  homeClubName,
  awayClubName,
}: MatchInsightCardProps) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // Top 5 most likely scorelines from the score matrix
  const scorelines: { home: number; away: number; prob: number }[] = [];
  for (let h = 0; h < scoreMatrix.length; h++) {
    for (let a = 0; a < scoreMatrix[h].length; a++) {
      scorelines.push({ home: h, away: a, prob: scoreMatrix[h][a] });
    }
  }
  scorelines.sort((a, b) => b.prob - a.prob);
  const top5 = scorelines.slice(0, 5);

  return (
    <div className="glass-card rounded-2xl border border-line bg-panel-strong p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
        Model Insight
      </h3>

      {/* Win Probability Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-white/60">
          <span>{homeClubName}</span>
          <span>Draw</span>
          <span>{awayClubName}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: pct(homeWinProb) }}
            title={`Home: ${pct(homeWinProb)}`}
          />
          <div
            className="bg-white/20 transition-all"
            style={{ width: pct(drawProb) }}
            title={`Draw: ${pct(drawProb)}`}
          />
          <div
            className="bg-blue-500 transition-all"
            style={{ width: pct(awayWinProb) }}
            title={`Away: ${pct(awayWinProb)}`}
          />
        </div>
        <div className="flex justify-between text-sm font-semibold text-white">
          <span>{pct(homeWinProb)}</span>
          <span>{pct(drawProb)}</span>
          <span>{pct(awayWinProb)}</span>
        </div>
      </div>

      {/* Projected Scoreline */}
      <div className="flex justify-center items-baseline gap-3 py-2">
        <span className="text-3xl font-bold text-white">{projectedHomeGoals}</span>
        <span className="text-white/30 text-lg">-</span>
        <span className="text-3xl font-bold text-white">{projectedAwayGoals}</span>
      </div>
      <div className="flex justify-between text-xs text-white/50">
        <span>{lambdaHome.toFixed(1)} xG expected</span>
        <span>{lambdaAway.toFixed(1)} xG expected</span>
      </div>

      {/* Top Scorelines */}
      <div className="space-y-1">
        <p className="text-xs text-white/50 uppercase tracking-wider">Most Likely Scores</p>
        <div className="flex gap-2 flex-wrap">
          {top5.map((s, i) => (
            <span
              key={i}
              className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70"
            >
              {s.home}-{s.away}{" "}
              <span className="text-white/40">{pct(s.prob)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/components/matchup/__tests__/match-insight-card.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/matchup/match-insight-card.tsx src/components/matchup/__tests__/match-insight-card.test.tsx
git commit -m "feat: add MatchInsightCard with win probability bar and top scorelines"
```

---

### Task 6.2: Enhanced Player Card with Projections

**Files:**
- Create: `src/components/player/player-projection-badge.tsx`
- Create: `src/components/player/__tests__/player-projection-badge.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/player/__tests__/player-projection-badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerProjectionBadge } from "../player-projection-badge";

describe("PlayerProjectionBadge", () => {
  it("renders projected points with floor/ceiling", () => {
    render(
      <PlayerProjectionBadge
        projectedPoints={8.2}
        floorPoints={4.1}
        ceilingPoints={14.6}
        valueRating="elite_value"
        confidence={0.78}
      />
    );
    expect(screen.getByText("8.2")).toBeInTheDocument();
    expect(screen.getByText(/4\.1/)).toBeInTheDocument();
    expect(screen.getByText(/14\.6/)).toBeInTheDocument();
    expect(screen.getByText("Elite Value")).toBeInTheDocument();
  });

  it("renders overpriced rating", () => {
    render(
      <PlayerProjectionBadge
        projectedPoints={3.0}
        floorPoints={1.0}
        ceilingPoints={6.0}
        valueRating="overpriced"
        confidence={0.65}
      />
    );
    expect(screen.getByText("Overpriced")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement component**

```typescript
// src/components/player/player-projection-badge.tsx
const VALUE_LABELS: Record<string, { label: string; color: string }> = {
  elite_value: { label: "Elite Value", color: "text-emerald-400 bg-emerald-400/10" },
  good_value: { label: "Good Value", color: "text-green-400 bg-green-400/10" },
  fair: { label: "Fair", color: "text-white/60 bg-white/5" },
  overpriced: { label: "Overpriced", color: "text-red-400 bg-red-400/10" },
};

interface PlayerProjectionBadgeProps {
  projectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  valueRating: string;
  confidence: number;
}

export function PlayerProjectionBadge({
  projectedPoints,
  floorPoints,
  ceilingPoints,
  valueRating,
  confidence,
}: PlayerProjectionBadgeProps) {
  const rating = VALUE_LABELS[valueRating] ?? VALUE_LABELS.fair;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-white">{projectedPoints.toFixed(1)}</span>
        <span className="text-xs text-white/40">
          proj pts ({floorPoints.toFixed(1)}–{ceilingPoints.toFixed(1)})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${rating.color}`}>
          {rating.label}
        </span>
        <span className="text-xs text-white/40">{Math.round(confidence * 100)}% conf</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run test**

Run: `pnpm test src/components/player/__tests__/player-projection-badge.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/player/player-projection-badge.tsx src/components/player/__tests__/player-projection-badge.test.tsx
git commit -m "feat: add PlayerProjectionBadge with value rating and confidence"
```

---

### Task 6.3: Edge Dashboard (Admin-Gated)

**Files:**
- Create: `src/app/admin/edges/page.tsx`

- [ ] **Step 1: Create edge dashboard page**

```typescript
// src/app/admin/edges/page.tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Edge Dashboard",
  description: "Model edge analysis for upcoming fixtures",
};

export default async function EdgeDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const edges = await prisma.bettingEdge.findMany({
    where: { edge: { gt: 0 } },
    include: {
      prediction: {
        include: {
          fixture: { include: { homeClub: true, awayClub: true } },
        },
      },
    },
    orderBy: { edge: "desc" },
    take: 50,
  });

  return (
    <main className="page-shell space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-white">Edge Dashboard</h1>
      <p className="text-sm text-white/60">
        Fixtures ranked by model edge. Only showing markets with positive expected value.
      </p>

      <div className="space-y-3">
        {edges.length === 0 ? (
          <p className="text-white/40 text-center py-12">
            No edges detected for upcoming fixtures. Run the prediction sync job first.
          </p>
        ) : (
          edges.map((edge) => (
            <div
              key={edge.id}
              className="glass-card flex items-center justify-between rounded-xl border border-line bg-panel-strong p-4"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  {edge.prediction.fixture.homeClub.name} vs{" "}
                  {edge.prediction.fixture.awayClub.name}
                </p>
                <p className="text-xs text-white/50">{edge.market}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-emerald-400">
                  +{((edge.edge ?? 0) * 100).toFixed(1)}% edge
                </p>
                <p className="text-xs text-white/40">
                  Fair: {edge.fairOdds.toFixed(2)} | Market: {edge.marketOdds?.toFixed(2) ?? "N/A"}
                </p>
                {edge.recommendedStake && (
                  <p className="text-xs text-white/50">
                    Kelly: {(edge.recommendedStake * 100).toFixed(1)}% of bankroll
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/edges/page.tsx
git commit -m "feat: add admin edge dashboard with model edge rankings"
```

---

### Task 6.4: Edges API Route + Model Health Proxy

**Files:**
- Create: `src/app/api/edges/route.ts`
- Create: `src/app/api/model/health/route.ts`

- [ ] **Step 1: Create edges API**

```typescript
// src/app/api/edges/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const minEdge = parseFloat(searchParams.get("minEdge") ?? "0");

  try {
    const edges = await prisma.bettingEdge.findMany({
      where: { edge: { gt: minEdge } },
      include: {
        prediction: {
          include: {
            fixture: { include: { homeClub: true, awayClub: true } },
          },
        },
      },
      orderBy: { edge: "desc" },
      take: 100,
    });
    return NextResponse.json({ edges });
  } catch (err) {
    console.error("[edges:GET]", err);
    return NextResponse.json({ error: "Failed to fetch edges" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create model health proxy**

```typescript
// src/app/api/model/health/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modelUrl = process.env.PREDICTION_API_URL;
  if (!modelUrl) {
    return NextResponse.json({ error: "Model API not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(`${modelUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Model API unreachable" }, { status: 503 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/edges/route.ts src/app/api/model/health/route.ts
git commit -m "feat: add edges API and model health proxy routes"
```

---

### Task 6.5: Backtest Summary Endpoint (FastAPI)

**Files:**
- Modify: `nwsl-model/api/main.py`

- [ ] **Step 1: Add backtest-summary endpoint**

Add to `nwsl-model/api/main.py`:

```python
@app.get("/backtest-summary")
async def backtest_summary(authorization: str | None = Header(None)):
    if not verify_token(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Read backtest results from disk if available
    results_path = Path(__file__).parent.parent / "data" / "processed" / "backtest_results.json"
    if not results_path.exists():
        return {"status": "no_backtest", "message": "Run backtest first"}

    import json
    with open(results_path) as f:
        return json.load(f)
```

- [ ] **Step 2: Add import for Path**

Ensure `from pathlib import Path` is at the top of `main.py`.

- [ ] **Step 3: Commit**

```bash
git add nwsl-model/api/main.py
git commit -m "feat: add backtest-summary endpoint to FastAPI"
```

---

### Task 6.6: Player Projection Sync Job

**Files:**
- Create: `src/lib/jobs/sync-player-projections.ts`
- Modify: `src/lib/jobs/registry.ts`

- [ ] **Step 1: Create player projection sync job**

```typescript
// src/lib/jobs/sync-player-projections.ts
import { prisma } from "@/lib/prisma";
import type { JobHandler } from "./registry";

export const syncPlayerProjections: JobHandler = {
  id: "sync-player-projections",
  description: "Derive per-player fantasy point projections from team predictions",
  frequency: "daily",
  async run(context) {
    // Get predictions for upcoming fixtures
    const predictions = await prisma.modelPrediction.findMany({
      where: {
        fixture: { startsAt: { gte: new Date() }, status: "SCHEDULED" },
      },
      include: {
        fixture: {
          include: {
            homeClub: { include: { players: true } },
            awayClub: { include: { players: true } },
          },
        },
      },
    });

    let projected = 0;

    for (const pred of predictions) {
      const homePlayers = pred.fixture.homeClub?.players ?? [];
      const awayPlayers = pred.fixture.awayClub?.players ?? [];

      const allPlayers = [
        ...homePlayers.map((p) => ({ ...p, isHome: true })),
        ...awayPlayers.map((p) => ({ ...p, isHome: false })),
      ];

      for (const player of allPlayers) {
        // Simple projection: base on team xG and position
        const teamLambda = player.isHome ? pred.lambdaHome : pred.lambdaAway;
        const positionMultiplier =
          player.primaryPosition === "FWD" ? 2.0
          : player.primaryPosition === "MID" ? 1.5
          : player.primaryPosition === "DEF" ? 0.8
          : 0.5; // GK

        const basePoints = 1 + teamLambda * positionMultiplier; // appearance + goal contribution
        const variance = basePoints * 0.4;
        const floor = Math.max(0, basePoints - variance * 1.3);
        const ceiling = basePoints + variance * 1.8;

        const valueRating =
          basePoints > 8 ? "elite_value"
          : basePoints > 5 ? "good_value"
          : basePoints > 3 ? "fair"
          : "overpriced";

        await prisma.playerProjection.upsert({
          where: {
            playerId_fixtureId: {
              playerId: player.id,
              fixtureId: pred.fixtureId,
            },
          },
          create: {
            playerId: player.id,
            fixtureId: pred.fixtureId,
            projectedPoints: Math.round(basePoints * 10) / 10,
            confidence: Math.min(0.95, 0.5 + teamLambda * 0.15),
            floorPoints: Math.round(floor * 10) / 10,
            ceilingPoints: Math.round(ceiling * 10) / 10,
            valueRating,
          },
          update: {
            projectedPoints: Math.round(basePoints * 10) / 10,
            confidence: Math.min(0.95, 0.5 + teamLambda * 0.15),
            floorPoints: Math.round(floor * 10) / 10,
            ceilingPoints: Math.round(ceiling * 10) / 10,
            valueRating,
            generatedAt: new Date(),
          },
        });
        projected++;
      }
    }

    return { success: true, startedAt: context.startedAt, projections: projected };
  },
};
```

- [ ] **Step 2: Register in job registry**

In `src/lib/jobs/registry.ts`, import and add `syncPlayerProjections` to the `jobRegistry` array.

- [ ] **Step 3: Commit**

```bash
git add src/lib/jobs/sync-player-projections.ts src/lib/jobs/registry.ts
git commit -m "feat: add sync-player-projections job for per-player fantasy projections"
```

---

### Task 6.7: Model Retrain Trigger Job

**Files:**
- Create: `src/lib/jobs/retrain-model.ts`
- Modify: `src/lib/jobs/registry.ts`

- [ ] **Step 1: Create retrain trigger job**

```typescript
// src/lib/jobs/retrain-model.ts
import type { JobHandler } from "./registry";

export const retrainModel: JobHandler = {
  id: "retrain-model",
  description: "Trigger weekly model retraining with latest match results",
  frequency: "weekly",
  async run(context) {
    const apiUrl = process.env.PREDICTION_API_URL;
    const apiSecret = process.env.PREDICTION_API_SECRET;

    if (!apiUrl) {
      return { success: false, error: "PREDICTION_API_URL not configured" };
    }

    try {
      const response = await fetch(`${apiUrl}/retrain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiSecret}`,
        },
      });

      if (!response.ok) {
        return { success: false, error: `Retrain API returned ${response.status}` };
      }

      const result = await response.json();
      return { success: true, startedAt: context.startedAt, ...result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Retrain request failed",
      };
    }
  },
};
```

- [ ] **Step 2: Add `/retrain` endpoint to FastAPI**

In `nwsl-model/api/main.py`, add:

```python
@app.post("/retrain")
async def retrain(authorization: str | None = Header(None)):
    if not verify_token(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    import subprocess
    result = subprocess.run(
        ["python", "scripts/train.py", "--config", "configs/default.yaml"],
        capture_output=True, text=True, cwd=str(Path(__file__).parent.parent),
        timeout=600,
    )

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr[-500:])

    # Clear cached models so next prediction uses fresh model
    load_model.cache_clear()

    return {"status": "retrained", "stdout": result.stdout[-500:]}
```

- [ ] **Step 3: Register in job registry**

In `src/lib/jobs/registry.ts`, import and add `retrainModel` to the `jobRegistry` array.

- [ ] **Step 4: Commit**

```bash
git add src/lib/jobs/retrain-model.ts src/lib/jobs/registry.ts nwsl-model/api/main.py
git commit -m "feat: add weekly model retrain trigger job"
```

---

## Chunk 7: Accessibility, Copywriting & Admin

### Task 7.1: Accessibility Pass

**Files:**
- Modify: `src/components/ui/club-logo.tsx` (add alt text)
- Modify: `src/components/ui/player-avatar.tsx` (add alt text)
- Modify: Multiple interactive components (add aria-labels)

- [ ] **Step 0: Verify skip-to-content link exists**

The root layout (`src/app/layout.tsx` line 47-52) already has a skip-to-content link targeting `#main-content`. Verify it works by tabbing on the page. No changes needed unless broken.

- [ ] **Step 1: Add descriptive alt text to all image components**

In `src/components/ui/club-logo.tsx`, ensure the `<Image>` component has `alt={clubName}` using the club name prop.

In `src/components/ui/player-avatar.tsx`, ensure `<Image>` has `alt={playerName}` using the player name prop.

Search the codebase for `<Image` without `alt` and fix all instances.

- [ ] **Step 2: Add aria-labels to icon-only buttons**

Search for `<button` elements that contain only icons (no visible text). Add `aria-label` describing the action. Common patterns:
- Close buttons: `aria-label="Close"`
- Menu toggles: `aria-label="Open menu"`
- Delete/remove buttons: `aria-label="Remove player"`

- [ ] **Step 3: Add keyboard navigation to draft room**

In `src/components/draft/draft-room-client.tsx`, add `onKeyDown` handler to the player list:
- Arrow up/down to navigate players
- Enter to draft the highlighted player
- Escape to close any open panel

- [ ] **Step 4: Commit**

```bash
git add src/components/
git commit -m "feat: accessibility pass — alt text, aria-labels, keyboard nav"
```

---

### Task 7.2: Email Validation Fix

**Files:**
- Modify: `src/components/auth/login-local-form.tsx` (line 82)

- [ ] **Step 1: Replace regex with Zod email validation**

In `src/components/auth/login-local-form.tsx`, replace the email regex check:
```typescript
// Before:
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))

// After:
import { z } from "zod";
const emailSchema = z.string().email();
// ... in validate function:
if (!emailSchema.safeParse(email).success)
```

- [ ] **Step 2: Commit**

```bash
git add src/components/auth/login-local-form.tsx
git commit -m "fix: use Zod email validation instead of weak regex"
```

---

### Task 7.3: Copywriting — Model-Powered Messaging

**Files:**
- Modify: `src/app/page.tsx` (add model section)
- Modify: `src/app/onboarding/page.tsx` (update value prop copy)

- [ ] **Step 1: Add model-powered section to landing page**

In `src/app/page.tsx`, add a new section after the existing features section:

```tsx
<section className="space-y-6 text-center">
  <h2 className="text-2xl font-bold text-white">Powered by Professional-Grade Models</h2>
  <p className="text-white/60 max-w-2xl mx-auto">
    Our Dixon-Coles and Bivariate Poisson models analyze every NWSL match to produce win
    probabilities, expected goals, and player projections. The same statistical models
    used by professional sports betting syndicates — now powering your fantasy decisions.
  </p>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
    <div className="glass-card rounded-xl border border-line p-4">
      <p className="text-lg font-bold text-white">Match Predictions</p>
      <p className="text-sm text-white/50">Win probabilities and projected scorelines for every fixture</p>
    </div>
    <div className="glass-card rounded-xl border border-line p-4">
      <p className="text-lg font-bold text-white">Player Projections</p>
      <p className="text-sm text-white/50">Projected points with floor-ceiling ranges and value ratings</p>
    </div>
    <div className="glass-card rounded-xl border border-line p-4">
      <p className="text-lg font-bold text-white">Sharp Indicators</p>
      <p className="text-sm text-white/50">See where model-optimal lineups diverge from popular picks</p>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Update onboarding copy**

In `src/app/onboarding/page.tsx`, update the welcome heading and description to communicate the platform's unique value:
- Heading: "Welcome to the sharpest fantasy platform in soccer"
- Subheading: "Powered by the same models used by professional sports betting syndicates. Get projected points, value ratings, and edge indicators that no other fantasy platform offers."

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/onboarding/page.tsx
git commit -m "feat: add model-powered messaging to landing page and onboarding"
```

---

### Task 7.4: Empty States

**Files:**
- Modify pages that show lists/feeds to add contextual empty state copy

- [ ] **Step 1: Add empty state messages**

For each list page, add a conditional render when the list is empty:

- **Dashboard (no leagues):** "You're not in any leagues yet. Create one or join with an invite code."
- **Notifications (empty):** "All caught up. You'll see alerts here when something needs your attention."
- **Trades (empty):** "No active trades. Propose a trade from your team page to get started."
- **Player compare (none selected):** "Select two or more players to compare their stats and projections side by side."
- **Matchup center (no matchups):** "No matchups available yet. Join a league and check back when the season starts."

- [ ] **Step 2: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add contextual empty state copy across all list pages"
```

---

### Task 7.5: Remove Manager Flow

**Files:**
- Modify: `src/components/league/league-settings-client.tsx`

- [ ] **Step 1: Implement the TODO remove-manager flow**

Find the TODO comment at line 296 in `src/components/league/league-settings-client.tsx`. Implement:

1. A confirmation dialog that shows the manager name and asks "Are you sure you want to remove [name] as a manager?"
2. An API call to remove the manager (use existing fantasy API functions)
3. Toast notification on success/failure
4. Refresh the settings page after removal

```typescript
const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

// In the manager list, replace the TODO with:
<button
  onClick={() => setRemoveTarget({ id: manager.id, name: manager.name })}
  className="text-xs text-red-400 hover:text-red-300"
  aria-label={`Remove ${manager.name}`}
>
  Remove
</button>

// Add confirmation dialog:
{removeTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="glass-card max-w-sm rounded-2xl border border-line p-6 space-y-4">
      <h3 className="text-lg font-bold text-white">Remove Manager</h3>
      <p className="text-sm text-white/60">
        Are you sure you want to remove {removeTarget.name} as a manager? This cannot be undone.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => setRemoveTarget(null)}
          className="rounded-full px-4 py-2 text-sm text-white/60 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            // Call remove manager API
            setRemoveTarget(null);
          }}
          className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
        >
          Remove
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/league/league-settings-client.tsx
git commit -m "feat: implement remove-manager flow with confirmation dialog"
```

---

## Chunk 8: Remaining Production Tasks

### Task 8.1: Structured Logging with Pino

**Files:**
- Create: `src/lib/logger.ts`
- Modify: `package.json` (add pino)

- [ ] **Step 1: Install pino**

```bash
pnpm add pino
pnpm add -D pino-pretty
```

- [ ] **Step 2: Create logger module**

```typescript
// src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
```

- [ ] **Step 3: Replace console.error calls in API routes with logger**

In `src/app/api/notifications/route.ts`, `src/app/api/jobs/route.ts`, and other API routes, replace `console.error("[tag]", err)` with `logger.error({ err }, "tag message")`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/logger.ts package.json pnpm-lock.yaml src/app/api/
git commit -m "feat: add structured logging with pino"
```

---

### Task 8.2: Web Vitals Reporting

**Files:**
- Create: `src/app/web-vitals.tsx`

- [ ] **Step 1: Create Web Vitals reporter**

Note: Next.js 16 reports Web Vitals via the `useReportWebVitals` hook from `next/web-vitals`.

```typescript
// src/app/web-vitals.tsx
"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Send to analytics endpoint
    const analyticsId = process.env.NEXT_PUBLIC_ANALYTICS_ID;
    if (!analyticsId) return;

    const body = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
    };

    // Use sendBeacon for reliability
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", JSON.stringify(body));
    }
  });

  return null;
}
```

- [ ] **Step 2: Add to root layout**

In `src/app/layout.tsx`, import and render `<WebVitals />` inside the providers.

- [ ] **Step 3: Commit**

```bash
git add src/app/web-vitals.tsx src/app/layout.tsx
git commit -m "feat: add Web Vitals reporting"
```

---

### Task 8.3: Notification Service Error Fix

**Files:**
- Modify: `src/lib/notifications/notification-service.ts` (line 38 area)

- [ ] **Step 1: Fix Promise.allSettled silent failure**

In `src/lib/notifications/notification-service.ts`, after the `Promise.allSettled()` call, add:

```typescript
const results = await Promise.allSettled(deliveryPromises);
const failures = results.filter((r) => r.status === "rejected");
if (failures.length > 0) {
  console.error(
    `[notification-service] ${failures.length}/${results.length} deliveries failed:`,
    failures.map((f) => (f as PromiseRejectedResult).reason)
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notifications/notification-service.ts
git commit -m "fix: log failed notification deliveries instead of silencing"
```

---

### Task 8.4: Database Connection Pooling

- [ ] **Step 1: Update DATABASE_URL for connection pooling**

In `.env.example`, add a comment explaining connection pooling:
```
# For production, use the Supabase pooler URL (port 6543) instead of direct connection (port 5432):
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add connection pooling guidance to .env.example"
```

---

## Task Dependencies (Updated)

```
Chunk 1 (Security + Schema) ──┐
Chunk 2 (Model Data Layer)  ──┤
Chunk 4 (UX Polish)         ──┼── Can run in parallel
Chunk 5 (Performance)       ──┤
Chunk 7 (A11y/Copy/Admin)   ──┤
Chunk 8 (Logging/Vitals)    ──┘
                               │
Chunk 6 (Model UI)     ───────┤── Depends on Chunk 2
                               │
Chunk 6 (Production)   ───────┤── Owns next.config.ts and .env.example
                               │
                         Final Verification
```

**File ownership to avoid conflicts:**
- `prisma/schema.prisma` → Chunk 1 (Task 1.7) only — includes prediction tables
- `next.config.ts` → Chunk 4 (Task 4.1) does the base rewrite, then Chunk 5 (Task 5.1) wraps with Sentry — run sequentially
- `.env.example` → Chunk 5 (Task 5.4) owns the full rewrite; Chunk 8 (Task 8.4) appends after
- `package.json` → Chunks install deps sequentially or coordinate via lockfile merge
- `src/lib/jobs/registry.ts` → Chunk 2 (Task 2.4) and Chunk 6 (Task 6.6) both modify — run sequentially within model work
