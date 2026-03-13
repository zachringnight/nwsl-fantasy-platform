# Step 7: Data Model and Technical Architecture

Reference the master context document for tech stack, data sources, and locked decisions.
Reference Step 6 for the complete game ruleset (roster, scoring, waivers, draft rules).

---

## Your task

Define the complete data model, system architecture, and technical design. This must be specific enough to begin implementation.

---

## Deliver exactly these sections

### 1. Database schema
Provide the full Prisma schema (or equivalent) for all entities. At minimum:
- Users and auth
- Leagues and league settings
- League membership and roles
- Draft state (order, picks, queue, status)
- Teams and rosters
- Players (with provider mapping)
- Player stats (raw ingest and normalized)
- Fixtures and match events
- Scoring snapshots (cached fantasy points)
- Matchups (weekly H2H)
- Standings
- Transactions (waivers, add/drop, trade if future)
- Notifications
- Audit log

For each entity, include:
- Fields with types
- Relationships
- Indexes
- Key constraints

### 2. Provider-agnostic data ingestion layer
Design the abstraction layer for API-Football:
- Raw ingest tables (store exactly what the API returns)
- Normalized domain models (your internal representation)
- Provider mapping tables (map API-Football IDs to internal IDs)
- Stat-type mapping config (map API-Football stat names to your scoring categories)
- How a provider swap works without touching domain models

### 3. Scoring engine architecture
- How raw stats become fantasy points
- Scoring recompute jobs (when stats are corrected)
- Cached fantasy point snapshots (for fast reads)
- Manual override tools for admin
- Audit trail for scoring changes

### 4. Draft system architecture
- Real-time draft room (WebSocket vs SSE vs polling, recommend one)
- Draft state machine (states, transitions, timer logic)
- Autopick algorithm
- Queue management
- Concurrency handling (two users picking simultaneously)
- Draft persistence and recovery (what happens on disconnect)

### 5. Live scoring architecture
- How live match data flows from API-Football to the user's screen
- Polling frequency vs push model
- How partial stat updates are handled
- How the matchup page updates in real time
- Caching strategy for live data

### 6. Background jobs
List every background job the system needs:
- Purpose
- Trigger (cron, event, manual)
- Frequency
- Failure handling

### 7. Notification architecture
- Channels (in-app, push, email)
- Key notification events (draft starting, lineup lock approaching, waiver processed, matchup result)
- Delivery strategy
- User preference controls

### 8. Caching strategy
- What gets cached
- Cache invalidation triggers
- Cache layers (CDN, application cache, DB query cache)

### 9. Auth and permissions
- Auth provider recommendation
- Permission model (user, league member, commissioner, admin)
- How league invites work
- Session management

### 10. Analytics events
List the top 15 to 20 analytics events to instrument at launch. For each:
- Event name
- When it fires
- Key properties

### 11. Admin tooling requirements
List what an admin needs to be able to do:
- Player data management
- Scoring corrections
- League support
- User management
- System health monitoring

---

## Format

Use code blocks for schema. Tables for jobs and events. Short paragraphs for architecture decisions. Keep total output under 5,000 words.

---

## Do not include
- UI specs (that's Step 8)
- Build sequencing (that's Step 9)
