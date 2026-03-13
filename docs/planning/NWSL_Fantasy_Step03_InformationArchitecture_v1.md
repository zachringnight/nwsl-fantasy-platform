# Step 3: Information Architecture

Reference the master context document for all locked decisions and priority tiers.
Reference Step 1 output for target users, use cases, and MVP scope.

---

## Your task

Define the complete sitemap, route structure, and navigation model for the platform.

---

## Deliver exactly these sections

### 1. Sitemap

Full hierarchical sitemap covering:
- Marketing/public pages
- Auth flows (sign up, log in, password reset, magic link if applicable)
- Onboarding flows
- League flows (create, join, league home, settings)
- Draft flows (lobby, live draft room, draft recap)
- Team management (roster, lineup, bench)
- Player browsing (search, filters, player detail, comparison)
- Live scoring (matchup center, live updates)
- Standings and history
- Transactions (waivers, add/drop, free agents)
- Commissioner tools
- User settings and profile
- Admin panel
- Help, rules, FAQ

Use indented hierarchy. Mark each page as P0, P1, or P2.

### 2. Route map

Define the actual URL routes. Example format:
```
/                          → Landing page (public)
/login                     → Auth
/onboarding                → New user flow
/leagues                   → League list
/leagues/[id]              → League home
/leagues/[id]/draft        → Draft room
/leagues/[id]/team         → My team
/leagues/[id]/matchup      → Weekly matchup
/leagues/[id]/players      → Player browser
/leagues/[id]/standings    → Standings
/leagues/[id]/transactions → Waivers/add-drop
/leagues/[id]/settings     → Commissioner settings
/players/[id]              → Player detail
/settings                  → User settings
/admin                     → Admin panel
/help                      → Rules and FAQ
```

Include all routes. Flag which require auth and which are public.

### 3. Navigation model

Define:
- Primary navigation (what's always visible)
- Secondary navigation (contextual to league)
- Mobile navigation pattern (bottom tabs, hamburger, or hybrid, with rationale)
- Desktop navigation pattern
- How the user moves between leagues if they're in multiple
- How the user accesses global settings vs league settings
- Breadcrumb or back-navigation strategy

### 4. Key navigation decisions

For each decision, state what you chose and why:
- How many taps from league home to set lineup on mobile?
- How does the user get to live scoring during a match?
- Where do notifications surface?
- How does the draft room entry work (lobby vs direct join)?
- How does the user discover and compare players?

---

## Format

Use code blocks for route maps. Use indented lists for sitemaps. Short paragraphs for decisions. Keep total output under 2,500 words.

---

## Do not include
- Competitive analysis (done in Step 2)
- Detailed screen specs (that's Step 8)
- Visual design details (that's Step 5)
