import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Skeleton,
  SkeletonCard,
  SkeletonRow,
} from "@/components/ui/skeleton";

const meta = {
  title: "UI/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    className: "h-5 w-64",
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primitive: Story = {};

export const Card: Story = {
  render: () => (
    <div className="w-[min(34rem,calc(100vw-2rem))]">
      <SkeletonCard />
    </div>
  ),
};

export const Row: Story = {
  render: () => (
    <div className="w-[min(34rem,calc(100vw-2rem))]">
      <SkeletonRow />
    </div>
  ),
};

export const LoadingList: Story = {
  render: () => (
    <div
      aria-label="Player list loading"
      aria-live="polite"
      className="w-[min(34rem,calc(100vw-2rem))] space-y-3"
    >
      <span className="sr-only">Loading players</span>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  ),
};
