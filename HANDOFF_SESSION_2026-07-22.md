# Session Handoff — 2026-07-22

`main` is clean and in sync with `origin/main` (`26f56d7`). One PR open awaiting merge decision, one branch pushed with no PR yet. Nothing local-only, nothing uncommitted.

## What this session did

Started as a repo cleanup (branches, worktrees, stale dirs), then expanded into two full build-out efforts at the user's request, each following the same discipline: **discover the real state → write a packet-graph plan → adversarially review it against the live codebase → execute → verify → repeat.**

## Track 1: betting model (`nwsl-model/`)

Plan: [`plans/2026-07-22-model-lab/`](plans/2026-07-22-model-lab/) — manifest + 13 packets + `REVIEW_NOTES.md` + `HANDOFF.md` + `LAB_REPORT.md`.

**Merged to `main` (PR [#13](https://github.com/zachringnight/nwsl-fantasy-platform/pull/13), waves 1-2):**
- Fixed the plan-breaking bug the review caught: baseline models never settled bets in the backtest at all (`_evaluate_baseline_fold` had no staker, never called settlement). Every packet downstream of that depended on evidence that silently never existed. Fixed, verified with a real settled-P&L test.
- Data refreshed through 2026-07-19.
- `spi_lite_baseline` promoted to a first-class, gate-able candidate.
- Nested chronological threshold tuning, a fitted market-residual model, a calibrated totals model — all new, all wired in.
- Fixed a live FOX Sports scraper bug (abbreviated month names broke date parsing).

**Merged to `main` (PR [#14](https://github.com/zachringnight/nwsl-fantasy-platform/pull/14), 4 rounds of Copilot/Codex review fixes):** missing `fastapi` dependency, `api/deps.py` 404 on `baseline_promoted` kind, baseline settlement probabilities not matching the reported `probs_override` (fixed via a matrix rescale), a broken per-component `1/3` fallback surfaced by that fix, a private cross-module import promoted to `score_matrix.rescale_matrix_to_targets`, lambdas not recomputed after rescale (corrupted totals MAE), and two rounds of the API not loading the artifact's own `spi_lite_summary.json`/`config_snapshot.json`.

**Executed and out for review (PR [#15](https://github.com/zachringnight/nwsl-fantasy-platform/pull/15), wave 3 — not yet merged):**
- Packet 10: June-July 2026 closing-odds backfill via direct OddsPortal HTTP (no tokens). Coverage for that window went 0% → 100%.
- Packet 11: full evidence lab run, written to `plans/2026-07-22-model-lab/LAB_REPORT.md`.
- Packet 12: docs reorganized under `docs/`, root `CLAUDE.md` added, `nwsl-model/Makefile` added, `nwsl-model/README.md` rewritten.
- Full suite: **358 passed**.

**The actual verdict (`LAB_REPORT.md`), unchanged by any threshold/config edits:**
> Reject promotion this round. Slate stays fail-closed. Bet settlement is real now (previously silently zero). With real settlement: `spi_lite_baseline` backtests at -26.9% ROI, `market_residual` at -18.6%. Nested out-of-sample threshold tuning found no model/market combo clearing the +5%-unit ROI bar anywhere. The baseline promotion gate fails on two independent grounds (OOS evidence was collected for the wrong model this run, and the numbers miss their own thresholds regardless). Totals model: no-vig market still beats it, stays suppressed. Pure models (`dixon_coles`, `bivariate_poisson`) stay `research_only`, losing to baseline on every metric.

**Not started: wave 4** (final verification — regenerate predictions/slate, fail-closed invariant checks, full test suite one more time after PR #15 merges). Read `plans/2026-07-22-model-lab/HANDOFF.md` to resume; packet 13 is the only one left.

## Track 2: fantasy/DFS product

Plan: [`plans/2026-07-22-fantasy-dfs/`](plans/2026-07-22-fantasy-dfs/) — manifest + 14 packets + `REVIEW_NOTES.md` + `HANDOFF.md` + `RLS_SECURITY_NOTE.md` + `DATA_SOURCE_DECISION.md`.

**The central finding:** this product looks complete but the scoring layer was entirely fabricated. `src/lib/fantasy-season-sim.ts` generated every classic-league standing and matchup score via a deterministic hash function — live code in the real, Supabase-backed app, not a demo path. The DFS "leaderboard" component was literally named `SalaryCapMatchupPlaceholder` and rendered hardcoded fake data with zero real props. Six Supabase tables that shipped code depended on (trades, chat, achievements) didn't exist in any tracked migration or in the live database.

**Executed and pushed (branch `codex/fantasy-dfs-wave0`, commit `000e231` — no PR opened yet):**
- Packet 01: ran real, live HTTP calls against the official NWSL API to determine exactly which fantasy scoring categories have real per-match data vs. must be approximated. Findings in `DATA_SOURCE_DECISION.md`. **Load-bearing correction for packet 04**: the numeric `match_id` in `matches.csv` (ESPN-keyed) is not what the official API's `/lineups` endpoint expects — packet 04 needs the UUID-style `matchId` from `fetch_season_matches()` instead (e.g. `"nwsl::Football_Match::994672fd..."`).
- Packet 02: created the 6 missing tables live against the real Supabase project (`fantasy_chat_messages`, `fantasy_achievements`, `fantasy_streaks`, `fantasy_trade_proposals`, `fantasy_trade_assets`, `fantasy_trade_votes`), RLS enabled, membership-scoped policies, applied via migration and confirmed via `list_tables`.
- Packet 03: fixed a trades query that would have silently returned empty forever (`fantasy_teams` doesn't exist, needed `fantasy_league_memberships` + `.team_name` not `.name`); removed dead/orphaned code (`demo-data.ts`, a scaffold `src/jobs/` directory distinct from the real `src/lib/jobs/`, the NextAuth Credentials provider that had a password-bypass bug); added a stopgap `isAdminEmail()` allowlist gate (explicitly not real RBAC, per instruction below).
- Two findings deliberately left unfixed per explicit instruction ("don't worry about security or RLS concerns"): packet 10's admin-override table has no DB-level write authorization beyond that client-side allowlist, and packet 05's cross-user notification writes don't fit this schema's existing RLS convention. Both documented in `REVIEW_NOTES.md`, not silently dropped — worth a real look before this touches production traffic for real.

**Not started: packets 04-14** (real scoring ingest through final verification). To resume, read `plans/2026-07-22-fantasy-dfs/HANDOFF.md`, open a PR for `codex/fantasy-dfs-wave0` first (it's currently just a pushed branch), then continue with wave 1.

## A note on the mid-session incident (fully resolved, no open risk)

Mid-session, two `Workflow` runs were active concurrently in the same working directory (model-lab wave 3 and fantasy-dfs wave 0, no worktree isolation). When fantasy-dfs wave 0 finished first, an attempt to clean up after committing it directly to `main` used `git reset --hard` while wave 3 was still writing to already-tracked files, wiping wave 3's in-progress odds backfill and doc changes, and — it turned out separately — local `main` had also never been fast-forwarded past PR #13 in the first place, so PR #14's merged fixes were briefly missing from the working tree too.

Both are fully repaired: the odds backfill was re-run and re-verified (100% June-July coverage confirmed twice), the docs work was redone, local `main` was fast-forwarded to `origin/main` with zero conflicts (verified no file overlap before doing it), and the full suite passed at 358/358 afterward. Lesson for future sessions: don't run two `Workflow`s unisolated against the same branch, and never `git reset --hard` without confirming nothing else is concurrently writing to the same tree.

## Everything else worth knowing

- This is a **shared, multi-tenant production Supabase project** (`PrizmLounge`, `rnfvmqflktghriqefatc`) — dozens of unrelated tables from the user's other apps (Panini, NBA/NCAA props, World Cup, UGC pipelines) live in the same `public` schema. Any new migration must be additive-only, `fantasy_`-prefixed, RLS-on-from-creation.
- Unrelated finding surfaced during verification, explicitly out of scope for both plans: 33 tables in that same Supabase project have RLS disabled (none are fantasy-related — they belong to other apps). Documented in `plans/2026-07-22-fantasy-dfs/RLS_SECURITY_NOTE.md`, not acted on.
- `vercel.json` now has a conditional `ignoreCommand` — builds are skipped only when `VERCEL_ENV=production`, so PR previews still work but merges to `main` no longer auto-deploy to production.
- Repo cleanup from earlier this session: stale branches converted to tags (`archive/*`), a rescued Codex worktree became branch `codex/sports-card-motion` (unmerged, still available), `.gitignore` extended to cover model logs/artifacts/tuning output.
- No standing `/goal` is active — it was set once mid-session and explicitly cleared by the user later on.

## Branch map (as of end of session)

| Branch | State |
|---|---|
| `main` | Clean, synced with `origin/main` at `26f56d7` |
| `codex/model-lab-wave3-docs-backfill` | Pushed, PR [#15](https://github.com/zachringnight/nwsl-fantasy-platform/pull/15) open, not merged |
| `codex/fantasy-dfs-wave0` | Pushed, no PR opened yet |
| `codex/sports-card-motion` | Pushed, unmerged, unrelated rescued work |
