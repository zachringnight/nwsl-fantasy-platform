# Step 7 Output: Technical Architecture

This architecture is implemented as a Phase 0 scaffold in the repo.

## 1. Database schema

Primary schema file:
- `prisma/schema.prisma`

Core entity groups:
- Auth: `User`, `Account`, `Session`, `VerificationToken`
- League: `League`, `LeagueSettings`, `LeagueInvite`, `LeagueMembership`, `FantasyTeam`, `LeagueWeek`
- Draft: `Draft`, `DraftSlot`, `DraftPick`, `DraftQueueItem`
- Roster and lineup: `RosterSpot`, `LineupEntry`
- Sports domain: `Club`, `Player`, `Fixture`, `FixtureEvent`, `PlayerMatchStatLine`, `AvailabilityReport`, `AvailabilityReportItem`
- Scoring: `LeagueScoringRule`, `FantasyPointSnapshot`, `ScoringOverride`
- Competition: `Matchup`, `StandingEntry`
- Transactions: `Transaction`, `WaiverClaim`
- Notifications and auditing: `NotificationPreference`, `Notification`, `AuditLog`
- Provider abstraction: `Provider`, `ProviderIngestRun`, `ProviderPayload`, `ProviderClubMap`, `ProviderPlayerMap`, `ProviderFixtureMap`

The schema includes:
- relational integrity for every core competitive object
- explicit indexes for league/week, fixture/player, provider mappings, and transaction timelines
- enough separation between raw provider payloads and normalized domain data to support a provider swap later

## 2. Provider-agnostic data ingestion layer

Scaffold files:
- `src/providers/contracts/fantasy-data-provider.ts`
- `src/providers/api-football/api-football-provider.ts`
- `src/providers/api-football/stat-mapping.ts`

Design:
- Raw payloads are stored in `ProviderPayload`
- Sync jobs are tracked in `ProviderIngestRun`
- Stable internal entities remain `Club`, `Player`, `Fixture`, and `PlayerMatchStatLine`
- Provider ID churn is isolated to mapping tables

Provider swap rule:
- New provider adapters implement the same contract
- Domain models and UI consume normalized records, not provider response shapes

## 3. Scoring engine architecture

Scaffold files:
- `src/lib/scoring/scoring-rules.ts`
- `src/lib/scoring/scoring-engine.ts`

Flow:
1. Provider stat lines are normalized into `PlayerMatchStatLine`
2. Scoring engine converts stat lines into point totals and breakdowns
3. League-specific snapshots are persisted in `FantasyPointSnapshot`
4. Corrections create `ScoringOverride` records and `AuditLog` entries
5. Recompute jobs refresh snapshots when source stats change

## 4. Draft system architecture

Schema support:
- `Draft`, `DraftSlot`, `DraftPick`, `DraftQueueItem`

Runtime recommendation:
- Use websocket transport for the live room because clock and pick state need low-latency fan-out
- Keep the draft domain state transport-agnostic so a different realtime layer can be swapped later

State machine:
- Scheduled -> Lobby -> Live -> Paused -> Complete

Concurrency model:
- Server-authoritative current pick
- single write gate per active slot
- idempotent pick submission keyed to slot and draft state

Recovery model:
- queue lives server-side
- current clock is reconstructed from persisted draft state and timestamps

## 5. Live scoring architecture

Recommendation:
- Poll provider APIs in the background and fan out normalized updates to clients
- Use SSE or websocket fan-out from your app tier depending on the final hosting choice

Behavior:
- ingest stat deltas frequently during live fixtures
- recompute affected player snapshots
- recompute affected matchup totals
- stream only the changed payload to clients

Caching:
- `FantasyPointSnapshot` is the fast read layer
- matchup pages consume cached snapshots and recent event deltas

## 6. Background jobs

Scaffold files:
- `src/jobs/sync-fixtures-job.ts`
- `src/jobs/sync-player-stats-job.ts`
- `src/jobs/recompute-fantasy-points-job.ts`
- `src/jobs/generate-weekly-matchups-job.ts`
- `src/jobs/process-waivers-job.ts`
- `src/jobs/send-notifications-job.ts`

These cover:
- fixture sync
- live stat sync
- point recompute
- matchup generation
- waiver resolution
- notification delivery

## 7. Notification architecture

Channels:
- in-app at launch
- email and push supported by the architecture, phased operationally

Key events:
- draft starting
- lineup lock approaching
- waiver processed
- matchup final
- commissioner announcement

Control model:
- user preferences in `NotificationPreference`
- event records in `Notification`
- delivery execution through background jobs

## 8. Scaffold mapping

Implemented files:
- Auth shell: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Prisma client: `src/lib/prisma.ts`
- Generated client output: `src/generated/prisma`
- Jobs registry: `src/jobs/index.ts`
