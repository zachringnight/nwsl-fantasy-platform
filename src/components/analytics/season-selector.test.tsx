import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonSelector } from "./season-selector";

const navigation = vi.hoisted(() => ({
  pathname: "/analytics/matches",
  query: "",
  pushed: [] as string[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: (href: string) => navigation.pushed.push(href),
  }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

describe("SeasonSelector", () => {
  beforeEach(() => {
    navigation.query = "";
    navigation.pushed = [];
  });

  it("clears date and legacy matchday when changing seasons", () => {
    navigation.query =
      "date=2026-07-26&matchday=18&status=live&order=desc";
    render(<SeasonSelector />);

    fireEvent.click(screen.getByRole("button", { name: "2025" }));

    expect(navigation.pushed).toEqual([
      "/analytics/matches?status=live&order=desc&season=2025",
    ]);
  });

  it("removes the default-season query without dropping other filters", () => {
    navigation.query =
      "season=2025&date=2025-10-01&matchday=24&status=completed&order=asc";
    render(<SeasonSelector />);

    fireEvent.click(screen.getByRole("button", { name: "2026" }));

    expect(navigation.pushed).toEqual([
      "/analytics/matches?status=completed&order=asc",
    ]);
  });

  it("does not reset filters when the active season is clicked", () => {
    navigation.query = "date=all&order=desc";
    render(<SeasonSelector />);

    fireEvent.click(screen.getByRole("button", { name: "2026" }));

    expect(navigation.pushed).toEqual([]);
  });
});
