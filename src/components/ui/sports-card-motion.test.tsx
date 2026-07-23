import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BroadcastScoreBug,
  BroadcastStage,
  CardFan,
  CountdownRing,
  FoilTiltCard,
  MomentumRail,
  PlayerLowerThird,
  PulseMetricStrip,
  RarityPulse,
  SpotlightPanel,
  TickerMarquee,
  ZoneHeatGrid,
} from "./sports-card-motion";

describe("sports-card-motion", () => {
  it("renders broadcast stage children", () => {
    render(<BroadcastStage tone="ember">Open sequence</BroadcastStage>);
    expect(screen.getByText("Open sequence")).toBeInTheDocument();
  });

  it("duplicates ticker items for looping marquee", () => {
    const { container } = render(<TickerMarquee items={["Pack drop", "Live now"]} speed="fast" />);
    expect(screen.getAllByText("Pack drop")).toHaveLength(2);
    expect(screen.getAllByText("Live now")).toHaveLength(2);
    expect(container.firstElementChild).toHaveAttribute("data-speed", "fast");
  });

  it("renders rarity pulse label and tone", () => {
    render(<RarityPulse label="Legendary" tone="legendary" />);
    const badge = screen.getByText("Legendary");
    expect(badge).toHaveAttribute("data-rarity-tone", "legendary");
  });

  it("updates foil card tilt variables on hover and resets on leave", () => {
    render(
      <FoilTiltCard
        title="Aurora Blitz"
        subtitle="Feature card motion."
        rating="95"
        series="Velocity Series"
      />
    );

    const card = screen.getByText("Aurora Blitz").closest("article") as HTMLElement;
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

    fireEvent.mouseMove(card, { clientX: 180, clientY: 96 });
    expect(card.style.getPropertyValue("--foil-pointer-x")).toBe("75.00%");
    expect(card.style.getPropertyValue("--foil-pointer-y")).toBe("30.00%");
    expect(card.style.getPropertyValue("--foil-rotate-x")).toBe("2.80deg");
    expect(card.style.getPropertyValue("--foil-rotate-y")).toBe("4.00deg");

    fireEvent.mouseLeave(card);
    expect(card.style.getPropertyValue("--foil-rotate-x")).toBe("0deg");
    expect(card.style.getPropertyValue("--foil-rotate-y")).toBe("0deg");
  });

  it("renders a three-card fan and spotlight content", () => {
    const { container } = render(
      <>
        <CardFan
          cards={[
            { title: "North Run", meta: "Hero feature", rarity: "Rookie" },
            { title: "Flash Cut", meta: "Pack reveal", rarity: "Holo" },
            { title: "Final Frame", meta: "CTA module", rarity: "Legendary" },
          ]}
        />
        <SpotlightPanel>Promo block</SpotlightPanel>
      </>
    );

    expect(screen.getByText("North Run")).toBeInTheDocument();
    expect(screen.getByText("Final Frame")).toBeInTheDocument();
    expect(screen.getByText("Promo block")).toBeInTheDocument();
    expect(container.querySelectorAll(".sports-motion-fan__card")).toHaveLength(3);
  });

  it("renders a score bug with possession state", () => {
    render(
      <BroadcastScoreBug
        awayTeam="PHI"
        awayScore={101}
        homeTeam="DEN"
        homeScore={106}
        period="Q4"
        gameClock="1:12"
        shotClock={14}
        possession="away"
      />
    );

    expect(screen.getByText("PHI")).toBeInTheDocument();
    expect(screen.getByText("DEN")).toBeInTheDocument();
    expect(screen.getByText("1:12")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("PHI").closest(".sports-motion-scorebug")).toHaveAttribute(
      "data-possession",
      "away"
    );
  });

  it("renders lower third, countdown ring, and momentum rail", () => {
    render(
      <>
        <PlayerLowerThird
          playerName="Nova James"
          teamName="Chicago Orbit"
          role="31 PTS • 8 AST"
          number="7"
          tags={["Feature", "Live"]}
        />
        <CountdownRing label="Shot Clock" value={9} max={24} detail="Live possession" />
        <MomentumRail
          leftLabel="Road"
          leftValue={44}
          rightLabel="Home"
          rightValue={56}
          caption="10-3 run"
        />
      </>
    );

    expect(screen.getByText("Nova James")).toBeInTheDocument();
    expect(screen.getByLabelText("Shot Clock")).toHaveAttribute("aria-valuenow", "9");
    expect(screen.getByText("10-3 run")).toBeInTheDocument();
  });

  it("renders pulse metrics and heat zones", () => {
    const { container } = render(
      <>
        <PulseMetricStrip
          metrics={[
            { label: "Usage", value: "31.1%", delta: "+3.2", trend: "up" },
            { label: "EV", value: "142", delta: "-1.1", trend: "down" },
          ]}
        />
        <ZoneHeatGrid
          zones={[
            { label: "L Wing", value: 60 },
            { label: "Top", value: 88 },
            { label: "R Wing", value: 72 },
          ]}
        />
      </>
    );

    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("Shot Zone Activity")).toBeInTheDocument();
    expect(container.querySelectorAll(".sports-motion-heat-grid__cell")).toHaveLength(3);
  });
});
