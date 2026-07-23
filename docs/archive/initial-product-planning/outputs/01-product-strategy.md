# Step 1 Output: Product Strategy

## 1. Target users

### Segment 1: NWSL diehards who do not yet have a clean fantasy home

These users already follow the league weekly, know the clubs, and care about lineups, injuries, and match context. Their fantasy experience ranges from moderate to heavy, but their NWSL knowledge is high. They choose this product if it treats NWSL seriously instead of feeling like a generic fantasy skin applied to a niche sport.

### Segment 2: Mainstream fantasy players who are curious about women's soccer

These users already understand drafts, waivers, and lineup setting from NFL, NBA, or MLB fantasy. Their fantasy literacy is high, but their NWSL literacy is low to medium. They choose this product if it gives them competitive depth without forcing them to study the league for weeks before they can play competently.

### Segment 3: Friend-group commissioners running social private leagues

These users organize league activity in text threads, Discords, and office chats. Their fantasy experience is usually medium to high, while their NWSL familiarity varies across the group. They choose this product if setup is fast, invite flows are frictionless, and draft night feels polished enough to become the social centerpiece.

### Segment 4: Casual women's sports fans who want a structured way to follow the season

These users like the league, favorite players, or specific clubs, but they are not fantasy experts. Their NWSL familiarity is medium, their fantasy familiarity is low, and they will bounce immediately if the rules feel opaque. They choose this product if it teaches them how to play while making every weekly choice feel understandable and rewarding.

## 2. Primary use cases

| Rank | User action | When and where it happens | What success looks like |
|------|-------------|---------------------------|-------------------------|
| 1 | Set a lineup before matches start | Mostly on mobile, usually Friday night or Saturday morning | User reaches lineup editor quickly, sees lock states clearly, and confirms in under 60 seconds |
| 2 | Track a live matchup during NWSL matches | Mobile-first, often second-screen during live viewing | User understands score movement instantly and can tie point swings to player events |
| 3 | Draft a roster in the live room | Mobile and desktop, scheduled social event | Draft feels smooth, queue is trustworthy, and no one gets lost in the interface |
| 4 | Join or create a league | Mobile invite flow, direct links, or league code entry | Commissioner can create and share a league fast; invited users can join without confusion |
| 5 | Add, drop, or claim a player | Usually mobile after weekend matches or before lock | User sees availability, roster consequences, and waiver timing before committing |
| 6 | Review standings and playoff race | Midweek or after scoring finalizes | User understands rank, tiebreak context, and what matters next |
| 7 | Learn the player pool | During draft prep, waiver browsing, or pregame lineup choices | Product teaches player relevance without requiring external research |

## 3. Why existing fantasy products are weak for NWSL

Yahoo Fantasy is strong at scale, but it is not built around a serious NWSL-specific season-long experience. Even if its broad fantasy foundations are solid, the product language, discovery flows, and player-learning support are tuned to major men's leagues, not an NWSL growth audience.

ESPN Fantasy has huge reach and familiar mechanics, but its mobile UX is cluttered and content-dense in a way that punishes new users. For an NWSL product, that density becomes a liability because casual users need guidance and confidence, not a wall of tabs and text.

Sleeper is excellent at social energy, alerts, and making drafts feel alive, but it is still more draft-night-forward than season-management-first in its overall product posture. The app is optimized around immediacy and motion, not careful learning of a smaller league's player pool.

Fantrax can model niche formats and deep commissioner settings, but the product pays for flexibility with complexity. It is the right benchmark for configurability and the wrong benchmark for launch approachability.

Underdog Fantasy is the best UX reference in the group for polish, ranking confidence, and visual clarity, but it is not a season-long commissioner-managed product. It is useful as a design bar, not as a format template.

## 4. What best in class means in practice

1. League home to lineup editor takes 1 tap on mobile.
2. Dashboard to current league matchup takes no more than 2 taps.
3. Draft queue editing can be done with one hand on a phone and no hidden menus.
4. Every score change in live matchup view is traceable to a visible player event within 2 seconds.
5. A new user can create or join a league and understand the rules without leaving the app.
6. Waiver processing time, lineup lock timing, and player lock status are always visible where decisions are made.
7. The visual system feels premium, intentional, and sport-specific rather than like admin software.

## 5. The NWSL-specific product wedge

The NWSL wedge is not "fantasy soccer." It is a licensed, season-long product for a league where many users are still actively learning the player pool while following the sport's growth. That changes the product in three ways.

First, education has to be built into the product. Player cards, lineup screens, and matchups must teach relevance, role, and availability without sending users to outside sites.

Second, product trust matters more than breadth. This audience will forgive missing fringe settings at launch faster than it will forgive unclear rules, bad live scoring explanations, or a cheap-feeling draft room.

Third, matchday should feel intimate rather than maximalist. The NWSL experience is better served by a product that highlights meaningful moments, player contributions, and lineup consequences rather than dumping users into a fantasy data warehouse.

## 6. MVP vs Phase 2 vs Phase 3 scope

| Phase | Item | Why it belongs there |
|------|------|----------------------|
| MVP | Auth, onboarding, create/join league, dashboard | Without these, the core loop cannot start |
| MVP | Live snake draft with queue, autopick, commissioner pause/resume | Draft night is the emotional center of the product |
| MVP | Roster management and lineup editor | Weekly retention depends on this flow being excellent |
| MVP | Matchup center with live scoring | Matchday clarity is the product's biggest chance to feel special |
| MVP | Standings, waivers, transactions, player detail basics | Season-long competitive integrity depends on them |
| MVP | Rules explainer and help | Novice users need embedded confidence, not off-platform explanation |
| Phase 2 | Public leagues | Important for growth, but not a launch blocker if private leagues are strong |
| Phase 2 | Richer player comparison and ranking prep tools | Valuable for depth, but not required to prove the core loop |
| Phase 2 | Push and richer email notification delivery | The architecture should support it early, but the initial product can ship with strong in-app alerts |
| Phase 2 | Admin operations and correction tooling | Necessary as real scale arrives, but not day-one consumer surface area |
| Phase 3 | Trades, keepers, dynasty formats | These deepen the platform after the main seasonal product is trusted |
| Phase 3 | Editorial layers and advanced analytics | They increase differentiation after the main mechanics are stable |
| Phase 3 | Dark mode | Nice to have, but not worth launch complexity against the current priorities |
