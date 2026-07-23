# Session Handoff — 2026-07-22

Branch: `codex/model-pipeline-refresh`. PR: [#13](https://github.com/zachringnight/nwsl-fantasy-platform/pull/13) (draft). Everything below is committed and pushed — nothing local-only, nothing in progress.

## What this session did

Started as a repo cleanup (branches, worktrees, stale dirs), then expanded into two full build-out efforts at the user's request, each following the same discipline: **discover the real state → write a packet-graph plan → adversarially review it against the live codebase → execute → verify → repeat.**

## Track 1: betting model (`nwsl-model/`)

Plan: [`plans/2026-07-22-model-lab/`](plans/2026-07-22-model-lab/) — manifest + 13 packets + `REVIEW_NOTES.md` + `HANDOFF.md`.

**Landed (waves 1-2, commits `5e78783`, `5b1ced2`, `b51f956`):**
- Fixed the plan-breaking bug the review caught: baseline models never settled bets in the backtest at all (`_evaluate_baseline_fold` had no staker, never called settlement). Every packet downstream of that depended on evidence that silently never existed. Fixed, verified with a real settled-P&L test.
- Data refreshed through 2026-07-19.
- `spi_lite_baseline` promoted to a first-class, gate-able candidate.
- Nested chronological threshold tuning, a fitted market-residual model, a calibrated totals model — all new, all wired in.
- Fixed a live FOX Sports scraper bug (abbreviated month names broke date parsing).
- 330 tests passing (fast loop), full suite green.

**Not started: waves 3-4.**
- Wave 3: June-July 2026 closing-odds backfill (direct HTTP, no tokens — packet 03 already built this path), then the full evidence lab run (fresh training artifact, backtest, season holdout, threshold tuning, totals eval — this is what actually answers "should SPI-lite/market-residual be promoted," written to `LAB_REPORT.md`), then a docs/README pass.
- Wave 4: final verification (regenerate predictions/slate, fail-closed invariant checks, full test suites).
- **A wave 3 attempt was started and stopped mid-flight this session** (see "In-flight work that was stopped" below) — nothing was lost, but note it before re-launching so you don't duplicate effort.
- To resume: read `plans/2026-07-22-model-lab/HANDOFF.md`, it has the literal handoff instruction.

## Track 2: fantasy/DFS product

Plan: [`plans/2026-07-22-fantasy-dfs/`](plans/2026-07-22-fantasy-dfs/) — manifest + 14 packets + `REVIEW_NOTES.md` + `HANDOFF.md` + `RLS_SECURITY_NOTE.md`.

**The central finding:** this product looks complete but the scoring layer is entirely fabricated. `src/lib/fantasy-season-sim.ts` generates every classic-league standing and matchup score via a deterministic hash function — this is live code in the real, Supabase-backed app, not a demo path. The DFS "leaderboard" component is literally named `SalaryCapMatchupPlaceholder` and renders hardcoded fake data with zero real props. Six Supabase tables that shipped, real code depends on (trades, chat, achievements) don't exist in any tracked migration or in the live database — confirmed directly against the live Supabase project (`PrizmLounge`, `rnfvmqflktghriqefatc`) — so those three features 500 on first real use today.

**Plan status: written and adversarially reviewed. Zero packets executed.**
- Review caught real bugs before any code was written: a trades query that would silently return empty forever (wrong column name), a missing database column three packets each independently assumed existed, a phantom "settlement checkpoint" nothing produced (would have caused achievement/streak double-counting).
- Two findings were **deliberately left unfixed** per explicit user instruction ("don't worry about security or RLS concerns" — said twice, mid-session): packet 10's admin-override table has no DB-level write authorization beyond a client-side allowlist, and packet 05's cross-user notification writes don't fit this schema's existing RLS convention. Both are documented in `REVIEW_NOTES.md`, not silently dropped. Worth a real look before anything here touches production traffic.
- To start: read `plans/2026-07-22-fantasy-dfs/HANDOFF.md`.

## In-flight work that was stopped (nothing lost)

Wave 3 of the model-lab plan was launched, then stopped almost immediately at the user's request (they asked for a commit+PR+handoff instead of continued autonomous execution). At the moment it was stopped:
- Packet 10 (odds backfill) had started fetching but never reached its merge step — no `odds.csv` change had happened. Four partial/interrupted raw-scrape JSON/CSV files were reverted to their last-committed state since they were incomplete scratch output, not a finished unit of work.
- Packets 11 (lab run) and 12 (docs) had not started.
- Nothing tested, verified, or committed was touched by this. Waves 1-2's results are exactly as described above.

## A standing `/goal` may still be active

Earlier in this session the user ran `/goal` with the condition "finish the full build and polish it up without waiting for me." That goal was never explicitly cleared. If you're an AI coder picking this up in a **new** session, this doesn't carry over. If you're continuing **this same session**, be aware a Stop hook may still be pushing toward full autonomous completion of both tracks — the user's later, more specific instructions (commit, PR, prepare this handoff) should take precedence; run `/goal clear` if that hook's pressure is unwanted.

## Everything else worth knowing

- This is a **shared, multi-tenant production Supabase project** — dozens of unrelated tables from the user's other apps (Panini, NBA/NCAA props, World Cup, UGC pipelines) live in the same `public` schema. Any new migration must be additive-only, `fantasy_`-prefixed, RLS-on-from-creation.
- Unrelated finding surfaced during verification, explicitly out of scope for both plans: 33 tables in that same Supabase project have RLS disabled (none are fantasy-related — they belong to other apps). Documented in `plans/2026-07-22-fantasy-dfs/RLS_SECURITY_NOTE.md`, not acted on.
- Repo cleanup from earlier this session: stale branches converted to tags (`archive/*`), a rescued Codex worktree became branch `codex/sports-card-motion` (unmerged, still available), `.gitignore` extended to cover model logs/artifacts/tuning output.
