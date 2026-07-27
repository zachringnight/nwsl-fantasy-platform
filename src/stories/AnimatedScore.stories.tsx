import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatedScore } from "@/components/ui/animated-score";
import { Button } from "@/components/ui/button";

function InteractiveScore() {
  const [score, setScore] = useState(78.4);

  return (
    <div className="w-72 rounded-[1.5rem] border border-line bg-panel p-6 text-center shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Projected points
      </p>
      <AnimatedScore
        className="mt-3 block font-display text-6xl leading-none text-foreground"
        value={score}
      />
      <div className="mt-5 flex justify-center gap-2">
        <Button
          aria-label="Decrease projected points"
          onClick={() => setScore((current) => current - 2.5)}
          size="sm"
          variant="secondary"
        >
          −2.5
        </Button>
        <Button
          aria-label="Increase projected points"
          onClick={() => setScore((current) => current + 2.5)}
          size="sm"
          variant="accent"
        >
          +2.5
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: "Motion/AnimatedScore",
  component: AnimatedScore,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    value: 84.2,
  },
} satisfies Meta<typeof AnimatedScore>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const WholeNumber: Story = {
  args: {
    decimals: 0,
    value: 91,
  },
};

export const Interactive: Story = {
  render: () => <InteractiveScore />,
};
