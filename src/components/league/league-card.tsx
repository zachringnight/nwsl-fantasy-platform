import Link from "next/link";
import { ArrowRight, Radio, Shield, Sparkles } from "lucide-react";
import type { DemoLeague } from "@/types/fantasy";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export interface LeagueCardProps {
  league: DemoLeague;
}

export function LeagueCard({ league }: LeagueCardProps) {
  const isCommissionerRoom = league.status.toLowerCase().includes("commissioner");

  return (
    <SurfaceCard
      eyebrow={league.status}
      title={league.name}
      description={league.nextAction}
    >
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Pill tone={isCommissionerRoom ? "accent" : "brand"}>
              {isCommissionerRoom ? <Shield className="size-3.5" /> : <Radio className="size-3.5" />}
              {league.record}
            </Pill>
            <Pill>
              <Sparkles className="size-3.5" />
              {league.draftStatus}
            </Pill>
          </div>

          <div className="rounded-[1.4rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
              Next action
            </p>
            <p className="mt-3 text-base leading-7 text-foreground">{league.nextAction}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[1.4rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
              Your role
            </p>
            <p className="mt-3 text-2xl font-semibold leading-none text-foreground">
              {league.status}
            </p>
          </div>
          <Link
            href={`/leagues/${league.id}`}
            className={getButtonClassName({
              className: "group justify-center",
              variant: "secondary",
            })}
          >
            Open league
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </SurfaceCard>
  );
}
