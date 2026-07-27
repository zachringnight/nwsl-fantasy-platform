import type { Meta, StoryObj } from "@storybook/react-vite";
import { MotionReveal } from "@/components/ui/motion-reveal";

const meta = {
  title: "Motion/MotionReveal",
  component: MotionReveal,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    children: (
      <div className="w-72 rounded-[1.5rem] border border-line bg-panel p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">
          Matchday signal
        </p>
        <p className="mt-2 font-display text-4xl uppercase leading-none text-foreground">
          Orlando at Gotham
        </p>
      </div>
    ),
  },
  argTypes: {
    delay: {
      control: { min: 0, max: 600, step: 50, type: "range" },
    },
    emphasis: {
      control: "inline-radio",
      options: ["default", "live"],
    },
    variant: {
      control: "inline-radio",
      options: ["up", "left", "right", "scale"],
    },
  },
} satisfies Meta<typeof MotionReveal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Up: Story = {};

export const FromLeft: Story = {
  args: {
    variant: "left",
  },
};

export const FromRight: Story = {
  args: {
    variant: "right",
  },
};

export const Scale: Story = {
  args: {
    variant: "scale",
  },
};

export const LiveEmphasis: Story = {
  args: {
    emphasis: "live",
    variant: "scale",
  },
};
