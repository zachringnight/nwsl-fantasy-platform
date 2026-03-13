import type { ReactNode } from "react";
import { AppShell } from "@/components/common/app-shell";
import { LeagueSubnav } from "@/components/league/league-subnav";
import { formatTitleFromSlug } from "@/lib/utils";

export interface LeaguePageShellProps {
  leagueId: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function LeaguePageShell({
  leagueId,
  eyebrow,
  title,
  description,
  children,
}: LeaguePageShellProps) {
  return (
    <AppShell
      eyebrow={eyebrow}
      title={title}
      description={`${description} • ${formatTitleFromSlug(leagueId)}`}
      actions={<LeagueSubnav leagueId={leagueId} />}
    >
      {children}
    </AppShell>
  );
}
