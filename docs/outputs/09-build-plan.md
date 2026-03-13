# Step 9 Output: Build Plan

## Phase 0: Scaffold and architecture

| Field | Detail |
|------|--------|
| Deliverables | App Router skeleton, shared design tokens, shared shell components, Prisma schema, auth shell, provider contract, job definitions, README |
| Dependencies | None |
| Risks | Schema churn if rules are unresolved; over-scaffolding before real screens are prioritized |
| Acceptance criteria | App runs, lints, builds, and includes the core route tree plus schema and auth/provider shells |
| Estimated effort | 4 to 6 days solo + AI |

## Phase 1: Auth + Onboarding + League creation

| Field | Detail |
|------|--------|
| Deliverables | Working sign up, login, onboarding, create/join league, dashboard, league home shell with real data |
| Dependencies | Phase 0 |
| Risks | Auth/provider friction, unclear onboarding assumptions |
| Acceptance criteria | User can create an account, create or join a league, and land in league home with persisted data |
| Estimated effort | 1.5 to 2.5 weeks |

## Phase 2: Draft system + Roster builder

| Field | Detail |
|------|--------|
| Deliverables | Draft lobby, live draft room, queue, autopick, draft recap, roster view, lineup editor, player browser, player detail |
| Dependencies | Phase 1, draft rules finalized |
| Risks | Realtime complexity, mobile draft UX, disconnect recovery |
| Acceptance criteria | A full test league can draft end-to-end and set a legal week-one lineup |
| Estimated effort | 2.5 to 4 weeks |

## Phase 3: Scoring + Standings + Transactions

| Field | Detail |
|------|--------|
| Deliverables | Ingest jobs, normalized stat lines, fantasy scoring snapshots, weekly matchups, standings, waivers, add/drop |
| Dependencies | Phase 2, provider access, final scoring rules |
| Risks | Provider data consistency, scoring edge cases, delayed stat corrections |
| Acceptance criteria | Completed fixtures generate player points, matchup totals, standings updates, and transaction outcomes |
| Estimated effort | 3 to 4 weeks |

## Phase 4: Live matchday experience

| Field | Detail |
|------|--------|
| Deliverables | Live matchup updates, event feed, score movement, active game states, in-app alerts |
| Dependencies | Phase 3 |
| Risks | Latency, event ordering, client update noise |
| Acceptance criteria | Users can watch live score changes in near real time and understand why the scores changed |
| Estimated effort | 1.5 to 2.5 weeks |

## Phase 5: Commissioner + Admin tools

| Field | Detail |
|------|--------|
| Deliverables | Commissioner settings, announcements, admin support tools, scoring correction tooling |
| Dependencies | Phase 3 and 4 |
| Risks | Permission boundaries, auditability, support creep |
| Acceptance criteria | Safe commissioner edits work, admin corrections are traceable, support workflows are possible without DB surgery |
| Estimated effort | 1.5 to 2 weeks |

## Phase 6: Polish, QA, Accessibility, Performance

| Field | Detail |
|------|--------|
| Deliverables | WCAG pass, Lighthouse tuning, empty/error coverage, instrumentation, beta checklist |
| Dependencies | All prior phases |
| Risks | Performance regression from live features, unresolved mobile edge cases |
| Acceptance criteria | Critical flows meet accessibility and performance targets and survive guided beta testing |
| Estimated effort | 2 to 3 weeks |
