"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { primaryNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { NavLink } from "@/components/common/nav-link";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { hasHydrated, profile, session, signOut, user } = useFantasyAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-4 lg:px-5">
      <div className="page-shell pointer-events-auto glass-card edge-field surface-ring rounded-[1.75rem] border border-line bg-panel/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <Link href="/" className="space-y-2">
              <div className="space-y-1">
                <p className="font-display text-4xl uppercase leading-none tracking-[0.02em] text-foreground sm:text-[3.4rem]">
                  {siteConfig.shortName}
                </p>
                <p className="text-sm text-muted">{siteConfig.launchWindow}</p>
              </div>
            </Link>

            {/* Desktop auth controls */}
            <div className="hidden items-center gap-3 md:flex">
              {hasHydrated && profile ? (
                <div className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted">
                  {user?.is_anonymous ? "Guest" : profile.display_name}
                </div>
              ) : null}
              {hasHydrated && !session ? (
                <Link
                  href="/login"
                  className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand"
                >
                  Sign in
                </Link>
              ) : null}
              {hasHydrated && !session ? (
                <Link
                  href="/signup"
                  className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
                >
                  Create account
                </Link>
              ) : null}
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

            {/* Mobile menu button */}
            <button
              className="flex size-10 items-center justify-center rounded-full border border-line bg-white/6 text-foreground transition hover:border-brand-strong/40 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>

          {/* Mobile menu panel */}
          {mobileMenuOpen ? (
            <div className="flex flex-col gap-3 border-t border-line pt-4 md:hidden">
              {hasHydrated && profile ? (
                <div className="rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm text-muted">
                  {user?.is_anonymous ? "Guest" : profile.display_name}
                </div>
              ) : null}
              {hasHydrated && !session ? (
                <div className="flex gap-3">
                  <Link
                    href="/login"
                    className="flex-1 rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="flex-1 rounded-full bg-brand px-4 py-2 text-center text-sm font-semibold text-white transition"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Create account
                  </Link>
                </div>
              ) : null}
              {hasHydrated && session ? (
                <button
                  className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signOut();
                  }}
                  type="button"
                >
                  Sign out
                </button>
              ) : null}
              <div className="flex gap-3">
                <Link
                  href="/settings"
                  className="flex-1 rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm text-muted transition hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Settings
                </Link>
                <Link
                  href="/notifications"
                  className="flex-1 rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm text-muted transition hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Notifications
                </Link>
              </div>
            </div>
          ) : null}

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
        </div>
      </div>
    </header>
  );
}
