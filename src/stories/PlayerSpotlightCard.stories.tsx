import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlayerSpotlightCard } from "@/components/player/player-spotlight-card";

const meta = {
  title: "Player/PlayerSpotlightCard",
  component: PlayerSpotlightCard,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(46rem,calc(100vw-2rem))]">
        <Story />
      </div>
    ),
  ],
  args: {
    appearances: 18,
    availability: "available",
    averagePoints: 14.8,
    clubName: "Kansas City Current",
    photoUrl: null,
    playerName: "Temwa Chawinga",
    position: "FWD",
    primaryStatLabel: "Goals",
    primaryStatValue: 12,
    rank: 1,
    salaryCost: 24,
    statsSeason: "2026",
  },
  argTypes: {
    availability: {
      control: "inline-radio",
      options: ["available", "questionable", "out"],
    },
    position: {
      control: "inline-radio",
      options: ["GK", "DEF", "MID", "FWD"],
    },
  },
} satisfies Meta<typeof PlayerSpotlightCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Forward: Story = {};

export const Midfielder: Story = {
  args: {
    averagePoints: 11.7,
    clubName: "Washington Spirit",
    playerName: "Leicy Santos",
    position: "MID",
    primaryStatLabel: "Assists",
    primaryStatValue: 7,
    rank: 8,
    salaryCost: 19,
  },
};

export const Defender: Story = {
  args: {
    averagePoints: 9.6,
    clubName: "Orlando Pride",
    playerName: "Emily Sams",
    position: "DEF",
    primaryStatLabel: "Clean sheets",
    primaryStatValue: 8,
    rank: 17,
    salaryCost: 16,
  },
};
