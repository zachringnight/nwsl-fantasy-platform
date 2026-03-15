"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SurfaceCard } from "@/components/common/surface-card";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";
import { getButtonClassName } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ExperienceLevel = "new" | "casual" | "experienced";

export interface WelcomeTourProps {
  experienceLevel: ExperienceLevel;
  displayName: string;
  favoriteClub: string | null;
  onDismiss: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "nwsl_welcome_tour_dismissed";

interface TourStep {
  number: number;
  title: string;
  description: string;
  icon: string;
}

const NEW_USER_STEPS: TourStep[] = [
  {
    number: 1,
    title: "Create or join a league",
    description:
      "Leagues are private competitions where you and your friends draft NWSL players, set lineups, and compete head-to-head each week. Create one or join with an invite code.",
    icon: "\u{1F3C6}",
  },
  {
    number: 2,
    title: "Draft your team",
    description:
      "Classic leagues use a live snake draft where managers take turns picking players. Salary-cap leagues let you build a roster under a budget\u2009\u2014\u2009swap players any time.",
    icon: "\u{1F4CB}",
  },
  {
    number: 3,
    title: "Set lineups and compete",
    description:
      "Each week you choose which players start. They score points based on real NWSL match performance\u2009\u2014\u2009goals, assists, clean sheets, and more.",
    icon: "\u26BD",
  },
];

/* ------------------------------------------------------------------ */
/*  Step card                                                          */
/* ------------------------------------------------------------------ */

function StepCard({ step, delay }: { step: TourStep; delay: number }) {
  return (
    <MotionReveal delay={delay}>
      <div className="glass-card rounded-[1.35rem] border border-line bg-white/6 p-4 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/15 text-sm"
            aria-hidden="true"
          >
            {step.icon}
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              <span className="mr-1.5 text-brand-strong">
                {step.number}.
              </span>
              {step.title}
            </p>
            <p className="text-[0.8rem] leading-5 text-muted">
              {step.description}
            </p>
          </div>
        </div>
      </div>
    </MotionReveal>
  );
}

/* ------------------------------------------------------------------ */
/*  Differentiator pills (casual / experienced)                        */
/* ------------------------------------------------------------------ */

const DIFFERENTIATORS = [
  "NWSL-specific scoring",
  "Salary cap mode",
  "Weekly & season-long",
  "Live snake drafts",
];

function DifferentiatorRow({ delay }: { delay: number }) {
  return (
    <MotionReveal delay={delay}>
      <div className="flex flex-wrap gap-2">
        {DIFFERENTIATORS.map((label) => (
          <Pill key={label} tone="brand">
            {label}
          </Pill>
        ))}
      </div>
    </MotionReveal>
  );
}

/* ------------------------------------------------------------------ */
/*  Content by experience level                                        */
/* ------------------------------------------------------------------ */

function NewUserContent({ displayName }: { displayName: string }) {
  return (
    <>
      <MotionReveal delay={0}>
        <p className="text-sm leading-6 text-muted">
          Welcome to NWSL Fantasy, {displayName}! Here is how it works in three
          quick steps.
        </p>
      </MotionReveal>

      <div className="space-y-3 pt-1">
        {NEW_USER_STEPS.map((step, i) => (
          <StepCard key={step.number} step={step} delay={80 + i * 80} />
        ))}
      </div>

      <MotionReveal delay={360}>
        <p className="pt-1 text-sm text-muted">
          Want to look around first?{" "}
          <Link
            className="font-semibold text-brand-strong underline underline-offset-2 hover:text-white"
            href="/players"
          >
            Explore players
          </Link>
        </p>
      </MotionReveal>

      <MotionReveal delay={420}>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link className={getButtonClassName({ variant: "primary" })} href="/leagues/create">
            Create your first league
          </Link>
          <Link className={getButtonClassName({ variant: "secondary" })} href="/leagues/join">
            Join with a code
          </Link>
        </div>
      </MotionReveal>
    </>
  );
}

function CasualUserContent({ displayName }: { displayName: string }) {
  return (
    <>
      <MotionReveal delay={0}>
        <p className="text-sm leading-6 text-muted">
          Welcome back, {displayName}! NWSL Fantasy brings a few things you
          will not find elsewhere.
        </p>
      </MotionReveal>

      <DifferentiatorRow delay={100} />

      <MotionReveal delay={200}>
        <p className="text-sm leading-6 text-muted">
          Jump into a league to get started. You can create your own or join an
          existing one with an invite code.
        </p>
      </MotionReveal>

      <MotionReveal delay={280}>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link className={getButtonClassName({ variant: "primary" })} href="/leagues/create">
            Create a league
          </Link>
          <Link className={getButtonClassName({ variant: "secondary" })} href="/leagues/join">
            Join with a code
          </Link>
        </div>
      </MotionReveal>
    </>
  );
}

function ExperiencedUserContent({ displayName }: { displayName: string }) {
  return (
    <>
      <MotionReveal delay={0}>
        <p className="text-sm leading-6 text-muted">
          Hey {displayName} &mdash; ready to play? NWSL Fantasy features
          NWSL-specific scoring categories and optional salary-cap leagues
          alongside traditional snake drafts.
        </p>
      </MotionReveal>

      <DifferentiatorRow delay={100} />

      <MotionReveal delay={180}>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link className={getButtonClassName({ variant: "primary" })} href="/leagues/create">
            Create a league
          </Link>
          <Link className={getButtonClassName({ variant: "secondary" })} href="/leagues/join">
            Join with a code
          </Link>
        </div>
      </MotionReveal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function WelcomeTour({
  experienceLevel,
  displayName,
  favoriteClub,
  onDismiss,
}: WelcomeTourProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* storage unavailable */
    }
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  if (dismissed) return null;

  const eyebrow =
    experienceLevel === "new"
      ? "Getting started"
      : experienceLevel === "casual"
        ? "Welcome back"
        : "Welcome";

  const title =
    favoriteClub
      ? `Let\u2019s go, ${favoriteClub} fan`
      : experienceLevel === "new"
        ? "Welcome to NWSL Fantasy"
        : "Ready to compete";

  return (
    <MotionReveal>
      <SurfaceCard
        className="relative"
        eyebrow={eyebrow}
        title={title}
        tone="brand"
      >
        {/* Dismiss button */}
        <button
          aria-label="Dismiss welcome tour"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white/60 transition hover:bg-white/15 hover:text-white"
          onClick={handleDismiss}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              d="M18 6 6 18M6 6l12 12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Experience-level content */}
        <div className="space-y-4">
          {experienceLevel === "new" ? (
            <NewUserContent displayName={displayName} />
          ) : experienceLevel === "casual" ? (
            <CasualUserContent displayName={displayName} />
          ) : (
            <ExperiencedUserContent displayName={displayName} />
          )}
        </div>
      </SurfaceCard>
    </MotionReveal>
  );
}
