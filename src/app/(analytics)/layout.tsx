"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Brain,
  Gauge,
  GitCompareArrows,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { SeasonSelector } from "@/components/analytics/season-selector";

const analyticsNav = [
  { href: "/analytics", label: "Overview", icon: BarChart3, exact: true },
  { href: "/analytics/players", label: "Players", icon: Users },
  { href: "/analytics/teams", label: "Teams", icon: Trophy },
  { href: "/analytics/matches", label: "Matches", icon: Swords },
  { href: "/analytics/predictions", label: "Predictions", icon: Brain },
  { href: "/analytics/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/analytics/ratings", label: "Ratings", icon: Gauge },
];

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-0">
      <nav
        aria-label="Analytics"
        className="page-shell sticky top-[5.5rem] z-40 border-b border-line bg-panel-strong/80 backdrop-blur-xl"
      >
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {analyticsNav.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-brand/20 text-brand-strong"
                    : "text-muted hover:bg-white/6 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
          <div className="ml-auto shrink-0 pl-4">
            <Suspense>
              <SeasonSelector />
            </Suspense>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
