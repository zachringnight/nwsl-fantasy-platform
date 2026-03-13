import type { Meta, StoryObj } from "@storybook/react";
import { Pill } from "@/components/ui/pill";

const meta: Meta<typeof Pill> = {
  title: "UI/Pill",
  component: Pill,
  tags: ["autodocs"],
  args: {
    children: "Label",
  },
};

export default meta;
type Story = StoryObj<typeof Pill>;

export const Default: Story = {};

export const Brand: Story = {
  args: { tone: "brand" },
};

export const Accent: Story = {
  args: { tone: "accent" },
};

export const Success: Story = {
  args: { tone: "success" },
};
