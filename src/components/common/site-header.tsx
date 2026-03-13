"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { NavLink } from "@/components/common/nav-link";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { hasHydrated, profile, session, signOut, user } = useFantasyAuth();
  const sessionLabel = !hasHydrated
    ? "Account • loading"
    : profile
      ? `${user?.is_anonymous ? "Guest manager" : "Manager account"} • ${profile.display_name}`
      : session
        ? "Account live • finish profile"
        : "Account • signed out";

  return (
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-4 lg:px-5">
      <div className="page-shell pointer-events-auto glass-card edge-field surface-ring rounded-[1.75rem] border border-line bg-panel/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <Link href="/" className="space-y-2">
              <p className="inline-flex rounded-full border border-brand-strong/25 bg-brand/15 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-brand-strong">
                {siteConfig.repositoryStatus}
              </p>
              <div className="space-y-1">
                <p className="font-display text-4xl uppercase leading-none tracking-[0.02em] text-foreground sm:text-[3.4rem]">
                  {siteConfig.shortName}
                </p>
                <p className="text-sm text-muted">{siteConfig.launchWindow}</p>
              </div>
            </Link>
            <div className="hidden items-center gap-3 md:flex">
              <div className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted">
                {sessionLabel}
              </div>
              {hasHydrated && session ? (
                <button
                  className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand"
                  onClick={() => {
                    void signOut();
                  }}
                  type="button"
                >
                  Sign out
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav
              aria-label="Primary"
              className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {primaryNavigation.map((item) => {
                const isActive =
                  item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    isActive={isActive}
                  />
                );
              })}
            </nav>
            <div className="flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">
                NWSL fantasy
              </span>
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">
                Classic + salary cap
              </span>
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">
                Live slate timing
              </span>
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">
                Commissioner control
              </span>
            </div>
          </div>
          </div>
      </div>
    </header>
  );
}
