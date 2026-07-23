# Step 8: Screen-by-Screen Product Spec

Reference the master context document for locked decisions.
Reference Step 3 for the route map and navigation model.
Reference Step 4 for user flows and tap counts.
Reference Step 5 for the design system and component inventory.
Reference Step 6 for game rules.

---

## Your task

Create detailed requirements for every core screen. This is the product spec a developer follows to build each page.

---

## Required screens

Spec each of these screens. For each, provide:

1. **Purpose** (one sentence)
2. **URL route**
3. **Primary user actions** (what the user does here, ranked by importance)
4. **Content hierarchy** (what's most prominent to least prominent)
5. **Key components used** (reference the component inventory from Step 5)
6. **Mobile layout** (describe the layout, not pixels)
7. **Desktop layout** (what changes from mobile)
8. **States** (loading, empty, error, locked, and any screen-specific states)
9. **Edge cases** (what could go wrong or confuse the user)

### Screen list

**Public / Auth**
1. Landing page
2. Sign up
3. Log in
4. Onboarding (step-by-step)

**League**
5. Dashboard (multi-league view)
6. Create league
7. Join league (via link and via code)
8. League home

**Draft**
9. Draft lobby (pre-draft waiting room)
10. Live draft room
11. Draft recap

**Team**
12. My roster / lineup editor
13. Player search and filters
14. Player detail

**Matchday**
15. Weekly matchup (pre-game)
16. Live scoring view (during matches)
17. Matchup result (post-game)

**League Management**
18. Standings
19. Transactions (waivers / add-drop)
20. Commissioner settings

**Utility**
21. Profile and user settings
22. Rules and scoring explainer
23. Help / FAQ

---

## Special attention screens

For these three screens, provide extra detail because they are hero experiences:
- **Live draft room:** Describe panel layout, pick flow, timer behavior, queue interaction, roster tracker, and how it works on a phone screen
- **Lineup editor:** Describe tap-to-swap, drag behavior, lock indicators, injury badges, and the confirmation flow
- **Live scoring view:** Describe real-time update behavior, score animation, player stat breakdown, and opponent comparison

---

## Format

Use consistent headers for each screen. Tables where they help (e.g., listing states). Keep total output under 5,000 words.

---

## Do not include
- Implementation code (that's Step 10)
- Build sequencing (that's Step 9)
