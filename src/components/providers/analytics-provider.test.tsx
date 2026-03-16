import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AnalyticsProvider } from "./analytics-provider";

const mockTrackPageView = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/analytics/events", () => ({
  trackPageView: (...args: unknown[]) => mockTrackPageView(...args),
}));

describe("AnalyticsProvider", () => {
  it("renders children", () => {
    render(
      <AnalyticsProvider>
        <p>Analytics child</p>
      </AnalyticsProvider>
    );
    expect(screen.getByText("Analytics child")).toBeInTheDocument();
  });

  it("calls trackPageView with current pathname", () => {
    render(
      <AnalyticsProvider>
        <p>Content</p>
      </AnalyticsProvider>
    );
    expect(mockTrackPageView).toHaveBeenCalledWith("/dashboard");
  });
});
