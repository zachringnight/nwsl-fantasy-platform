/**
 * Minimal admin-access check.
 *
 * STOPGAP ONLY: this is a hardcoded email allowlist, not a real RBAC
 * system. There is no `is_admin` column on any profile table (Supabase or
 * Prisma) today. Anyone whose email appears in `NEXT_PUBLIC_ADMIN_USER_EMAILS`
 * (comma-separated) is treated as an admin. A database-backed role system
 * is out of scope for this pass — see plans/2026-07-22-fantasy-dfs/manifest.md.
 *
 * The env var is intentionally `NEXT_PUBLIC_`-prefixed because the admin
 * gate runs in a client component (`/admin` has no server-rendered guard);
 * treat this as a UI-level convenience gate, not a security boundary.
 */
function getAdminAllowlist(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_USER_EMAILS ?? "";

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return getAdminAllowlist().includes(email.trim().toLowerCase());
}
