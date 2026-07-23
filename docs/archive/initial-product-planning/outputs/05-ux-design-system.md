# Step 5 Output: UX and Design System

## 1. Design principles

1. Every screen exposes one dominant next action.
2. Critical competitive information outranks decorative content.
3. Rules should be visible where the decision happens, not buried in help.
4. Mobile interactions default to tap-first patterns, not drag-only patterns.
5. Live states must be explainable, not just animated.
6. Commissioner power is available, but advanced controls are visually demoted behind safe defaults.
7. Empty, loading, error, and locked states are part of the design system, not afterthoughts.

## 2. Component inventory

### Navigation
| Component | Where used | Variants | Mobile behavior |
|----------|------------|----------|-----------------|
| Primary nav | Global shell | Public, authenticated | Horizontal scroll row |
| League subnav | League context | Default, commissioner | Horizontal scroll row |
| Status banner | Dashboard, league home, transactions | Info, success, warning | Full-width stack |

### Cards and display
| Component | Where used | Variants | Mobile behavior |
|----------|------------|----------|-----------------|
| League card | Dashboard, league list | Active, pre-draft, playoff | Single-column stack |
| Player card | Player browser, transactions | Available, questionable, rostered | One card per row |
| Matchup score card | Matchup center, dashboard | Pregame, live, final | Full-width hero card |
| Surface card | Shared shell | Default, brand, accent | Maintains padding and radius |

### Draft
| Component | Where used | Variants | Mobile behavior |
|----------|------------|----------|-----------------|
| Draft board | Live draft room | Search, filtered, ranked | Primary surface |
| Draft queue panel | Live draft room | Queue, roster summary | Bottom sheet or stacked panel |
| Draft clock card | Lobby, room | Normal, warning, paused | Sticky top card |

### Lineup
| Component | Where used | Variants | Mobile behavior |
|----------|------------|----------|-----------------|
| Lineup pitch | Team editor | Pregame, partial lock, final | Full-width stack |
| Swap sheet | Team editor | Starter select, replacement select | Bottom sheet |
| Lock badge | Team, matchup, player | Locked, unlocked, injury | Inline chip |

### Transactions and feedback
| Component | Where used | Variants | Mobile behavior |
|----------|------------|----------|-----------------|
| Transaction row | Transactions, player detail | Waiver, add, drop | One row per event |
| Empty state | League list, player browser | No leagues, no players, no claims | Illustrated panel |
| Loading state | All critical routes | Card skeleton, table skeleton | Matches final layout |
| Error state | All critical routes | Retry, support, degraded live mode | Inline recovery action |

## 3. Visual hierarchy rules

- Display type uses condensed uppercase for major titles and sport-like energy.
- Body copy uses a cleaner geometric sans to keep interfaces readable.
- Data and code-like values use mono selectively for timestamps, scores, and record chips.
- Spacing scale centers on 4, 8, 12, 16, 24, 32, and 48 pixels.
- Primary content gets stronger color contrast, larger scale, and higher card elevation.
- Secondary content uses the muted palette, smaller scale, and flatter surfaces.
- Minimum touch target is 44 by 44 pixels.

## 4. Design token specification

Primary color system:
- Brand green anchors trust, field association, and league seriousness.
- Coral accent provides urgency and motion without leaning on default purple or bright blue.
- Parchment background warms the product and distinguishes it from generic white-dashboard fantasy products.

Dark mode decision:
- Defer. Launch quality depends more on clarity, states, and interaction quality than maintaining a second theme.

Token source of truth:
- `src/config/design-tokens.ts`
- `src/config/design-tokens.json`

## 5. Responsive strategy

- Base breakpoint philosophy: mobile first, tablet second, desktop enhancement last.
- Under `md`: single-column stacks, queue and filters move to sheets or horizontal rows.
- `md` to `lg`: two-column layouts appear for dashboard, matchup, and create/join flows.
- `lg` and above: three-zone draft room, richer side panels, wider standings/transactions layouts.
- Tables should collapse into card rows on small screens.
- The draft room keeps the board dominant on phone; queue and roster tracking should never hide the pick clock.

## 6. Key UX patterns

### Player card

At a glance: name, position, club, average fantasy points, availability.  
On tap: player detail, matchup context, add or claim action.

### Draft room

Desktop uses clock, board, and queue as simultaneous zones. Mobile keeps the board full width, the clock pinned, and the queue in a sheet so the core pick decision remains uncluttered.

### Lineup editor

Tap-to-swap is the primary mobile action. Selecting a locked player should explain why the slot is unavailable instead of failing silently.

### Matchup center

Top layer shows score. Second layer shows live events. Third layer shows player contribution breakdown. The screen should feel narratively alive without becoming noisy.

### Scoring chips and badges

Fantasy points appear in bold, compact chips. Lock, injury, and availability statuses use clearly differentiated semantic colors and concise labels.

## 7. Accessibility approach

- Maintain WCAG 2.2 AA contrast across all semantic states.
- Draft room focus order follows the actual pick workflow: clock, queue, player board, pick action.
- Live scoring updates should announce score changes politely to screen readers without flooding the queue.
- Keyboard users must be able to move through draft queueing and pick actions without pointer input.
- Reduced motion mode removes decorative transitions while preserving functional state changes.
