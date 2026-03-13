# Step 8 Output: Screen Specs

## Public and Auth

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| Landing page | Sell the product and route users into auth or help | `/` | Sign up, log in, learn rules | Product promise, CTA, league proof, matchup proof | App shell, surface cards, matchup score card | Single-column hero stack | Two-column hero plus support cards | Loading rarely matters; empty N/A | User does not know whether the app is live or how it works |
| Sign up | Create account quickly | `/signup` | Create account | Form, next step, onboarding context | Surface card | One-column form | Form + context rail | Validation, success, error | User expects password but product uses magic link |
| Log in | Recover existing access | `/login` | Continue with email, go to sign up | Primary form, fallback actions | Surface card | One-column primary card then alternate card | Two-column split | Validation, success, error | User used a different auth provider previously |
| Onboarding | Orient new users and hand them to a league action | `/onboarding` | Choose familiarity, favorite club, create/join path | Step flow, create vs join decision | Surface card, status banners | Step stack | Step stack with helper rail | Loading, skip, error | User is invited to a league before onboarding is complete |

## League

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| Dashboard | Multi-league command center | `/dashboard` | Open league, set lineup, review deadlines | Deadlines, leagues, recommended action | League card, status banner | Stack of league cards | Card stack plus utility rail | Loading, empty, error | User has zero leagues or multiple active drafts |
| Create league | Set up a private league fast | `/leagues/create` | Name league, set draft date, create, share | Form first, defaults second, invite outcome third | Surface cards | Single column | Two-column setup | Validation, success, locked if user already commissioner at limit | User changes manager count after invites sent |
| Join league | Join by link or code | `/leagues/join` | Enter code, confirm join | Confirmation and identity first | Surface cards | One-column code flow | Two-column explanation + form | Invalid code, expired invite | User opens invite before logging in |
| League home | Central weekly league view | `/leagues/[leagueId]` | Set lineup, open matchup, draft, transactions | Primary next action, weekly state, secondary league info | League subnav, surface cards | Action-first stack | Two-column content split | Loading, empty, pre-draft, playoff | League is full but draft not scheduled |

## Draft

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| Draft lobby | Prepare user before live room | `/leagues/[leagueId]/draft` | Review settings, enter room, queue players | Draft status, order, controls | Surface cards | Stacked summary | Two-column summary + sidebar | Waiting, paused, live, complete | Draft delayed or commissioner pauses before start |
| Live draft room | Run the actual snake draft | `/leagues/[leagueId]/draft/room` | Draft player, edit queue, toggle autopick | Clock, player board, queue | Draft board, draft queue panel, clock card | Board first, queue sheet | Three-zone layout | Live, paused, reconnecting, timed out | Duplicate pick attempt, disconnect during active pick |
| Draft recap | Summarize results and next action | `/leagues/[leagueId]/draft/recap` | Review roster, view full board | My roster first, league board second | Surface cards | Single-column recap | Two-column recap | Loading, complete | User enters before draft finalization |

## Team

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| My roster / lineup editor | Manage starters and bench | `/leagues/[leagueId]/team` | Swap players, confirm lineup | Starters, lock states, bench, confirm CTA | Lineup pitch, lock badges | Vertical pitch with bottom action bar | Pitch plus context rail | Pregame, partial lock, final | User tries to move a locked player |
| Player search and filters | Find players in league context | `/leagues/[leagueId]/players` | Search, filter, add/claim | Search and filters first, results second | Player cards | Chip filters + card list | Filters + content grid | Empty search, loading, no results | Player availability changes mid-session |
| Player detail | Show player context and actions | `/players/[playerId]` | Add, compare, inspect schedule | Snapshot, schedule, availability, action CTA | Surface cards | Snapshot first | Snapshot plus context rail | Loading, unavailable data | Player switches clubs or has missing headshot |

## Matchday

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| Weekly matchup (pregame) | Show projected matchup before kickoff | `/leagues/[leagueId]/matchup` | Review projection, open lineup | Score card, lineup comparison, timing | Matchup score card | Single stack | Two-column | Pregame, loading | No fixtures yet in current week |
| Live scoring view | Explain score movement in real time | `/leagues/[leagueId]/matchup` | Watch score changes, inspect events | Current score, event feed, player detail | Matchup score card, event rail | Score then feed | Score plus feed rail | Live, delayed feed, corrected stats | Provider corrections reverse a prior score change |
| Matchup result | Finalize and explain outcome | `/leagues/[leagueId]/matchup` | Review final result | Final score, key performers, standings impact | Matchup score card | Final card stack | Two-column summary | Final | Tie result or postponed replay |

## League Management

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| Standings | Show league table | `/leagues/[leagueId]/standings` | Review rank, playoff race | Table first, tiebreak explanation second | Surface card | Card rows | Wider table/card hybrid | Loading, empty, final | User needs tiebreak explanation |
| Transactions | Manage waivers and add/drop | `/leagues/[leagueId]/transactions` | Submit claim, review history | Claim timing, current priority, history | Surface cards, transaction rows | Stack with sticky submit CTA | Two-column | No claims, locked, processed | User misunderstands when players clear waivers |
| Commissioner settings | Manage safe league configuration | `/leagues/[leagueId]/settings` | Update invites, announcements, safe settings | Safe edits first, locked rules second | Surface cards | Single stack | Two-column | Loading, no permission | Commissioner attempts forbidden mid-season edit |

## Utility

| Screen | Purpose | URL | Primary actions | Content hierarchy | Key components | Mobile layout | Desktop layout | States | Edge cases |
|-------|---------|-----|-----------------|-------------------|----------------|---------------|----------------|--------|-----------|
| Profile and settings | Manage global preferences | `/settings` | Edit profile, manage providers | Identity first, preferences second | Surface cards | Single stack | Two-column | Loading, save success, error | User confuses account settings with league settings |
| Rules and scoring explainer | Make rules understandable | `/rules` | Read rules, scoring, roster model | Product rules, scoring values | Surface cards | Single stack | Two-column | Loading | User expects different scoring than league default |
| Help / FAQ | Provide contextual recovery | `/help` | Browse help, open rules | High-frequency questions first | Surface cards | Single stack | Two-column | Loading | User needs support in a locked league state |

## Special attention screens

### Live draft room

- Panel layout: clock/status, player board, queue/roster
- Pick flow: select player -> confirm -> roster updates instantly
- Timer behavior: visible, color-shift warning state, commissioner pause state
- Queue interaction: reorder, remove, and confirm queue-first autopick behavior
- Phone screen pattern: board remains primary; queue becomes bottom sheet

### Lineup editor

- Tap-to-swap is primary
- Lock indicators appear on player rows and slots
- Injury badges are visible in both lineup and bench
- Confirmation flow is single-step after the final swap set

### Live scoring view

- Score animation should be meaningful and restrained
- Event feed explains every score delta
- Player stat breakdown is expandable inline
- Opponent comparison stays visible at all times
