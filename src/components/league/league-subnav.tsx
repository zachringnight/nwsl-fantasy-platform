"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Crown,
  MessageCircle,
  RadioTower,
  Repeat2,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users2,
} from "lucide-react";
import { buildLeagueNavigation } from "@/config/navigation";
import { cn } from "@/lib/utils";

export interface LeagueSubnavProps {
  leagueId: string;
}

const leagueNavMeta = {
  Draft: {
    hint: "Room",
    icon: Crown,
  },
  Home: {
    hint: "Pulse",
    icon: Sparkles,
  },
  Matchup: {
    hint: "Live",
    icon: Swords,
  },
  Moves: {
    hint: "Claims",
    icon: RadioTower,
  },
  Players: {
    hint: "Scout",
    icon: Shield,
  },
  Settings: {
    hint: "Rules",
    icon: Settings2,
  },
  Standings: {
    hint: "Race",
    icon: Trophy,
  },
  Team: {
    hint: "Lineup",
    icon: Users2,
  },
  Trades: {
    hint: "Deals",
    icon: Repeat2,
  },
  Chat: {
    hint: "Talk",
    icon: MessageCircle,
  },
  Badges: {
    hint: "Earn",
    icon: Award,
  },
} as const;

export function LeagueSubnav({ leagueId }: LeagueSubnavProps) {
  const pathname = usePathname();
  const items = buildLeagueNavigation(leagueId);

  return (
    <nav
      aria-label="League navigation"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11"
    >
      {items.map((item) => (
        <LeagueNavCard
          key={item.href}
          href={item.href}
          isActive={
            item.href === `/leagues/${leagueId}`
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
          }
          label={item.shortLabel}
        />
      ))}
    </nav>
  );
}

function LeagueNavCard({
  href,
  isActive,
  label,
}: {
  href: string;
  isActive: boolean;
  label: string;
}) {
  const meta = leagueNavMeta[label as keyof typeof leagueNavMeta] ?? leagueNavMeta.Home;
  const Icon = meta.icon;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "league-nav-card group rounded-[1.45rem] border px-3 py-3 transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55 focus-visible:ring-offset-2 focus-visible:ring-offset-night",
        isActive
          ? "border-white/18 bg-white/14 text-white shadow-[0_22px_60px_rgba(11,28,88,0.35)]"
          : "border-white/10 bg-black/18 text-white/78 hover:border-brand-strong/35 hover:bg-white/10 hover:text-white"
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-[1rem] border transition duration-300",
            isActive
              ? "border-white/14 bg-white/12 text-white"
              : "border-white/10 bg-white/6 text-[#ffd5e5] group-hover:border-white/14 group-hover:bg-white/10"
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
            {meta.hint}
          </p>
          <p className="truncate text-sm font-semibold tracking-[-0.01em]">{label}</p>
        </div>
      </div>
    </Link>
  );
}
