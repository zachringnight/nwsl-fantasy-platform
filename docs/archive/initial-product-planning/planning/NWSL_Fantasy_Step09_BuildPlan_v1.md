# Step 9: Build Plan

Reference the master context document for priority tiers and constraints.
Reference Step 7 for technical architecture and dependencies.
Reference Step 8 for the full screen inventory.

---

## Your task

Produce a phased implementation plan. Each phase must be shippable and testable independently.

---

## Deliver exactly these phases

### Phase 0: Scaffold and architecture
- Repo setup, project structure, tooling config
- Design token system
- Component library foundation
- Database setup and initial migration
- Auth integration
- CI/CD pipeline
- Environment setup (dev, staging, prod)

### Phase 1: Auth + Onboarding + League creation
- Sign up / log in flows
- Onboarding experience
- Create league flow
- Join league flow
- League home (shell)
- Dashboard (multi-league shell)

### Phase 2: Draft system + Roster builder
- Draft lobby
- Live draft room (real-time)
- Autopick and queue
- Draft recap
- Roster view and lineup editor
- Player search and filters
- Player detail page

### Phase 3: Scoring + Standings + Transactions
- Scoring engine (stat ingestion, point calculation, caching)
- Weekly matchup generation
- Standings computation
- Waiver/add-drop system
- Transaction history

### Phase 4: Live matchday experience
- Live scoring updates
- Matchup center with real-time data
- Score animations and status indicators
- Push notification triggers (if in scope)

### Phase 5: Commissioner + Admin tools
- Commissioner settings panel
- Admin dashboard
- Scoring correction tools
- User/league support tools

### Phase 6: Polish, QA, Accessibility, Performance
- WCAG 2.2 AA audit and fixes
- Lighthouse performance optimization
- Error state and edge case coverage
- Analytics instrumentation
- Load testing
- Beta testing plan

---

## For each phase, provide

| Field | Detail |
|-------|--------|
| Deliverables | Specific screens and systems completed |
| Dependencies | What must be done before this phase |
| Risks | What could block or delay this phase |
| Acceptance criteria | How you know it's done (testable) |
| Estimated effort | Rough calendar time assuming solo dev + AI workflow |

---

## Also provide

### Dependency graph
A simple list showing which phases block which. Identify any parallelizable work.

### Critical path
What is the minimum path from zero to a draftable, playable MVP?

### Risk register
Top 5 risks across the entire build with mitigation plans.

---

## Format

Tables for phase details. Lists for dependencies and risks. Keep total output under 3,000 words.

---

## Do not include
- Actual code (that's Step 10)
- Design details (covered in Steps 5 and 8)
