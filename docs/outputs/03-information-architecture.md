# Step 3 Output: Information Architecture

## 1. Sitemap

### Public
- `/` Landing page `P0`
- `/login` Log in `P0`
- `/signup` Sign up `P0`
- `/forgot-password` Magic link recovery `P0`
- `/help` FAQ and support `P0`
- `/rules` Rules and scoring explainer `P0`

### Onboarding
- `/onboarding` Step-based onboarding `P0`

### Global authenticated
- `/dashboard` Multi-league dashboard `P0`
- `/leagues` League directory `P0`
- `/leagues/create` Create league `P0`
- `/leagues/join` Join league `P0`
- `/players` Global player browser `P1`
- `/players/compare` Player comparison `P2`
- `/players/[playerId]` Player detail `P1`
- `/settings` User settings `P1`
- `/notifications` Notification center and preferences `P1`
- `/admin` Admin tools `P2`

### League
- `/leagues/[leagueId]` League home `P0`
- `/leagues/[leagueId]/draft` Draft lobby `P0`
- `/leagues/[leagueId]/draft/room` Live draft room `P0`
- `/leagues/[leagueId]/draft/recap` Draft recap `P0`
- `/leagues/[leagueId]/team` My roster and lineup editor `P0`
- `/leagues/[leagueId]/players` League-context player browser `P0`
- `/leagues/[leagueId]/matchup` Weekly matchup and live scoring `P0`
- `/leagues/[leagueId]/standings` Standings and playoff race `P0`
- `/leagues/[leagueId]/transactions` Waivers, add/drop, history `P0`
- `/leagues/[leagueId]/settings` Commissioner settings `P1`

## 2. Route map

| Route | Purpose | Access |
|------|---------|--------|
| `/` | Landing page | Public |
| `/login` | Log in | Public |
| `/signup` | Sign up | Public |
| `/forgot-password` | Magic link recovery | Public |
| `/onboarding` | New user setup flow | Auth |
| `/dashboard` | Multi-league command center | Auth |
| `/leagues` | League list and entry point | Auth |
| `/leagues/create` | Create league flow | Auth |
| `/leagues/join` | Join via code or link | Auth |
| `/leagues/[leagueId]` | League home | Auth |
| `/leagues/[leagueId]/draft` | Draft lobby | Auth |
| `/leagues/[leagueId]/draft/room` | Live draft room | Auth |
| `/leagues/[leagueId]/draft/recap` | Draft recap | Auth |
| `/leagues/[leagueId]/team` | My team and lineup editor | Auth |
| `/leagues/[leagueId]/matchup` | Matchup and live scoring | Auth |
| `/leagues/[leagueId]/players` | League player browser | Auth |
| `/leagues/[leagueId]/standings` | Standings | Auth |
| `/leagues/[leagueId]/transactions` | Waivers and add/drop | Auth |
| `/leagues/[leagueId]/settings` | Commissioner settings | Auth |
| `/players` | Global player browser | Auth |
| `/players/[playerId]` | Player detail | Auth |
| `/players/compare` | Compare players | Auth |
| `/settings` | User settings | Auth |
| `/notifications` | Notification center | Auth |
| `/admin` | Admin panel | Admin |
| `/rules` | Rules and scoring explainer | Public |
| `/help` | FAQ and support | Public |

## 3. Navigation model

### Primary navigation

Primary navigation is global and persistent. It includes Home, Dashboard, Leagues, Players, and Help. This keeps public and authenticated orientation simple.

### Secondary navigation

League-specific navigation appears as a contextual subnav once a user is inside a league. It includes League Home, Team, Matchup, Players, Standings, Transactions, Draft, and Settings.

### Mobile navigation pattern

Use a hybrid model. The global shell stays lightweight, while league-level pages use a horizontally scrollable subnav paired with a persistent primary CTA. This is cleaner than forcing every league destination into a bottom tab bar.

### Desktop navigation pattern

Desktop keeps the same hierarchy but with more persistent visibility. Global navigation remains in the header, while league navigation sits directly beneath the page heading so context is always visible.

### Moving between leagues

Dashboard is the primary multi-league switching surface. League cards act as the fast jump pattern; a compact league switcher can be added to the header later.

### Global settings vs league settings

Global settings live in `/settings` and `/notifications`. League settings live under `/leagues/[leagueId]/settings`. This separation prevents users from confusing preferences with rules.

### Breadcrumb and back-navigation strategy

Do not rely on breadcrumbs as the primary navigation pattern. Use clear page titles, persistent league subnav, and the browser back stack. Breadcrumbs can be added on deeper desktop admin surfaces only.

## 4. Key navigation decisions

- How many taps from league home to set lineup on mobile: 1
- How does the user get to live scoring during a match: from league home via one primary matchup card or from dashboard via active league card
- Where do notifications surface: notification center route plus inline alerts on dashboard, league home, and matchup
- How does draft room entry work: league home -> draft lobby -> enter live room
- How does the user discover and compare players: global and league-context player browsers, then player detail, with compare added in Phase 2
