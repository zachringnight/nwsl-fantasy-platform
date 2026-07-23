import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlayerAvatar } from "./player-avatar";

// Mock next/image to render a regular img tag
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe("PlayerAvatar", () => {
  it("renders initials when no src is provided", () => {
    render(<PlayerAvatar name="Alex Morgan" />);
    expect(screen.getByText("AM")).toBeInTheDocument();
  });

  it("renders single initial for single-name", () => {
    render(<PlayerAvatar name="Marta" />);
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("renders ? for empty name", () => {
    render(<PlayerAvatar name="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders image when src is provided", () => {
    render(<PlayerAvatar name="Rose Lavelle" src="/images/rose.jpg" />);
    const img = screen.getByAltText("Rose Lavelle");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/images/rose.jpg");
  });

  it("uses last name initial for multi-word names", () => {
    render(<PlayerAvatar name="Crystal Dunn Williams" />);
    expect(screen.getByText("CW")).toBeInTheDocument();
  });

  it("renders initials hidden from screen readers", () => {
    const { container } = render(<PlayerAvatar name="Sam Kerr" />);
    const initialsSpan = container.querySelector('[aria-hidden="true"]');
    expect(initialsSpan).toBeInTheDocument();
    expect(initialsSpan?.textContent).toBe("SK");
  });

  it("applies default size class (48)", () => {
    const { container } = render(<PlayerAvatar name="Test" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("size-12");
  });

  it("applies custom size class", () => {
    const { container } = render(<PlayerAvatar name="Test" size={80} />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("size-20");
  });

  it("merges custom className", () => {
    const { container } = render(<PlayerAvatar name="Test" className="ring-2" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("ring-2");
  });
});
