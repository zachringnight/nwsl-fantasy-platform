"use client";

import { usePathname } from "next/navigation";
import { buildLeagueNavigation } from "@/config/navigation";
import { NavLink } from "@/components/common/nav-link";

export interface LeagueSubnavProps {
  leagueId: string;
}

export function LeagueSubnav({ leagueId }: LeagueSubnavProps) {
  const pathname = usePathname();
  const items = buildLeagueNavigation(leagueId);

  return (
    <nav
      aria-label="League navigation"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.shortLabel}
          isActive={pathname === item.href}
        />
      ))}
    </nav>
  );
}
