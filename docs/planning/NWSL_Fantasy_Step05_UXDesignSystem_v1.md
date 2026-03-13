# Step 5: UX and Design System

Reference the master context document for locked decisions and tech stack.
Reference Step 1 for target users and quality bars.
Reference Step 3 for navigation model.
Reference Step 4 for user flows and tap counts.

---

## Your task

Define the complete UX approach and design system. This should be specific enough that a developer can implement consistent UI without a Figma file.

---

## Deliver exactly these sections

### 1. Design principles (5 to 7)
Each principle should be actionable, not aspirational. Bad: "Clean design." Good: "Every screen has one primary action. Secondary actions are visually demoted."

### 2. Component inventory
List every reusable component the product needs. Group by category:
- Navigation components
- Cards (player card, matchup card, league card, etc.)
- Data display (tables, stat rows, score displays)
- Input components (dropdowns, toggles, search, filters)
- Feedback (toasts, confirmations, loading states, empty states, error states)
- Overlay components (drawers, modals, bottom sheets)
- Draft-specific components
- Scoring-specific components

For each component, provide:
- Name
- Where it's used
- Key variants
- Mobile behavior

### 3. Visual hierarchy rules
Define how content is prioritized on screen:
- Typography scale (sizes, weights, line heights)
- Spacing scale
- How primary vs secondary vs tertiary content is differentiated
- Card elevation and depth model
- Touch target minimums

### 4. Design token specification
Provide a complete token file (JSON or TypeScript format) covering:
- Color system (primary, secondary, accent, semantic colors for success/warning/error/info, neutrals)
- Typography tokens (font family, size scale, weight scale, line height scale)
- Spacing scale
- Border radius scale
- Shadow scale
- Breakpoints
- Animation/transition tokens

Include the rationale for the color system. Address dark mode: ship it, defer it, or skip it, with reasoning.

### 5. Responsive strategy
Define:
- Breakpoints and what changes at each
- Mobile-first base styles
- How cards, tables, and data views adapt
- How navigation transforms
- How the draft room adapts (this is the hardest responsive challenge)

### 6. Key UX patterns
For each of these critical experiences, describe the UX pattern in detail:
- **Player card:** What information shows at glance vs on tap/click
- **Draft room:** Layout, pick timer, queue panel, player list, roster tracker
- **Lineup editor:** How drag/drop or tap-to-swap works on mobile
- **Matchup center:** How live scores update, how individual player scoring displays
- **Scoring chips/badges:** How fantasy points are shown on player cards and in matchups

### 7. Accessibility approach
- Color contrast strategy
- Focus management for draft room
- Screen reader approach for live scoring updates
- Keyboard navigation for draft picks
- Reduced motion support

---

## Format

Use headers, short paragraphs, and code blocks for tokens. Tables for component inventory. Keep total output under 4,000 words.

---

## Do not include
- Screen-by-screen specs (that's Step 8)
- Database schema (that's Step 7)
- Build plan (that's Step 9)
