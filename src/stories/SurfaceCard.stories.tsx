import type { Meta, StoryObj } from "@storybook/react";
import { SurfaceCard } from "@/components/common/surface-card";

const meta: Meta<typeof SurfaceCard> = {
  title: "Common/SurfaceCard",
  component: SurfaceCard,
  tags: ["autodocs"],
  args: {
    title: "Card title",
    description: "A short description that explains what this card contains.",
    eyebrow: "Category",
  },
};

export default meta;
type Story = StoryObj<typeof SurfaceCard>;

export const Default: Story = {};

export const Brand: Story = {
  args: { tone: "brand" },
};

export const Accent: Story = {
  args: { tone: "accent" },
};

export const WithChildren: Story = {
  args: {
    children: (
      <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm text-muted">
        Content goes here.
      </div>
    ),
  },
};
