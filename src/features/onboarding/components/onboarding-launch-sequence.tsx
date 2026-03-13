import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";
import { SurfaceCard } from "@/components/common/surface-card";

export interface OnboardingLaunchSequenceProps {
  steps: string[];
}

export function OnboardingLaunchSequence({
  steps,
}: OnboardingLaunchSequenceProps) {
  return (
    <SurfaceCard
      description="Get set up in a few quick steps and go straight to your next league."
      eyebrow="First steps"
      title="Four moves to kickoff"
    >
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <MotionReveal key={step} delay={index * 70}>
            <li className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <div className="flex items-start gap-3">
                <Pill tone="brand">{index + 1}</Pill>
                <p className="text-sm leading-6 text-muted">{step}</p>
              </div>
            </li>
          </MotionReveal>
        ))}
      </ol>
    </SurfaceCard>
  );
}
