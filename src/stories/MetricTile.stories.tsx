import type { Meta, StoryObj } from "@storybook/react";
import { MetricTile } from "@/components/ui/metric-tile";

const meta: Meta<typeof MetricTile> = {
  title: "UI/MetricTile",
  component: MetricTile,
  tags: ["autodocs"],
  args: {
    label: "Metric",
    value: "42",
    detail: "A short explanation of this metric.",
  },
};

export default meta;
type Story = StoryObj<typeof MetricTile>;

export const Default: Story = {};

export const Brand: Story = {
  args: { tone: "brand", label: "Points", value: "84.2" },
};

export const Accent: Story = {
  args: { tone: "accent", label: "Rank", value: "#3" },
};

export const NumericValue: Story = {
  args: { label: "Managers", value: 8, detail: "Currently in the league." },
};
