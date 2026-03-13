# NWSL Fantasy Platform: Master Context v2

This file carries the original locked decisions forward and adds the decisions resolved in Steps 1-6 so implementation work has one source of truth.

## Product summary

Free-to-play, season-long, draft-based NWSL fantasy platform. Head-to-head weekly points. Live snake draft. Mobile-first responsive web app. Private leagues at launch, public leagues ready in the architecture and planned immediately after MVP hardening.

## Locked decisions

### Format
- Season-long H2H weekly points
- Snake draft with live room, queue, autopick, timer, draft recap, and commissioner pause/resume tools
- Weekly matchup reset per fantasy week
- Standings based on W-L-T, points for, and points against
- Waivers and add-drop after each week
- Private leagues at MVP, public leagues Phase 2
- Free to play

### Core rules
- Default league size: 10 managers
- Supported league size range: 8 to 12 managers
- Roster size: 12
- Starting lineup: 1 GK, 2 DEF, 3 MID, 2 FWD, 1 FLEX (DEF/MID/FWD)
- Bench: 3
- Max players per NWSL club: 4
- Captain mechanic: no
- Lineup lock: per-match lock
- Waivers: rolling priority, Tuesday processing, free agency opens after processing
- Weekly transaction cap: 3
- Playoffs: yes, 4 teams, two single-week rounds at the end of the fantasy regular season
- Divisions: no

### Branding
- Full NWSL licensing confirmed
- Use official league, club, and player assets where available
- Do not design around placeholder brand restrictions

### Data sources
1. Primary live data: API-Football
2. Supplemental availability: NWSL Availability Report
3. Historical and editorial context: NWSL Data
4. Ingestion must remain provider-agnostic

### Launch scoring categories
- Appearance
- 60+ minutes bonus
- Goals
- Assists
- Clean sheets
- Saves
- Goals conceded
- Yellow cards
- Red cards
- Penalty saves
- Penalty misses

### Launch scoring values
| Category | GK | DEF | MID | FWD |
|----------|----|-----|-----|-----|
| Appearance | 1 | 1 | 1 | 1 |
| 60+ minutes | 1 | 1 | 1 | 1 |
| Goal | 10 | 10 | 8 | 6 |
| Assist | 5 | 5 | 5 | 5 |
| Clean sheet | 4 | 4 | 0 | 0 |
| Save | 0.75 | 0.75 | 0 | 0 |
| Goals conceded | -0.5 | -0.5 | 0 | 0 |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |
| Penalty save | 5 | 5 | 0 | 0 |
| Penalty miss | -3 | -3 | -3 | -3 |

### UX decisions
- Mobile-first base with premium desktop treatment
- Bottom-tab plus contextual subnav on mobile
- League home to lineup editor in 1 tap
- Dashboard to lineup editor in 2 taps
- Draft room uses three zones on desktop and a board-first plus bottom-sheet pattern on mobile
- Dark mode deferred until after launch stabilization

### Technical decisions
- Next.js App Router, TypeScript, React, Tailwind
- Prisma with PostgreSQL and provider-agnostic data ingestion
- Auth.js with Google OAuth plus email magic link shell
- Cached fantasy point snapshots plus background recompute jobs
- SSE-friendly live update architecture; draft and live scoring written so a websocket transport can be added without reshaping the domain model

## Priority tiers

### P0
- Auth and accounts
- League create and join
- Dashboard
- Draft lobby and live draft room
- Roster and lineup management
- Player browse and detail basics
- Weekly matchup and live scoring
- Standings
- Waivers and transactions
- Rules explainer and onboarding

### P1
- Public leagues
- Commissioner polish tools
- Notification delivery beyond in-app
- Admin correction tools
- Richer player comparison

### P2
- Dark mode
- Editorial and analytics layers
- Trade system
- Keeper and dynasty formats

## Success criteria
- First-time user can sign up, join or create a league, and understand the next action inside 5 minutes on mobile
- Draft room feels materially clearer than Yahoo, ESPN, and Fantrax
- Matchday feels alive, not spreadsheet-like
- Rules can be understood from product copy and inline explanations
- Casual fans learn the player pool through product use
- Experienced fantasy users trust the integrity of the rules engine
