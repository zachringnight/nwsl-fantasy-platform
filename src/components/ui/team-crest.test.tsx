import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TeamCrest } from "./team-crest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe("TeamCrest", () => {
  it("renders abbreviation when no src is provided", () => {
    render(<TeamCrest name="Portland Thorns" />);
    expect(screen.getByText("POR")).toBeInTheDocument();
  });

  it("renders image when src is provided", () => {
    render(<TeamCrest name="Portland Thorns" src="/crests/por.png" />);
    const img = screen.getByAltText("Portland Thorns crest");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/crests/por.png");
  });

  it("abbreviation is hidden from screen readers", () => {
    const { container } = render(<TeamCrest name="Orlando Pride" />);
    const abbr = container.querySelector('[aria-hidden="true"]');
    expect(abbr?.textContent).toBe("ORL");
  });

  it("applies default size class (32)", () => {
    const { container } = render(<TeamCrest name="Test" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("size-8");
  });

  it("applies custom size class", () => {
    const { container } = render(<TeamCrest name="Test" size={48} />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("size-12");
  });

  it("merges custom className", () => {
    const { container } = render(<TeamCrest name="Test" className="border-brand" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("border-brand");
  });

  it("truncates long names to 3 characters", () => {
    render(<TeamCrest name="AB" />);
    expect(screen.getByText("AB")).toBeInTheDocument();
  });
});
