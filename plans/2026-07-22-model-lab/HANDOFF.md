# Handoff: NWSL Model Lab (2026-07-22)

Execution handoff for the packet graph in this directory. Written for an ultracode/dynamic-workflow run in Claude Code, or any orchestrator that can fan out isolated subagents.

## What this is

- `manifest.md`: goal, constraints, decision record, architecture facts, task index with waves.
- `packets/01-13`: one self-contained task per file. An executor agent reads ONLY the manifest plus its own packet.
- Review status: plan was adversarially reviewed by a four-lens panel on 2026-07-22; amendments were folded into the packets (see REVIEW_NOTES.md).
- Execution status: all four waves are complete. Packet 13 final verification passed on 2026-07-22; see `LAB_REPORT.md`, `verification_summary.json`, and `fail_closed_checks.json`.

## Preflight

- Claude Code v2.1.154+, Opus-class model, effort high or above for code packets.
- Dynamic workflows (ultracode) enabled, Auto Mode on so permission prompts do not stall the run.
- cwd sanity: repo at `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main`, branch `codex/model-pipeline-refresh`, clean tree at start.
- Network available (ESPN, api-sdp.nwslsoccer.com, americansocceranalysis, nwslsoccer.com, foxsports, oddsportal). No tokens needed anywhere in the plan.

## The literal handoff

Tell the orchestrating session:

> Execute the plan at plans/2026-07-22-model-lab/. Read manifest.md, then run the packets as a workflow honoring the task-index waves: wave 1 = packets 01,02,03,04 in parallel; wave 2 = 05,06,07,08,09 in parallel; wave 3 = 10 then 11, with 12 in parallel to 11; wave 4 = 13. Each executor agent gets the manifest content plus its single packet and must end with the packet's done-signal line (DONE / DONE_WITH_CONCERNS / BLOCKED plus packet id). Parse that line; a BLOCKED packet stops its dependents only. After wave 4, assemble the end report from LAB_REPORT.md, verification_summary.json, and the collected done-signals, then commit on codex/model-pipeline-refresh and push.

## Orchestration rules

- Context isolation: never feed an executor another packet or the whole plan.
- No mid-run human gates. The only stop is an unresolvable BLOCKED on the critical path (01/04 -> 06/07/08 -> 11 -> 13).
- Wave boundaries are integration points: after each wave, run the fast pytest loop (`cd nwsl-model && python3 -m pytest -q --ignore=tests/test_models.py --ignore=tests/test_pipeline_smoke.py`) before dispatching the next wave; a red loop means fix-forward with a follow-up agent before proceeding.
- Verification proportional to risk: each packet's own done-check suffices. The heavy adversarial checking already happened at plan time. Packet 11 and 13 outputs are the evidence; do not re-audit green packets.
- Commit policy: one commit per wave (conventional message, no em dashes) keeps the diff reviewable; final push after wave 4. Do not commit `.env.local`, tokens, or `data/processed/models/` (gitignored).
- Runtime expectation: wave 1 minutes; wave 2 dominated by 05 (network) and 06; wave 3 dominated by 11 (up to ~90 min of pipeline runs); wave 4 ~10 min.

## End report (for Zach)

Assemble, do not re-derive: per-packet done-signals with any concerns inline; LAB_REPORT.md verdict section quoted; verification_summary.json numbers; diff stat; the eyeball list (promotion gate changes from 06, any DONE_WITH_CONCERNS, odds backfill coverage number, and whether the slate is still all no_bet). End with options: keep on branch / open PR to main / revise.
