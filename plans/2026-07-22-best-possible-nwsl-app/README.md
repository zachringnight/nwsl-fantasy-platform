# Best Possible NWSL Fantasy App Roadmap

Status: planning complete, implementation intentionally deferred.

This package is the source of truth for the next major product build. It turns the product vision into 19 independently verifiable implementation packets across 9 dependency-safe waves.

## Reading order

1. `PLAN_STATUS.md`: current handoff state, locked decisions, assumptions, and restart checklist.
2. `NWSL_Fantasy_Product_Roadmap_v1.md`: product vision, phases, outcomes, metrics, and release gates.
3. `manifest.md`: architecture, constraints, task ownership, dependencies, waves, and release slices.
4. `REVIEW_NOTES.md`: consolidated plan review and retained human decisions.
5. `VERIFICATION_SUMMARY.md`: structural and repository-gate evidence.
6. `HANDOFF.md`: exact runner protocol and release expectations.
7. `packets/`: self-contained implementation tasks with files, interfaces, steps, done-checks, and report contracts.

## Package map

| File | Purpose |
|------|---------|
| `PLAN_STATUS.md` | Records what is complete now and what must be refreshed before implementation. |
| `NWSL_Fantasy_Product_Roadmap_v1.md` | Explains what the best version of the product is and how success is measured. |
| `manifest.md` | Defines the implementation graph and global technical decisions. |
| `REVIEW_NOTES.md` | Records the final review, resolved findings, and non-blocking concerns. |
| `VERIFICATION_SUMMARY.md` | Records plan validation and repository gate results. |
| `HANDOFF.md` | Tells a future Codex runner how to execute and report the graph. |
| `packets/01-*.md` through `packets/19-*.md` | Define the exact work and verification for each task. |

## Release slices

1. Trusted public NWSL hub.
2. Fantasy that runs itself.
3. Free-to-play contest and engagement layer.
4. Premium beta and production launch.

## Boundaries

- No implementation is included in this planning PR.
- Supabase remains the live backend.
- Vercel preview deployments remain enabled as release gates.
- Authentication and RLS redesign are out of scope.
- Real-money contests and betting execution are out of scope.
- Existing basketball reference and motion work must not be deleted.
- NWSL motion must remain soccer-specific and respect reduced-motion preferences.

## Restart point

When implementation is authorized, begin with packet 01 only. Revalidate the repository baseline and migration ordering first. Do not start UI work until the canonical schema and contracts pass their done-check.
