import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerSpotlightCard } from "./player-spotlight-card";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("@/config/nwsl-clubs", () => ({
  findClub: () => null,
}));

const defaultProps = {
  appearances: 23,
  availability: "available" as const,
  averagePoints: 16.4,
  clubName: "Kansas City Current",
  playerName: "Temwa Chawinga",
  position: "FWD" as const,
  primaryStatLabel: "Goals",
  primaryStatValue: 15,
  rank: 1,
  salaryCost: 12000,
  statsSeason: "2025 NWSL regular season",
};

describe("PlayerSpotlightCard", () => {
  it("renders the real player and fantasy metrics", () => {
    render(<PlayerSpotlightCard {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "Temwa Chawinga" })).toBeInTheDocument();
    expect(screen.getByText("Kansas City Current")).toBeInTheDocument();
    expect(screen.getByText("16.4")).toBeInTheDocument();
    expect(screen.getByText("$12000")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText(/23 appearances/)).toBeInTheDocument();
  });

  it("updates foil variables for mouse movement and resets on leave", () => {
    render(<PlayerSpotlightCard {...defaultProps} />);
    const card = screen.getByLabelText("Temwa Chawinga fantasy player card");

    Object.defineProperty(card, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 320,
        height: 320,
        left: 0,
        right: 240,
        top: 0,
        width: 240,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerMove(card, { clientX: 180, clientY: 96, pointerType: "mouse" });
    expect(card.style.getPropertyValue("--foil-pointer-x")).toBe("75.00%");
    expect(card.style.getPropertyValue("--foil-pointer-y")).toBe("30.00%");
    expect(card.style.getPropertyValue("--foil-rotate-x")).toBe("1.60deg");
    expect(card.style.getPropertyValue("--foil-rotate-y")).toBe("2.50deg");

    fireEvent.pointerLeave(card);
    expect(card.style.getPropertyValue("--foil-rotate-x")).toBe("0deg");
    expect(card.style.getPropertyValue("--foil-rotate-y")).toBe("0deg");
  });
});
