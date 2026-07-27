# Design and motion audit — July 26, 2026

## Direction

The site already has a distinctive dark NWSL/fantasy visual language. The useful
next step is not more ambient decoration; it is **meaningful live-data motion**:
score changes, refresh states, loading states, and clear interaction feedback.
This pass preserves the existing palette, typography declarations, card shapes,
spacing, and page composition.

The one signature analytics moment is the live match scoreline. Celebration,
foil tilt, floating league scenery, and confetti remain confined to the fantasy
and draft contexts where they have a clear purpose.

## Inventory

| System | Production use before this pass | Finding |
| --- | --- | --- |
| `MotionReveal` | 39 call sites across dashboard, onboarding, player-pool, and league routes | Mature and broadly used. Analytics did not use its dormant `scale` variant. |
| `ScrollReveal` | Five route/component consumers | Underused and not progressively enhanced: critical content could remain at `opacity: 0` if JavaScript or `IntersectionObserver` failed. |
| Page and section entrance CSS | Root layout, AppShell headings, and home page | Three overlapping entrance systems (`page-enter`, `section-fade`, and `MotionReveal`) can stack. New use should be restrained. |
| Ambient CSS motion | Global body/header plus league ribbons, orbs, floats, and stickers | Already site-wide, not dormant. It needed complete reduced-motion handling. |
| `AnimatedScore` | League standings only | Strong data-change primitive that was missing from live match scores. |
| Confetti | Draft room only | The intended 2.5-second burst was canceled after about 100 ms. |
| Skeletons and spinners | Five loading boundaries plus several one-off pulse loaders | Useful and visually aligned, but analytics had no local loading boundary. |
| Player foil card | Fantasy player detail | The strongest specialty effect. Pointer, coarse-device, and reduced-motion behavior are already well contained. |
| Recharts motion | Model, ratings, compare, team, and player analytics | Browser animation defaults ignored the user’s reduced-motion setting. |
| Player-card stagger | League player pool | Delay grew with every result; a full current pool could delay the last card by more than 13 seconds. |
| Swipe and pull-to-refresh | Swipe has two consumers; pull-to-refresh has none | Gestures must remain enhancements to visible keyboard/tap controls, not replacements. |
| Storybook | Four basic stories | Static build was broken by mixed Storybook 8 and 10 packages; motion, loading, foil, and live states were undiscoverable. |
| Motion tokens | CSS plus unused TypeScript/JSON copies | Timings are mostly hardcoded, and the duplicate typed/token files have drifted from the canonical CSS. |
| Declared fonts | Jost, Teko, and IBM Plex Mono roles in `globals.css` | The files are not loaded by the app, so rendering falls through to local/system fonts. Activating them could visibly reflow the entire product. |

Confirmed dormant or orphaned implementation includes
`use-pull-to-refresh.ts`, `team-crest.tsx`, `fantasy-projections.tsx`,
`classic-league-brief.tsx`, and `league-command-center.tsx`. The typed and JSON
design-token exports also have no runtime consumers.

## Activated in this pass

- Completed the reduced-motion contract for ambient effects, page entrances,
  shimmer, reveals, score pops, pulse/spin loaders, transitions, confetti, and
  Recharts.
- Made `ScrollReveal` progressively enhanced: server/no-JavaScript content is
  visible, unsupported observers and reduced-motion users remain visible, and
  an observer safety timeout prevents permanently hidden content.
- Added one phase-aware live-score treatment with `MotionReveal`,
  `AnimatedScore`, and a polite `LiveRegion`.
- Added an analytics loading boundary using the existing skeleton system.
- Capped player-card reveal delay at 280 ms and removed persistent
  `will-change`.
- Allowed the draft confetti burst to complete while suppressing it for
  reduced-motion users.
- Improved analytics tabs, season controls, and player/match filters with
  visible focus, `aria-current`, `aria-pressed`, explicit labels, live result
  counts, and truthful filtered-empty reset states.
- Repaired Storybook on one 10.2.19 dependency line, enabled docs and
  accessibility checks, and added stories for MotionReveal, ScrollReveal,
  AnimatedScore, Skeleton, and PlayerSpotlightCard.

## Deliberately deferred

- **Font loading:** loading the declared families is likely the largest latent
  brand change, but it can alter line breaks, card heights, and information
  density. It needs approved desktop/mobile visual diffs before release.
- **Club identity expansion:** analytics logos and avatars should wait until the
  2026 club map and assets cover Boston Legacy, Denver Summit, and the Chicago
  Stars naming transition.
- **URL-backed filters and player pagination:** both are valuable usability
  projects, but they change navigation/data-table behavior rather than the
  motion system and deserve focused acceptance tests.
- **Pull-to-refresh:** keep dormant until it has an equally visible refresh
  control, keyboard path, status announcement, and failure state.
- **Orphan/token deletion:** confirm there are no external Storybook/design
  consumers before deleting files or choosing a generated token source.
- **Additional analytics effects:** confetti, foil tilt, floating scenery, and
  per-row reveal are intentionally excluded from the research/data experience.

## Verification contract

- Unit tests for reduced-motion preference changes, observer success/fallback,
  confetti suppression/completion, live score semantics, and filter reset
  states.
- TypeScript, ESLint, production Next.js build, and static Storybook build.
- Storybook doctor with all packages on one major/version line.
- Production review at mobile and desktop widths in normal and reduced-motion
  modes before activating the deferred typography or club-identity changes.
