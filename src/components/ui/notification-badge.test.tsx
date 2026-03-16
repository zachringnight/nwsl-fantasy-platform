import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NotificationBadge } from "./notification-badge";

describe("NotificationBadge", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<NotificationBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when count is negative", () => {
    const { container } = render(<NotificationBadge count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the count for values <= maxDisplay", () => {
    render(<NotificationBadge count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders 9+ when count exceeds default maxDisplay", () => {
    render(<NotificationBadge count={15} />);
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("respects custom maxDisplay", () => {
    render(<NotificationBadge count={25} maxDisplay={20} />);
    expect(screen.getByText("20+")).toBeInTheDocument();
  });

  it("shows exact count at maxDisplay boundary", () => {
    render(<NotificationBadge count={9} />);
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("includes singular aria-label for count=1", () => {
    render(<NotificationBadge count={1} />);
    const badge = screen.getByLabelText("1 unread notification");
    expect(badge).toBeInTheDocument();
  });

  it("includes plural aria-label for count>1", () => {
    render(<NotificationBadge count={3} />);
    const badge = screen.getByLabelText("3 unread notifications");
    expect(badge).toBeInTheDocument();
  });
});
