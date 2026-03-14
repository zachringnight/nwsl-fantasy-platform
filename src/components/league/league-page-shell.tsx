import type { ReactNode } from "react";
import { Crown, Heart, RadioTower, Sparkles, type LucideIcon } from "lucide-react";
import { LeagueSubnav } from "@/components/league/league-subnav";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";

export interface LeaguePageShellProps {
  leagueId: string;
  eyebrow: string;
  title: string;
  description: string;
  highlights?: string[];
  children: ReactNode;
}

export function LeaguePageShell({
  leagueId,
  eyebrow,
  title,
  description,
  highlights = [],
  children,
}: LeaguePageShellProps) {
  const heroHighlights = (
    highlights.length > 0
      ? highlights
      : ["League updates", "Manager activity", "Next steps"]
  ).slice(0, 3);

  return (
    <main className="page-shell space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <MotionReveal emphasis="live">
        <section className="league-scene glass-card edge-field surface-ring overflow-hidden rounded-[2.4rem] border border-line p-5 sm:p-7 lg:p-8">
          <div className="league-orb league-float-soft top-10 left-[-2rem] h-28 w-28 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.88),rgba(255,126,182,0.44),transparent_72%)]" />
          <div className="league-orb league-float-slow right-[-1.5rem] top-8 h-36 w-36 bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.7),rgba(0,225,255,0.28),transparent_74%)]" />
          <div className="league-orb league-float-soft bottom-[-2rem] left-[44%] h-24 w-24 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.78),rgba(255,196,120,0.3),transparent_74%)]" />

          <div className="relative z-10 grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Pill tone="brand">{eyebrow}</Pill>
                <Pill tone="accent">League view</Pill>
              </div>

              <div className="max-w-3xl space-y-3">
                <h1 className="font-display text-5xl uppercase leading-[0.9] tracking-[0.01em] text-white sm:text-[4.7rem]">
                  {title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-white/78 sm:text-lg">
                  {description}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {heroHighlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="rounded-full border border-white/14 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/76"
                  >
                    {highlight}
                  </span>
                ))}
              </div>

              <MotionReveal delay={90}>
                <LeagueSubnav leagueId={leagueId} />
              </MotionReveal>
            </div>

            <MotionReveal className="hidden xl:block" delay={140} variant="right">
              <LeagueMoodboard highlights={heroHighlights} />
            </MotionReveal>
          </div>
        </section>
      </MotionReveal>

      <div className="hero-grid">{children}</div>
    </main>
  );
}

const moodboardIcons: LucideIcon[] = [Sparkles, Heart, RadioTower];

function LeagueMoodboard({ highlights }: { highlights: string[] }) {
  return (
    <aside className="league-mood-card rounded-[2rem] border border-white/12 p-5 text-white">
      <div className="league-orb league-float-soft left-[-1.25rem] top-[-1rem] h-24 w-24 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.82),rgba(255,126,182,0.3),transparent_76%)]" />
      <div className="league-orb league-float-slow bottom-[-1.5rem] right-[-1rem] h-28 w-28 bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.72),rgba(0,225,255,0.24),transparent_76%)]" />

      <div className="relative z-10 flex h-full flex-col justify-between gap-5">
        <div className="space-y-3">
          <Pill tone="accent" className="border-white/14 bg-white/10 text-white">
            League snapshot
          </Pill>
          <h2 className="font-display text-[2.6rem] uppercase leading-[0.88] tracking-[0.01em] text-white">
            Every key detail stays in view.
          </h2>
          <p className="max-w-md text-sm leading-6 text-white/74">
            Invite code, manager progress, and the next action stay visible so the room is easy to run on matchday.
          </p>
        </div>

        <div className="grid gap-3">
          {highlights.map((highlight, index) => {
            const Icon = moodboardIcons[index] ?? Crown;

            return (
              <div
                key={highlight}
                className="rounded-[1.35rem] border border-white/12 bg-black/18 px-4 py-4 backdrop-blur-md"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[1rem] border border-white/14 bg-white/10 text-white">
                    <Icon className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#ffd5e5]">
                      Focus {index + 1}
                    </p>
                    <p className="text-sm font-semibold leading-6 text-white">{highlight}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
