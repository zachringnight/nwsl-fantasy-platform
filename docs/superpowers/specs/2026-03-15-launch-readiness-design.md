# NWSL Fantasy Platform — Launch Readiness Design Spec

**Date**: 2026-03-15
**Status**: Reviewed
**Stakeholders**: Gambling syndicate (Bloom, Benham, Van Haaren, Muller, Gandarillas, Guardiola, Ancelotti, James, Shaw, Gregory, Graham, Gladwell, Lewis) + two PE firms
**Goal**: Audit and fix all issues, integrate betting model, and prepare the platform for launch as the crown jewel of a sports gambling media empire.

---

## Table of Contents

- [Context & Current State](#context--current-state)
- [Structural Integrity & Bug Fixes](#structural-integrity--bug-fixes)
- [Model Integration](#model-integration)
- [UX Polish & Copywriting](#ux-polish--copywriting)
- [Performance & Optimization](#performance--optimization)
- [Production Readiness & Monitoring](#production-readiness--monitoring)
- [Architecture Overview](#architecture-overview)
- [Success Criteria](#success-criteria)

---

## 1. Context & Current State

### Tech Stack
- **Frontend**: Next.js 16 (App Router), TypeScript 5, Tailwind CSS 4
- **Database**: PostgreSQL via Prisma 7 + Supabase
- **Auth**: Auth.js (NextAuth) 4.24 + Supabase Auth + Google OAuth
- **Model**: Python (Dixon-Coles, Bivariate Poisson) — standalone, zero integration
- **Deployment**: Partially deployed, infrastructure not fully wired

### What Exists
- ~35 pages covering auth, leagues, drafts, matchups, lineups, players, trades, waivers, notifications, achievements, admin
- 56+ React components across auth, dashboard, draft, league, lineup, matchup, player, UI
- 1,080-line Prisma schema with 30+ tables
- 2,329-line fantasy API module
- 7 background jobs (sync fixtures, sync stats, process waivers, generate matchups, etc.)
- Python betting model with Dixon-Coles and Bivariate Poisson implementations, market derivation, backtesting
- Comprehensive planning docs in `/docs/planning/`

### What's Wrong
The app is feature-complete but not launch-ready. Critical gaps exist in security, model integration, UX polish, performance, and production infrastructure.

---

## 2. Section 1: Structural Integrity & Bug Fixes

### 2.1 Authentication & Authorization

#### 2.1.1 Unauthenticated API Routes
**Files affected:**
- `src/app/api/notifications/route.ts` — GET (lines 8-25) and PATCH (lines 27-51) accept any `userId` parameter without session verification
- `src/app/api/jobs/route.ts` — GET (line 4) returns job registry with no auth

**Fix:** Add `getServerSession()` check to all API routes. Verify the authenticated user's ID matches the requested `userId`. Return 401 for unauthenticated, 403 for unauthorized.

#### 2.1.2 Missing Middleware
**File:** No `middleware.ts` exists at project root.

**Fix:** Create `src/middleware.ts` with:
- Route protection: redirect unauthenticated users from `/dashboard`, `/leagues/*`, `/players/*`, `/settings`, `/admin`, `/notifications`, `/matchup-center` to `/login`
- Security headers on all responses:
  - `Content-Security-Policy` (restrict script sources)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Referrer-Policy: strict-origin-when-cross-origin`

#### 2.1.3 No Rate Limiting
**Scope:** All endpoints — login, signup, password reset, jobs API, notifications.

**Fix:** Integrate Upstash Ratelimit (`@upstash/ratelimit` + `@upstash/redis`):
- Auth endpoints: 5 requests/minute per IP
- API routes: 30 requests/minute per user
- Jobs API: 10 requests/minute per token

#### 2.1.4 No CSRF Protection
**Scope:** All POST/PATCH/PUT/DELETE routes.

**Fix:** NextAuth handles CSRF for auth routes. For custom API routes, validate `Origin` header against allowed origins in middleware.

#### 2.1.5 Timing-Vulnerable Token Check
**File:** `src/app/api/jobs/route.ts` line 25 — plain string comparison for Bearer token.

**Fix:** Use `crypto.timingSafeEqual()` for token comparison.

#### 2.1.6 Weak Password Policy
**File:** `src/app/reset-password/page.tsx` line 40 — minimum 6 characters.

**Fix:** Increase to minimum 8 characters across all password forms (signup, reset-password).

### 2.2 Error Handling

#### 2.2.1 Silent Catch Blocks
**Files:**
- `src/app/notifications/page.tsx` lines 86-87 — catch block suppresses errors entirely
- `src/app/notifications/page.tsx` lines 113-120 — catch block performs optimistic update revert but fails silently without notifying the user
- `src/lib/notifications/notification-service.ts` line 38 — `Promise.allSettled()` failures swallowed

**Fix:** Replace silent catches with structured error logging and user-facing error toasts. Failed notification deliveries should be tracked and retryable.

#### 2.2.2 Unprotected Database Queries
**File:** `src/lib/jobs/fantasy-scoring.ts` lines 9-20 — no try/catch around DB queries in `run()`.

**Fix:** Wrap all job handlers in try/catch with error logging and job status tracking.

#### 2.2.3 Missing Error Boundaries
**Current:** Only 3 `error.tsx` files across ~35 routes.

**Fix:** Add `error.tsx` at:
- `src/app/global-error.tsx` (root-level catch-all)
- `src/app/players/error.tsx`
- `src/app/matchup-center/error.tsx`
- `src/app/notifications/error.tsx`
- `src/app/settings/error.tsx`
- `src/app/admin/error.tsx`
- `src/app/onboarding/error.tsx`

All error boundaries should show a branded error UI with retry button and link to support.

### 2.3 Database Schema Fixes

#### 2.3.1 Cascade Delete Strategy
**File:** `prisma/schema.prisma`

Fix `onDelete: SetNull` to `onDelete: Cascade` where orphaned rows are undesirable:
- `Notification.league` (line 928)
- `Notification.fantasyTeam` (line 929)
- `ScoringOverride.snapshot` (line 948)
- `Achievement.league` (line 983)

**Keep `SetNull`** (correct as-is):
- `AuditLog.league` (line 962) — audit logs should be retained for compliance/forensics even after league deletion. `SetNull` preserves the audit trail with a null reference, which is the correct behavior.

#### 2.3.2 Missing Indexes
**File:** `prisma/schema.prisma`

Add indexes for query performance:
- `Player.currentClubId` (line 318)
- `Player.status` (line 325)
- `Fixture.homeClubId` (line 615)
- `Fixture.awayClubId` (line 616)
- `FantasyPointSnapshot.statLineId` (line 695)

### 2.4 Input Validation

#### 2.4.1 API Request Body Validation
**Files:**
- `src/app/api/jobs/route.ts` line 29 — type cast without validation
- `src/app/api/notifications/route.ts` line 31 — type cast without validation

**Fix:** Add Zod schemas for all API request bodies (Zod 4.1.0 is already a project dependency). Validate before processing. Return 400 with structured error for invalid input.

#### 2.4.2 Email Validation
**File:** `src/components/auth/login-local-form.tsx` line 82 — weak regex.

**Fix:** Use Zod's `z.string().email()` for email validation across all forms.

---

## 3. Section 2: Model Integration

### 3.1 Current State

The Python betting model (`nwsl-model/`) and the Next.js platform are **100% isolated**. Zero integration points:
- No API server for the model
- No database tables for predictions
- No data pipeline between systems
- No shared types
- No scheduled sync

### 3.2 Architecture

```
+---------------------+     +----------------------+
|   Python Model API  |     |   Next.js Website    |
|   (FastAPI)         |<----|                      |
|                     |     |  /api/predictions     |
|  /predict           |     |  /api/edges           |
|  /batch-predict     |     |  /api/player-proj     |
|  /backtest-summary  |     |                      |
|  /model-health      |     |                      |
+---------+-----------+     +----------+-----------+
          |                            |
          |     +---------------+      |
          +---->|  Supabase DB  |<-----+
                |               |
                | ModelPrediction     |
                | FairOdds            |
                | BettingEdge         |
                | PlayerProjection    |
                +---------------+
```

### 3.3 FastAPI Model Server

**New directory:** `nwsl-model/api/`

**Endpoints:**
- `POST /predict` — Single fixture prediction. Accepts `home_team`, `away_team`, optional context (weather, rest days). Returns full score matrix, 1X2 probabilities, derived markets.
- `POST /batch-predict` — All upcoming fixtures for a matchweek. Writes results to DB.
- `GET /backtest-summary` — Model performance metrics: log loss, Brier score, calibration error, ROI, hit rate.
- `GET /model-health` — Status, last trained date, model version, calibration stats.

**Auth:** Bearer token (shared secret with Next.js backend, validated via `PREDICTION_API_SECRET` env var).

**Deployment:** Dockerized, deployed alongside the Next.js app. Communicates via internal network or Supabase DB.

### 3.4 New Database Tables

```prisma
model ModelPrediction {
  id           String   @id @default(cuid())
  fixtureId    String
  modelName    String   // "dixon_coles" | "bivariate_poisson"
  homeWinProb  Float
  drawProb     Float
  awayWinProb  Float
  lambdaHome   Float
  lambdaAway   Float
  scoreMatrix  Json
  metadata     Json?    // rho, home advantage, etc.
  generatedAt  DateTime @default(now())
  fixture      Fixture  @relation(fields: [fixtureId], references: [id], onDelete: Cascade)
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
  market           String          // "1x2_home", "total_2.5_over", "btts_yes", etc.
  fairOdds         Float
  marketOdds       Float?
  edge             Float?          // fairOdds - marketOdds implied prob
  recommendedStake Float?
  prediction       ModelPrediction @relation(fields: [predictionId], references: [id], onDelete: Cascade)

  @@index([predictionId])
}

model PlayerProjection {
  id              String   @id @default(cuid())
  playerId        String
  fixtureId       String
  projectedPoints Float
  confidence      Float    // 0-1
  floorPoints     Float    // 10th percentile
  ceilingPoints   Float    // 90th percentile
  valueRating     String   // "elite_value" | "good_value" | "fair" | "overpriced"
  generatedAt     DateTime @default(now())
  player          Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  fixture         Fixture  @relation(fields: [fixtureId], references: [id], onDelete: Cascade)

  @@unique([playerId, fixtureId])
  @@index([playerId])
  @@index([fixtureId])
}
```

### 3.5 Next.js API Routes for Predictions

**New routes:**
- `GET /api/predictions?fixtureId=X` — Returns model prediction for a fixture
- `GET /api/predictions/upcoming` — All predictions for next matchweek
- `GET /api/player-projections?playerId=X` or `?fixtureId=X` — Player-level projections
- `GET /api/edges?minEdge=0.02` — Fixtures with betting edge above threshold
- `GET /api/model/health` — Proxies to FastAPI health endpoint

All routes require authentication. Edge dashboard additionally gated by admin/premium role.

### 3.6 Sync Pipeline

Using the existing `/api/jobs` infrastructure:

1. **Daily prediction job** (`sync-predictions`): Calls FastAPI `/batch-predict` for all fixtures in the next 7 days. Writes `ModelPrediction`, `FairOdds`, `BettingEdge` rows.
2. **Daily player projection job** (`sync-player-projections`): Derives per-player projected fantasy points from team-level predictions + player historical stats + position scoring rules. Writes `PlayerProjection` rows.
3. **Model retrain trigger** (`retrain-model`): Weekly job that triggers model retraining with latest results. Updates model pickle and version.

### 3.7 User-Facing Features

#### 3.7.1 Match Insight Cards
On every fixture page and the matchup center:
- Win probability bar (Home / Draw / Away)
- Projected scoreline (most likely result from score matrix)
- Model confidence indicator
- Top 5 most likely scorelines with probabilities

#### 3.7.2 Enhanced Player Cards
On player board and player detail pages:
- Projected fantasy points (with floor/ceiling range)
- Value rating badge: "Elite Value", "Good Value", "Fair", "Overpriced"
- Trending indicator based on model projection vs recent performance

#### 3.7.3 Sharp vs Public Indicator
On lineup and draft pages:
- When the model-optimal lineup diverges significantly from popular picks, show a "Sharp Pick" badge
- Show percentage of users who have a player rostered vs model's value rating

#### 3.7.4 Edge Dashboard (Admin/Premium)
Gated section showing:
- Upcoming fixtures ranked by model edge
- Market-by-market edge breakdown (1X2, totals, BTTS)
- Recommended stake sizing (Kelly criterion)
- Historical ROI and calibration curves
- Model health metrics

#### 3.7.5 Model Health Page
Accessible to admins:
- Backtest performance: log loss, Brier score, CRPS
- Calibration plot
- ROI curve
- Last trained date, model version
- Prediction count and coverage

---

## 4. Section 3: UX Polish & Copywriting

### 4.1 Metadata — All 40 Pages

Every `page.tsx` gets `export const metadata` (static pages) or `export async function generateMetadata()` (dynamic pages).

**Static pages:**
| Page | Title | Description |
|------|-------|-------------|
| `/` | "NWSL Fantasy — Model-Powered Fantasy Soccer" | "The first fantasy soccer platform powered by professional-grade betting models. Built for the sharpest minds in sports." |
| `/login` | "Sign In — NWSL Fantasy" | "Sign in to your NWSL Fantasy account." |
| `/signup` | "Create Account — NWSL Fantasy" | "Join NWSL Fantasy. Model-powered projections. Real edge." |
| `/dashboard` | "Dashboard — NWSL Fantasy" | "Your leagues, upcoming slates, and model-powered insights." |
| `/help` | "Help Center — NWSL Fantasy" | "Get answers to common questions about NWSL Fantasy." |
| `/rules` | "Scoring Rules — NWSL Fantasy" | "How fantasy points are calculated for every position." |
| `/terms` | "Terms of Service — NWSL Fantasy" | "Terms governing use of the NWSL Fantasy platform." |
| `/privacy` | "Privacy Policy — NWSL Fantasy" | "How we collect, use, and protect your data." |
| `/contact` | "Contact Us — NWSL Fantasy" | "Get in touch with the NWSL Fantasy team." |
| `/players` | "Player Board — NWSL Fantasy" | "Browse, filter, and analyze every NWSL player with model projections." |
| `/players/compare` | "Compare Players — NWSL Fantasy" | "Side-by-side player comparison with projected points and value ratings." |
| `/matchup-center` | "Matchup Center — NWSL Fantasy" | "Cross-league matchup analysis with model-powered insights." |
| `/settings` | "Settings — NWSL Fantasy" | "Manage your account and notification preferences." |
| `/admin` | "Admin Console — NWSL Fantasy" | "Platform administration and model monitoring." |
| `/onboarding` | "Welcome — NWSL Fantasy" | "Set up your profile and get started." |
| `/notifications` | "Notifications — NWSL Fantasy" | "Your activity feed and alerts." |
| `/leagues/create` | "Create League — NWSL Fantasy" | "Start a new fantasy league." |
| `/leagues/join` | "Join League — NWSL Fantasy" | "Join a league with an invite code." |
| `/forgot-password` | "Forgot Password — NWSL Fantasy" | "Reset your NWSL Fantasy password." |
| `/reset-password` | "Reset Password — NWSL Fantasy" | "Choose a new password for your account." |

**Dynamic pages** (use `generateMetadata`):
- `/players/[playerId]` — "Player Name — NWSL Fantasy"
- `/leagues/[leagueId]` — "League Name — NWSL Fantasy"
- `/leagues/[leagueId]/draft/room` — "Draft Room — League Name"
- `/leagues/[leagueId]/matchup` — "Matchup — League Name"
- `/leagues/[leagueId]/standings` — "Standings — League Name"
- etc.

### 4.2 Loading States

**Already exist** (review and upgrade to proper skeleton UIs if currently using generic spinners):
- `src/app/dashboard/loading.tsx`
- `src/app/players/loading.tsx`
- `src/app/matchup-center/loading.tsx`
- `src/app/notifications/loading.tsx`
- `src/app/settings/loading.tsx`
- `src/app/leagues/loading.tsx`

**Need to be created** with skeleton UI:
- `src/app/players/[playerId]/loading.tsx`
- `src/app/admin/loading.tsx`
- `src/app/onboarding/loading.tsx`
- `src/app/leagues/[leagueId]/loading.tsx` (covers sub-routes)
- `src/app/leagues/[leagueId]/draft/room/loading.tsx`

Skeletons should match the layout of the loaded page — not generic spinners. Use Tailwind's `animate-pulse` on placeholder blocks.

### 4.3 Error States

Add `error.tsx` at route group levels:
- `src/app/global-error.tsx`
- `src/app/players/error.tsx`
- `src/app/matchup-center/error.tsx`
- `src/app/notifications/error.tsx`
- `src/app/settings/error.tsx`
- `src/app/admin/error.tsx`
- `src/app/onboarding/error.tsx`

Each shows: branded error UI, error message, retry button, link to contact support.

### 4.4 SEO Infrastructure

- `src/app/robots.ts` — Allow all crawlers, disallow `/api/`, `/admin/`, link to sitemap
- `src/app/sitemap.ts` — Generate sitemap from all static routes + dynamic player/league pages
- Per-page OG metadata using the existing `opengraph-image.tsx` pattern

### 4.5 Accessibility

- Add `skip-to-content` link in root layout
- Add `aria-label` to all interactive elements (buttons, links, inputs) that lack visible text
- Add `alt` text to all `<Image>` components (player avatars, club logos)
- Add keyboard navigation to draft room (arrow keys for player list, Enter to draft)
- Add focus management in modals/dialogs (trap focus, return on close)
- Add `role` attributes to custom interactive components

### 4.6 Copywriting

#### Landing Page
Current copy is solid. Enhance with model-powered messaging:
- Add a section: "Powered by Professional-Grade Models" — explain that the platform uses the same Dixon-Coles and Bivariate Poisson models used by professional betting syndicates
- Add social proof section referencing the caliber of the team behind the platform

#### Onboarding
Rewrite to communicate unique value:
- Step 1: "Welcome to the sharpest fantasy platform in soccer"
- Emphasize model-powered projections, edge indicators, value ratings
- Set expectation that this isn't another generic fantasy app

#### Empty States
Add contextual copy and CTAs for:
- No leagues: "You're not in any leagues yet. Create one or join with an invite code."
- No notifications: "All caught up. You'll see alerts here when something needs your attention."
- No trades: "No active trades. Propose a trade from your team page."
- Empty player comparison: "Select two or more players to compare their stats and projections side by side."

#### Model-Powered Copy
New copy patterns for model integration features:
- Player cards: "Projected 8.2 pts (floor 4.1 — ceiling 14.6)"
- Value badges: "Elite Value — model projects 30% more points than salary implies"
- Match insight: "Model gives Angel City a 58% win probability (1.8 xG vs 1.2 xG)"
- Sharp indicator: "Sharp Pick — only 12% rostered but model rates as top-5 value"

### 4.7 Incomplete Features

#### Admin Console
Currently a stub. Needs implementation of:
- User management (list, search, ban/unban)
- Scoring override management (the `ScoringOverride` model exists)
- Data pipeline status (last sync times, error counts)
- Model health dashboard (proxied from FastAPI)
- Manual job triggers (extend existing jobs UI)

#### Remove Manager Flow
**File:** `src/components/league/league-settings-client.tsx`

Implement the TODO:
- Confirmation dialog with manager name
- Authorization check (only league commissioner)
- API call to remove manager
- Toast notification on success/failure

---

## 5. Section 4: Performance & Optimization

### 5.1 Component Splitting

Split oversized components:
- `salary-cap-entry-builder.tsx` (1,149 lines) → Extract `SalaryCapSlotList`, `SalaryCapPlayerPicker`, `SalaryCapBudgetBar`, `SalaryCapAutofill`
- `draft-room-client.tsx` (812 lines) → Extract `DraftBoard`, `DraftQueue`, `DraftPlayerList`, `DraftTimer`, `DraftChat`
- `transactions-client.tsx` (596 lines) → Extract `TransactionList`, `TransactionFilter`, `WaiverClaimCard`
- `league-trades-client.tsx` (501 lines) → Extract `TradeProposal`, `TradeReview`, `TradeHistory`
- `league-home-feed.tsx` (446 lines) → Extract `FeedItem`, `FeedFilter`, `FeedEmptyState`

### 5.2 Memoization

Add `React.memo` to:
- Player card components (rendered in lists of 200+)
- Draft pick cards
- Lineup slot components
- Matchup score displays
- Transaction list items

Add `useMemo` for:
- Filtered/sorted player lists
- Computed standings
- Derived lineup validity checks
- Score calculations

### 5.3 Code Splitting

Add `dynamic()` imports for heavy routes:
```typescript
const DraftRoomClient = dynamic(() => import('./draft-room-client'), {
  loading: () => <DraftRoomSkeleton />,
  ssr: false
})

const SalaryCapEntryBuilder = dynamic(() => import('./salary-cap-entry-builder'), {
  loading: () => <EntryBuilderSkeleton />
})

const AdminConsole = dynamic(() => import('./admin-client'), {
  loading: () => <AdminSkeleton />
})
```

### 5.4 Suspense Boundaries

Wrap async data sections on key pages:
- Dashboard: independently stream league list, upcoming slates, recent activity, notifications
- Player board: stream player list separately from filters/header
- Matchup page: stream scores separately from lineup details

### 5.5 Image Optimization

**`next.config.ts`:**
```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'media.api-sports.io' }
  ],
  deviceSizes: [640, 750, 828, 1080, 1200],
  imageSizes: [16, 32, 48, 64, 96, 128, 256],
  formats: ['image/avif', 'image/webp'],
}
```

**`club-logo.tsx`:** Remove `unoptimized` escape hatch. Configure all external image domains in `next.config.ts` so Next.js can optimize them.

**Player avatars:** Add `placeholder="blur"` with low-res base64 `blurDataURL`.

### 5.6 Fantasy API Split

Split `src/lib/fantasy-api.ts` (2,329 lines) into domain modules:
- `src/lib/fantasy-api/leagues.ts`
- `src/lib/fantasy-api/drafts.ts`
- `src/lib/fantasy-api/matchups.ts`
- `src/lib/fantasy-api/lineups.ts`
- `src/lib/fantasy-api/trades.ts`
- `src/lib/fantasy-api/waivers.ts`
- `src/lib/fantasy-api/scoring.ts`
- `src/lib/fantasy-api/notifications.ts`
- `src/lib/fantasy-api/index.ts` (barrel re-export for backwards compatibility)

### 5.7 Database Performance

- Add indexes per Section 2.3.2
- Configure Supabase connection pooling: use `?pgbouncer=true` connection string variant
- Replace 10 `.forEach()` loops in fantasy-api.ts with `.map()` where transforming data

### 5.8 PWA Manifest

Add `src/app/manifest.ts`:
```typescript
export default function manifest() {
  return {
    name: 'NWSL Fantasy',
    short_name: 'NWSL Fantasy',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

---

## 6. Section 5: Production Readiness & Monitoring

### 6.1 Environment Variable Validation

Create `src/lib/env.ts` using Zod:
```typescript
import { z } from 'zod'

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  JOBS_API_SECRET: z.string().min(16),

  // Model integration
  PREDICTION_API_URL: z.string().url().optional(),
  PREDICTION_API_SECRET: z.string().min(16).optional(),

  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_ANALYTICS_ID: z.string().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // OAuth
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
})

export const env = envSchema.parse(process.env)
```

Import and use `env.*` instead of `process.env.*` throughout the app.

### 6.2 Error Tracking — Sentry

Add `@sentry/nextjs`:
- Client-side error capture with source maps
- Server-side error capture in API routes and server components
- Performance monitoring (transaction tracing)
- Session replay for debugging user-reported issues

Config files:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- Update `next.config.ts` with `withSentryConfig` wrapper

### 6.3 Health Check Endpoint

**New:** `src/app/api/health/route.ts`

```typescript
GET /api/health
Response:
{
  "status": "healthy" | "degraded" | "unhealthy",
  "checks": {
    "database": { "status": "ok", "latencyMs": 12 },
    "modelApi": { "status": "ok", "lastPrediction": "2026-03-15T10:00:00Z" },
    "auth": { "status": "ok" },
    "jobs": { "lastRun": "2026-03-15T09:00:00Z", "failedCount": 0 }
  },
  "version": "1.0.0",
  "uptime": 86400
}
```

No auth required (used by load balancers and uptime monitors). Returns only status — no sensitive data.

### 6.4 Structured Logging

Add `pino` for structured JSON logging in API routes and jobs:
- Request ID on every log line
- User ID on authenticated requests
- Duration tracking for DB queries and external API calls
- Error stack traces with context

### 6.5 Web Vitals

Use Next.js built-in `reportWebVitals` to capture and report:
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)

Send to analytics provider configured via `NEXT_PUBLIC_ANALYTICS_ID`.

### 6.6 CI/CD Pipeline

**`.github/workflows/ci.yml`:**
1. **Lint** — ESLint
2. **Type check** — `tsc --noEmit`
3. **Test** — Vitest
4. **Build** — `next build`
5. **Deploy** — Vercel (preview on PR, production on merge to main)

**`.github/workflows/model-ci.yml`:**
1. **Lint** — Ruff
2. **Test** — Pytest
3. **Type check** — Mypy (optional)
4. **Build Docker** — Build and push FastAPI container

### 6.7 Deployment Configuration

**`vercel.json`:**
- Build command, output directory
- Environment variable references
- Cron job configuration for scheduled predictions

**`nwsl-model/Dockerfile`:**
- Python 3.11+ base
- Install dependencies from `pyproject.toml`
- Run FastAPI via uvicorn
- Health check endpoint

**Staging environment:**
- Separate Supabase project for staging
- Separate Vercel project with staging env vars
- Model API deployed to staging container

### 6.8 Updated `.env.example`

```env
# === REQUIRED ===
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AUTH_SECRET=minimum-32-character-secret
JOBS_API_SECRET=minimum-16-character-secret

# === MODEL INTEGRATION ===
PREDICTION_API_URL=http://localhost:8000
PREDICTION_API_SECRET=minimum-16-character-secret

# === MONITORING (Recommended) ===
SENTRY_DSN=https://your-dsn@sentry.io/project
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
LOG_LEVEL=info

# === EMAIL (Optional) ===
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password

# === OAUTH (Optional) ===
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# === EXTERNAL DATA (Optional) ===
API_FOOTBALL_KEY=your-api-football-key
```

### 6.9 New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@upstash/ratelimit` | ^2.0 | Rate limiting |
| `@upstash/redis` | ^1.34 | Redis client for rate limiter |
| `@sentry/nextjs` | ^9.0 | Error tracking & performance |
| `pino` | ^9.0 | Structured logging |
| `pino-pretty` | ^13.0 (dev) | Log formatting for development |

**Python (nwsl-model):**
| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | ^0.115 | API server |
| `uvicorn` | ^0.34 | ASGI server |
| `prisma` | ^0.15 | Database client (Python) |

**Already in project (no action needed):**
- Zod 4.1.0 (validation)
- Prisma 7.5.0 (ORM)
- NextAuth 4.24.13 (auth)

---

## 7. Architecture Overview

### Post-Launch Architecture

```
                    +------------------+
                    |   Vercel Edge    |
                    |   (Next.js 16)   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+         +---------v---------+
    |   Server Routes   |         |   Client App      |
    |   /api/*          |         |   React SPA       |
    |   Middleware       |         |   Tailwind CSS    |
    +--------+----------+         +---------+---------+
             |                              |
             |          +----------+        |
             +--------->| Supabase |<-------+
             |          | Postgres |
             |          | Auth     |
             |          +----+-----+
             |               |
    +--------v---------+     |
    | FastAPI Model    |     |
    | (Docker)         |-----+
    |                  |
    | Dixon-Coles      |
    | Bivariate Poisson|
    | Market Derivation|
    +------------------+

    +------------------+
    | GitHub Actions   |
    | CI/CD Pipeline   |
    +------------------+

    +------------------+
    | Sentry           |
    | Error Tracking   |
    +------------------+
```

### Data Flow

1. **External providers** (API-Football, NWSL) → Ingest jobs → `Fixture`, `Player`, `PlayerMatchStatLine` tables
2. **Model pipeline**: Cron job → FastAPI `/batch-predict` → `ModelPrediction`, `FairOdds`, `BettingEdge` tables
3. **Player projections**: Cron job → Derive from team predictions + player stats → `PlayerProjection` table
4. **User-facing**: Next.js reads from all tables → Renders match insights, player projections, edge indicators

---

## 8. Success Criteria

### Must-Have for Launch
- [ ] All API routes authenticated and rate-limited
- [ ] Security headers via middleware
- [ ] Model predictions flowing to database and displayed on website
- [ ] Player projections with floor/ceiling on player cards
- [ ] Match insight cards on fixture pages
- [ ] Metadata on all 40 pages
- [ ] Loading skeletons on all data-fetching routes
- [ ] Error boundaries at route group level
- [ ] Sentry error tracking operational
- [ ] Health check endpoint returning green
- [ ] CI/CD pipeline running lint, typecheck, test, build, deploy
- [ ] Env var validation at startup
- [ ] Database indexes added, cascade deletes fixed
- [ ] Build passes with zero TypeScript errors

### Should-Have for Launch
- [ ] Sharp vs Public indicator on lineup pages
- [ ] Edge dashboard (admin-gated)
- [ ] Model health page
- [ ] PWA manifest
- [ ] Web Vitals reporting
- [ ] Accessibility pass complete
- [ ] Empty states with contextual copy
- [ ] Component splitting for largest 5 components
- [ ] Fantasy API split into domain modules
- [ ] Suspense boundaries on dashboard and player board

### Nice-to-Have (Post-Launch)
- [ ] Service worker for offline support
- [ ] Push notifications
- [ ] Real-time draft room via WebSocket
- [ ] Session replay via Sentry
- [ ] A/B testing framework
- [ ] Admin console fully implemented
