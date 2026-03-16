import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginLocalForm } from "./login-local-form";

// Mock dependencies
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockRefreshProfile = vi.fn().mockResolvedValue(undefined);
const mockEnsureHostedSession = vi.fn().mockResolvedValue(undefined);

vi.mock("@/components/providers/fantasy-auth-provider", () => ({
  useFantasyAuth: () => ({
    hasHydrated: true,
    profile: null,
    refreshProfile: mockRefreshProfile,
    supabaseReady: false,
  }),
}));

vi.mock("@/components/providers/fantasy-data-provider", () => ({
  useFantasyDataClient: () => ({
    ensureHostedSession: mockEnsureHostedSession,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({}),
}));

vi.mock("@/lib/local-mode-store", () => ({
  loginLocalUser: vi.fn(),
  registerLocalUser: vi.fn(),
}));

describe("LoginLocalForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sign-in options in choice mode", () => {
    render(<LoginLocalForm />);
    expect(screen.getByText("Sign in with email")).toBeInTheDocument();
    expect(screen.getByText("Quick guest session")).toBeInTheDocument();
  });

  it("shows info text about sign-in options", () => {
    render(<LoginLocalForm />);
    expect(screen.getByText(/Sign in with your email/)).toBeInTheDocument();
  });

  it("switches to email form when email button is clicked", () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
  });

  it("has back to options button in email mode", () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));
    expect(screen.getByText("Back to options")).toBeInTheDocument();
  });

  it("returns to choice mode when back button clicked", () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));
    fireEvent.click(screen.getByText("Back to options"));
    expect(screen.getByText("Quick guest session")).toBeInTheDocument();
  });

  it("shows email field validation on empty submit", async () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));

    const form = screen.getByPlaceholderText("you@example.com").closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Email is required.")).toBeInTheDocument();
    });
  });

  it("shows password field validation on submit without password", async () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));

    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "test@test.com" } });

    const form = emailInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Password is required.")).toBeInTheDocument();
    });
  });

  it("validates email format", async () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));

    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });

    const passwordInput = screen.getByPlaceholderText("Your password");
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    const form = emailInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    });
  });

  it("sets aria-invalid on email field with error", async () => {
    render(<LoginLocalForm />);
    fireEvent.click(screen.getByText("Sign in with email"));

    const form = screen.getByPlaceholderText("you@example.com").closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText("you@example.com");
      expect(emailInput).toHaveAttribute("aria-invalid", "true");
    });
  });
});
