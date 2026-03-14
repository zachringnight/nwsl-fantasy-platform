"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";
import { primaryNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { NavLink } from "@/components/common/nav-link";
import { NotificationBadge } from "@/components/ui/notification-badge";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { hasHydrated, profile, session, signOut, user } = useFantasyAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function checkNotifications() {
      try {
        const res = await fetch(`/api/notifications?userId=${user!.id}&unreadOnly=true&limit=1`);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { notifications: unknown[] };
          setUnreadCount(data.notifications.length);
        }
      } catch {
        // Silently fail — badge is informational
      }
    }

    void checkNotifications();
    const interval = setInterval(checkNotifications, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const menu = mobileMenuRef.current;
    if (!menu) return;

    // Focus first focusable element when menu opens
    const focusable = menu.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !menu) return;

      const focusableElements = menu.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-4 lg:px-5">
      <div className="page-shell pointer-events-auto glass-card edge-field surface-ring rounded-[1.75rem] border border-line bg-panel/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <Link href="/" className="space-y-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55">
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
                <>
                  <Link
                    href="/notifications"
                    aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
                    className="relative rounded-full border border-line bg-white/6 p-2 text-muted transition hover:border-brand/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                  >
                    <Bell className="size-4" />
                    <NotificationBadge count={unreadCount} />
                  </Link>
                  <div className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted">
                    {user?.is_anonymous ? "Guest" : profile.display_name}
                  </div>
                </>
              ) : null}
              {hasHydrated && !session ? (
                <Link
                  href="/login"
                  className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                >
                  Sign in
                </Link>
              ) : null}
              {hasHydrated && !session ? (
                <Link
                  href="/signup"
                  className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                >
                  Create account
                </Link>
              ) : null}
              {hasHydrated && session ? (
                <button
                  className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
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
              ref={menuButtonRef}
              className="flex size-10 items-center justify-center rounded-full border border-line bg-white/6 text-foreground transition hover:border-brand-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>

          {/* Mobile menu panel */}
          {mobileMenuOpen ? (
            <div ref={mobileMenuRef} id="mobile-menu" role="dialog" aria-label="Navigation menu" className="flex flex-col gap-3 border-t border-line pt-4 md:hidden">
              {hasHydrated && profile ? (
                <div className="rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm text-muted">
                  {user?.is_anonymous ? "Guest" : profile.display_name}
                </div>
              ) : null}
              {hasHydrated && !session ? (
                <div className="flex gap-3">
                  <Link
                    href="/login"
                    className="flex-1 rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                    onClick={closeMobileMenu}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="flex-1 rounded-full bg-brand px-4 py-2 text-center text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                    onClick={closeMobileMenu}
                  >
                    Create account
                  </Link>
                </div>
              ) : null}
              {hasHydrated && session ? (
                <button
                  className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                  onClick={() => {
                    closeMobileMenu();
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
                  className="flex-1 rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm text-muted transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Settings
                </Link>
                <Link
                  href="/notifications"
                  className="relative flex-1 rounded-full border border-line bg-white/6 px-4 py-2 text-center text-sm text-muted transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-danger px-1 py-0.5 text-[0.6rem] font-bold leading-none text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
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
