import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FantasyDataProvider, useFantasyDataClient } from "./fantasy-data-provider";

vi.mock("@/lib/cached-data-client", () => ({
  cachedFantasyDataClient: { fetchCurrentProfile: vi.fn() },
}));

function TestConsumer() {
  const client = useFantasyDataClient();
  return <div data-testid="has-client">{client ? "yes" : "no"}</div>;
}

describe("FantasyDataProvider", () => {
  it("provides default data client to children", () => {
    render(
      <FantasyDataProvider>
        <TestConsumer />
      </FantasyDataProvider>
    );
    expect(screen.getByTestId("has-client")).toHaveTextContent("yes");
  });

  it("provides custom client when passed", () => {
    const customClient = { fetchCurrentProfile: vi.fn() } as any;
    render(
      <FantasyDataProvider client={customClient}>
        <TestConsumer />
      </FantasyDataProvider>
    );
    expect(screen.getByTestId("has-client")).toHaveTextContent("yes");
  });

  it("renders children", () => {
    render(
      <FantasyDataProvider>
        <p>Child content</p>
      </FantasyDataProvider>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
