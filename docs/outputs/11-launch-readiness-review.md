# Launch Readiness Review

Date: 2026-03-14
Branch: `codex/signup-rollout-launch`

## Scope

- Authentication and recovery flows
- Critical API surfaces
- Dependency and security audit
- Deployment and repo hygiene
- Test and build verification

## Review Plan Executed

1. Inventory deploy, auth, data, and testing surfaces.
2. Run static verification: lint, typecheck, tests, build, Prisma validation, coverage.
3. Review critical auth and privileged API routes.
4. Run production dependency audit.
5. Fix clear launch blockers and rerun verification.

## Fixes Applied During Review

- Disabled the legacy `NextAuth` catch-all route at `src/app/api/auth/[...nextauth]/route.ts`.
  - Reason: the app now authenticates with Supabase directly, and the unused credentials provider path was not appropriate to keep exposed for launch.
- Upgraded `nodemailer` from `7.0.10` to `7.0.11`.
  - Reason: closes the direct high-severity advisory reported by `pnpm audit --prod`.
- Changed `src/app/api/notifications/route.ts` to return real `500` responses for server failures instead of silent `200` fallbacks.
  - Reason: prevents masked production failures and improves monitoring/debuggability.
- Added GitHub Actions CI in `.github/workflows/ci.yml`.
  - Reason: launch handoff should have automated checks on PRs and branch pushes.

## Verification Run

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm prisma:validate`
- `pnpm audit --prod`

## Result

### Ready

- Core code quality checks pass.
- Production build passes.
- Prisma schema validates.
- Critical auth recovery flow has regression coverage from the prior hardening pass.
- The branch is now set up for automated GitHub validation.

### Remaining Risks

1. `pnpm audit --prod` still reports unresolved Prisma transitive advisories through `@prisma/client -> prisma -> @prisma/dev -> hono`.
   - Current latest `prisma` and `@prisma/client` available in the registry are still `7.5.0`, so there is no direct patch to apply from this repo today.
   - This is the main remaining launch risk that was not fixable in-repo during this review.
2. Test coverage is still low overall (`15.66%` statements).
   - Critical auth/recovery paths are better covered than before, but broad product flows still lack end-to-end automation.
3. There is no committed browser E2E suite yet.
   - Manual smoke testing is still required for signup, onboarding, create league, join league, and notifications.

## Launch Verdict

Conditionally ready for launch.

The app code and build pipeline are in a strong enough state to hand off and ship, but launch owners should explicitly accept the unresolved Prisma transitive audit findings until Prisma publishes patched downstream packages.
