# Codex Execution Handoff

Implement the packet graph in this directory.

## Source of truth

Read these files before implementation:

1. `manifest.md`
2. `NWSL_Fantasy_Product_Roadmap_v1.md`
3. The packet for the task being executed

The manifest controls scope, dependencies, waves, and global constraints. The packet controls file ownership, interfaces, steps, verification, and reporting.

## Preflight

Before the first packet:

1. Confirm the repository is `/Users/zsoskin/Downloads/nwsl-fantasy-platform-main`.
2. Confirm the branch, worktree, and dirty state.
3. Preserve unrelated user changes.
4. Confirm local dependencies and the existing Supabase and Vercel project links.
5. Confirm Zach wants implementation, not another read-only review.
6. Do not commit, merge, push, or deploy without explicit authorization in the execution thread.

## Execution protocol

Execute waves in manifest order. Tasks in the same wave may run independently only when their file ownership does not overlap. Integrate and verify the whole repository at every wave boundary before starting the next wave.

For each packet:

1. Read the full packet and relevant existing code.
2. Honor the packet's file ownership and interfaces.
3. Make the smallest coherent implementation that satisfies the packet.
4. Run the packet's one done-check.
5. Return one status:
   - `DONE`: implemented and done-check passed.
   - `DONE_WITH_CONCERNS`: implemented and verified, with a bounded concern that does not block integration.
   - `BLOCKED`: cannot finish without a missing dependency, credential, external state, or user decision.
   - `NEEDS_CONTEXT`: the packet lacks a required fact that another packet or the root agent can supply.
6. Include changed files, test evidence, migrations or environment changes, and remaining concerns in the report.

Route statuses as follows:

- Integrate `DONE`.
- Integrate `DONE_WITH_CONCERNS` and add its concern to the wave review.
- Re-run `NEEDS_CONTEXT` after supplying the missing repository or packet context.
- Re-run `BLOCKED` only after resolving its concrete blocker. Escalate to Zach when resolution requires new authority or an external choice.

## Wave review

At every wave boundary:

1. Review the integrated diff once.
2. Run the repository test, lint, and production build gates that are available at that point.
3. Apply pending local migrations to an isolated development database when the wave changes schema.
4. Verify all packet interfaces still match.
5. Record new environment variables, scheduled jobs, migrations, and operational steps.
6. Stop before the next wave if a release-blocking regression remains.

## Release protocol

Packet 19 owns the final release gate. A local build is not production proof.

The final release report must include:

- Full test, lint, type, and production build results.
- Browser E2E and accessibility results for every P0 path.
- Simulation results for classic leagues, draft autopick, waivers, playoffs, salary-cap contests, live scoring, and corrections.
- Migration and scheduled-job status.
- Vercel preview URL and Ready status.
- Production deployment URL and Ready status after authorized merge.
- Canonical-domain smoke checks for public routes and authenticated fantasy paths.
- Known limitations, rollback instructions, and launch metrics.

## First action

Open `packets/01-canonical-data-schema.md`. Confirm its current file paths against the repository. Then implement only packet 01 and run its done-check.
