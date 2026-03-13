import Link from "next/link";
import { Clock3, Sparkles, Trophy } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";

export interface SalaryCapMatchupPlaceholderProps {
  modeDescription: string;
  playersHref: string;
  teamHref: string;
}

export function SalaryCapMatchupPlaceholder({
  modeDescription,
  playersHref,
  teamHref,
}: SalaryCapMatchupPlaceholderProps) {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <SurfaceCard
        description="Salary-cap contests follow your entry against the slate field, so this view focuses on rank movement and lock status instead of weekly head-to-head scoring."
        eyebrow="Salary-cap live view"
        title="Follow your entry through lock, climb, and final"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Clock3 className="size-3.5" />
                Lock story
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                See whether your entry is still editable, submitted, or locked for the current slate.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Trophy className="size-3.5" />
                Contest results
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                Track your place in the field, the scoring swings behind it, and your final finish once the slate settles.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Sparkles className="size-3.5" />
                Score drivers
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                The players pushing your lineup up or down stay visible without needing to leave the slate view.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link className={getButtonClassName()} href={teamHref}>
              Open entry hub
            </Link>
            <Link
              className={getButtonClassName({
                variant: "secondary",
              })}
              href={playersHref}
            >
              Browse player salaries
            </Link>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        description={modeDescription}
        eyebrow="What to expect"
        title="This view opens once your contest is active"
        tone="accent"
      >
        <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
            During live slates
          </p>
          <p className="mt-3 text-sm leading-7 text-white/82">
            Once a salary-cap slate begins, this page becomes your live desk for lock status, ranking movement, and the exact players creating your gains or losses.
          </p>
        </div>
      </SurfaceCard>
    </section>
  );
}
