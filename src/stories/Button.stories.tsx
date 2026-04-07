import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Button label",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: "primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Ghost: Story = {
  args: { variant: "ghost" },
};

export const Accent: Story = {
  args: { variant: "accent" },
};

export const Small: Story = {
  args: { variant: "primary", size: "sm" },
};

export const Large: Story = {
  args: { variant: "primary", size: "lg" },
};

export const FullWidth: Story = {
  args: { variant: "primary", fullWidth: true },
};

export const Disabled: Story = {
  args: { variant: "primary", disabled: true },
};
