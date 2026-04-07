"use client";

import { useState } from "react";
import { X, Sparkles, Target, Clock, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FirstPickGuideProps {
  /** Whether this is the user's first time in a draft room */
  isFirstDraft: boolean;
  /** Called when user dismisses the guide */
  onDismiss: () => void;
}

const GUIDE_STEPS = [
  {
    icon: Target,
    title: "Pick a player",
    description:
      "When it's your turn, tap any available player on the board and hit \"Draft\". The clock is ticking, so have a plan!",
  },
  {
    icon: ListOrdered,
    title: "Build your queue",
    description:
      "Add players to your queue before your turn. If your top choice is available, you'll be ready to draft instantly.",
  },
  {
    icon: Clock,
    title: "Watch the clock",
    description:
      "Each pick has a time limit. If time runs out, autopick selects the best available player for you.",
  },
] as const;

/**
 * A guided overlay shown to first-time drafters.
 * Steps through key draft room concepts before the user's first pick.
 */
export function FirstPickGuide({ isFirstDraft, onDismiss }: FirstPickGuideProps) {
  const [step, setStep] = useState(0);

  if (!isFirstDraft) return null;

  const currentStep = GUIDE_STEPS[step];
  const isLastStep = step === GUIDE_STEPS.length - 1;
  const Icon = currentStep.icon;

  return (
    <div className="relative overflow-hidden rounded-[1.65rem] border border-brand/30 bg-gradient-to-br from-brand/10 via-panel to-panel p-5">
      <button
        aria-label="Dismiss guide"
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
        onClick={onDismiss}
        type="button"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-strong" />
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
          First draft guide — Step {step + 1} of {GUIDE_STEPS.length}
        </p>
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10">
          <Icon className="size-6 text-brand-strong" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{currentStep.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{currentStep.description}</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="mt-4 flex items-center gap-1.5">
        {GUIDE_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all ${
              i === step ? "w-6 bg-brand-strong" : i < step ? "w-3 bg-brand-strong/40" : "w-3 bg-white/12"
            }`}
          />
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        {step > 0 && (
          <Button
            onClick={() => setStep(step - 1)}
            type="button"
            variant="secondary"
          >
            Back
          </Button>
        )}
        {isLastStep ? (
          <Button onClick={onDismiss} type="button">
            Got it, let&apos;s draft!
          </Button>
        ) : (
          <Button onClick={() => setStep(step + 1)} type="button">
            Next
          </Button>
        )}
        {!isLastStep && (
          <Button
            onClick={onDismiss}
            type="button"
            variant="secondary"
          >
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
