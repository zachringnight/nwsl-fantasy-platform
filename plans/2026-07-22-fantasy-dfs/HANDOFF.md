# Handoff: Fantasy + DFS Build-Out (2026-07-22)

Execution handoff for the packet graph in this directory. Grounded in a 7-lens discovery pass (`wf_47d50fb7-eed`) plus live verification against the actual Supabase project (`PrizmLounge`, `rnfvmqflktghriqefatc`).

## Execution status

Completed on `codex/fantasy-dfs-wave0`. See `VERIFICATION_SUMMARY.md` for the
release gate, runtime smoke notes, and the exact boundary between real
functionality and documented follow-up work.

## What this is

- `manifest.md`: goal, out-of-scope list, architecture facts, decision record, task index with waves.
- `packets/01-14`: one self-contained task per file.
- `RLS_SECURITY_NOTE.md`: an unrelated security finding surfaced during verification (33 tables with RLS disabled, belonging to other apps in the shared Supabase project) — explicitly out of scope for this build, not acted on.
- Review status: the 4-lens adversarial pass landed in `REVIEW_NOTES.md` before execution.

## Preflight

- Claude Code v2.1.154+, high-to-xhigh effort for code packets.
- Node/pnpm environment: `pnpm install` first (this repo's `node_modules` may be absent).
- Supabase MCP access needed for packets 02, 04, 10 (schema migrations against the live project) — if unavailable in the execution session, those packets should write the migration file and report BLOCKED on the "apply to live project" step specifically, not on the whole packet.
- Packet 01 needs live network access (one HTTP call to `api-sdp.nwslsoccer.com`) to make its data-source decision — everything in wave 1+ depends on its output.

## The literal handoff

> Execute the plan at plans/2026-07-22-fantasy-dfs/. Read manifest.md, then run packets as a workflow honoring the task-index waves: wave 0 = packets 01, 02, 03 in parallel; wave 1 = 04, 05 in parallel (both depend on 01/02); wave 2 = 06, 07, 08, 09, 10 in parallel (all depend on 04, some on 02); wave 3 = 11, 12, 13 in parallel; wave 4 = 14. Each executor agent gets the manifest plus its single packet and ends with the done-signal line. A BLOCKED packet stops its direct dependents only. After wave 4, assemble the end report, commit, and (if the model-lab plan in this same repo is also mid-execution) coordinate commits so neither plan's changes get lost in the other's.

## Orchestration rules
Same as the model-lab plan's HANDOFF.md: context isolation, no mid-run human gates except an unresolvable BLOCKED, wave-boundary integration checks (`pnpm test && pnpm typecheck` after each wave), one commit per wave, verification proportional to risk (each packet's own check suffices; the adversarial review already happened at plan time).

## End report (for Zach)
Per-packet done-signals with concerns inline; `VERIFICATION_SUMMARY.md`'s real-vs-still-mock section quoted in full (this is the part that actually answers "is it real now"); diff stat; the eyeball list (any schema migration applied to the shared production database, the packet-01 data-source decision, any achievement left un-wireable, the DFS availability-enforcement policy choice from packet 11). End with options: keep on branch / open PR / revise.
