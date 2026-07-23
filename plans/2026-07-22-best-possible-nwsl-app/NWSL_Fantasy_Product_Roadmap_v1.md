# NWSL Fantasy Product Roadmap v1

## Executive outcome

The best version of this app is not just a league manager and not just a stats site. It is the daily home for following the NWSL through players, matches, private competition, and clear fantasy consequences.

The product should win on three things:

1. **Trust:** current data, explainable scoring, visible freshness, and no fabricated metrics.
2. **Matchday:** live real-world events immediately explain changes in fantasy matchups and contest leaderboards.
3. **NWSL fluency:** player and team pages teach the league well enough that a new fan can make a confident fantasy decision without leaving the app.

## Current production baseline

Already live:

- 410-player fantasy pool with real 2025 season inputs.
- 16-team analytics and 2025/2026 ESPN schedule and standings data.
- Player, team, match, model, and comparison analytics.
- Private classic leagues, snake drafts, queues, rosters, lineups, waivers, transactions, trades, chat, achievements, and notifications.
- Salary-cap entries and a real point-snapshot leaderboard.
- Real per-match scoring snapshots, weekly standings, matchups, settlements, scoring overrides, and job history.
- Honest model evaluation metrics and a production-safe Vercel release pipeline.
- NWSL player-card motion polish with reduced-motion support.

The largest remaining gaps:

- Match ingestion and fantasy scoring are manual.
- Public player data is 2025 while the active product season is 2026.
- Player match logs and form functions return empty arrays.
- Public player URLs use provider UUIDs. Team, schedule, and match pages live under analytics routes instead of clear public routes.
- The live match experience is not fed by a near-real-time event pipeline.
- Product analytics queues events and discards them in production.
- Draft autopick is a client-side manual button, not a server-enforced timer.
- Salary-cap play is league-shaped, not a first-class contest model.
- Push delivery, playoffs, several achievement triggers, and support operations remain explicit follow-ups.

## Product pillars

### 1. Public NWSL intelligence

Every player, team, match, and season gets a canonical public page.

Player pages include:

- Current club, position, jersey number, availability, and player image when rights permit.
- Current-season totals and per-90 rates.
- Match log, recent form, fantasy point history, salary history, and projection range.
- Role, expected minutes, matchup context, and projection drivers.
- Compare, watchlist, roster, and contest actions.
- Dynamic Open Graph card and structured data.

Team pages include:

- Current roster and availability.
- Standings, form, fixtures, results, team leaders, and fantasy leaders.
- Home and away splits.
- Team-strength and matchup context with source labels.

Schedule and match pages include:

- League-wide calendar, filters, broadcasts, venue, and status.
- Lineups, live timeline, box score, fantasy scorers, projections versus result, and correction status.
- Add-to-calendar and share actions.

### 2. Classic fantasy that runs itself

The system owns the season clock.

- Draft timer and autopick are enforced server-side.
- Lineups lock per real match.
- Match events produce incremental fantasy changes.
- Final stats settle weekly matchups and standings idempotently.
- Waivers run on schedule.
- Regular season rolls into a four-team playoff bracket.
- Commissioners can see and recover failed operations without database work.

### 3. Free-to-play DFS

Salary-cap play becomes a true contest product.

- Contest lobby by slate.
- Exact `contest_id` scoping for entries, ranks, and scoring.
- Multiple named entries up to a contest-specific limit.
- Clear lock states and late-swap rules.
- Live leaderboard, projection versus actual, duplicate-lineup visibility, and final recap.
- No money movement or cash prizes.

### 4. Matchday and social energy

- Live fantasy score swings map to official events.
- Watchlisted and rostered player alerts.
- In-app, email, and optional web-push delivery.
- Weekly matchup recaps and shareable player or achievement cards.
- League chat, reactions, rivalry context, streaks, and season awards.

### 5. Operational excellence

- Automated ingestion with source provenance and freshness SLAs.
- Data-quality checks before derived stats publish.
- Idempotent jobs, retries, and run history.
- Admin views for stale data, failed matches, scoring corrections, and contest settlement.
- Full E2E simulations for draft, lineup, scoring, waivers, playoffs, and DFS.

## Experience principles

- One tap from league home to set lineup.
- Two taps from dashboard to live matchup.
- Every number has a source, season, and freshness context.
- Every score change has a player event explanation.
- Missing data creates an honest empty state, not a fallback number.
- Mobile is the primary matchday surface.
- Motion rewards attention but never delays content.
- New fans get explanations in context. Experienced players can move quickly.

## Roadmap

### Phase 1: Trusted public hub

Target: 2 to 3 weeks with one senior engineer plus AI-assisted implementation.

Ship:

- Normalized public NWSL schema.
- Official-first automated ingest and data-quality reports.
- Canonical `/players/[slug]`, `/teams/[slug]`, `/schedule`, and `/matches/[id]` routes.
- Current-season player and team read models.
- Dynamic metadata, structured data, sitemaps, redirects, and canonical links.
- Real product analytics and Web Vitals.

