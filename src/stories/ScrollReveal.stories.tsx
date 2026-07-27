import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

const meta = {
  title: "Motion/ScrollReveal",
  component: ScrollReveal,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    children: (
      <div className="w-72 rounded-[1.5rem] border border-line bg-panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-lime">
          In-view transition
        </p>
        <p className="mt-2 text-sm text-muted">
          This card reveals once it enters the preview viewport.
        </p>
      </div>
    ),
  },
} satisfies Meta<typeof ScrollReveal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