Exit gate:

- All public routes return 200 on production.
- 2026 data freshness is visible.
- No UUID is required in a public URL.
- Player form and match log are populated where official data exists.
- Search engines can discover every public entity page.

### Phase 2: Best-in-class matchday

Target: 2 to 3 weeks.

Ship:

- Scheduled, live, final, postponed, and canceled match states.
- Lineups and event timeline.
- Incremental fantasy point deltas.
- Realtime classic matchup and DFS leaderboard updates.
- Projection versus actual and source/correction labels.
- Match alerts for rostered and watchlisted players.

Exit gate:

- Live-event p95 freshness below 90 seconds.
- A scoring event appears in match center and fantasy matchup from the same normalized event.
- Replaying an event does not double score it.
- Final scores settle within 10 minutes of official final.

### Phase 3: Fantasy that operates itself

Target: 3 to 4 weeks.

Ship:

- Server-owned draft pick transaction.
- Scheduled autopick and next-manager notification.
- Automated weekly window generation.
- Scheduled waivers.
- Four-team playoff bracket and season awards.
- Commissioner recovery controls and auditable corrections.

Exit gate:

- A 12-manager simulated draft completes with zero duplicate picks.
- A full simulated season advances without manual database work.
- Autopick, waiver, scoring, and playoff jobs are idempotent.

### Phase 4: Free-to-play contest platform

Target: 3 weeks.

Ship:

- First-class contest and entry schema.
- Slate lobby and filters.
- Multiple entries with contest limits.
- Exact-contest leaderboard.
- Live scoring, rank movement, and contest recap.
- Projection floor, median, ceiling, expected minutes, and explanation drivers.

Exit gate:

- No entry or score can appear in the wrong contest.
- Lock and late-swap behavior match the contest rule snapshot.
- A 1,000-entry synthetic leaderboard recomputes within the agreed performance budget.

### Phase 5: Retention and premium polish

Target: 2 to 3 weeks.

Ship:

- PWA install and resilient mobile shell.
- Web push and email preferences.
- Watchlist sync for signed-in users.
- Achievement and weekly recap cards.
- Soccer-specific motion on meaningful moments.
- Accessibility and performance pass.
- Admin data-quality and job recovery console.

Exit gate:

- WCAG 2.2 AA on P0 flows.
- Mobile p75 Core Web Vitals meet target.
- Push and email honor preferences and deduplicate deliveries.
- A commissioner can diagnose and rerun a failed match without SQL.

### Phase 6: Beta and launch

Target: 2 weeks plus observation.

Ship:

- Internal synthetic league.
- Closed beta with 4 to 8 real leagues.
- Instrumented onboarding and weekly retention funnel.
- Failure drills for provider outage, duplicate events, delayed final, postponed match, and draft disconnect.
- Release runbook, source/rights review, support playbook, and production monitoring.

Exit gate:

- Two consecutive matchweeks complete without a scoring integrity incident.
- At least 70 percent of active beta managers submit a legal lineup.
- No P0 or P1 issue remains open.
- Production deploy and canonical-domain checks pass.

## Metrics dashboard

Acquisition:

- Organic entrances to player, team, match, and schedule pages.
- Search impressions, clicks, and indexed-page coverage.
- Player-page to signup conversion.

Activation:

- Signup completed.
- Onboarding completed.
- League created or joined.
- First legal lineup submitted.
- First contest entry submitted.

Retention:

- Weekly active managers.
- Lineup submission rate.
- Matchday open rate.
- Week 1, Week 4, and season retention.
- Notification opt-in and useful-click rate.

Trust:

- Provider freshness by feed.
- Failed and retried jobs.
- Duplicate event rejection count.
- Scoring overrides per 1,000 player-match rows.
- Time from official final to settled fantasy result.

Performance:

- LCP, INP, and CLS by route class.
- Player-grid render time.
- Live update latency.
- Leaderboard recompute time.

## Sequencing rules

- Do not build a new public page on bundled data if the normalized read model is not ready.
- Do not build live fantasy UI before event deduplication and incremental scoring are proven.
- Do not add multi-entry DFS before `contest_id` is first-class.
- Do not add more notification channels before delivery preference and deduplication contracts exist.
- Do not start native mobile until the PWA shows meaningful weekly retention.
- Do not market predictions as betting edges.

## Risks and explicit calls

- Data rights: athlete photos, club marks, and any official-affiliation language need rights review before launch.
- Provider stability: official and ESPN schemas can change. Adapters, contract fixtures, and freshness alerts are required.
- Stats quality: some volume statistics are currently estimated from season rates. Estimated values remain labeled until exact match-level fields are available.
- Live cost: minute-level polling and Realtime fan-out need a measured operating budget before open beta.
- Product scope: real-money contests are intentionally excluded.

## Five-minute next action

Start packet 01. Create the additive public NWSL schema and shared TypeScript contracts. Do not touch UI until the migration and contract tests pass.
