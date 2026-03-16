import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignupLocalForm } from "./signup-local-form";

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
const mockUpsertFantasyProfile = vi.fn().mockResolvedValue(undefined);

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
    upsertFantasyProfile: mockUpsertFantasyProfile,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({}),
}));

vi.mock("@/lib/local-mode-store", () => ({
  registerLocalUser: vi.fn(),
}));

describe("SignupLocalForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders signup form with display name field", () => {
    render(<SignupLocalForm />);
    expect(screen.getByPlaceholderText("Rose City Press")).toBeInTheDocument();
  });

  it("renders get started button", () => {
    render(<SignupLocalForm />);
    expect(screen.getByText("Get started")).toBeInTheDocument();
  });

  it("renders email signup option", () => {
    render(<SignupLocalForm />);
    expect(screen.getByText("Sign up with email")).toBeInTheDocument();
  });

  it("switches to email form when email button clicked", () => {
    render(<SignupLocalForm />);
    fireEvent.click(screen.getByText("Sign up with email"));
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("At least 6 characters")).toBeInTheDocument();
  });

  it("shows back to options button in email mode", () => {
    render(<SignupLocalForm />);
    fireEvent.click(screen.getByText("Sign up with email"));
    expect(screen.getByText("Back to options")).toBeInTheDocument();
  });

  it("validates display name on email form submit", async () => {
    render(<SignupLocalForm />);
    fireEvent.click(screen.getByText("Sign up with email"));

    const form = screen.getByPlaceholderText("you@example.com").closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Display name is required.")).toBeInTheDocument();
    });
  });

  it("validates email on email form submit", async () => {
    render(<SignupLocalForm />);
    fireEvent.click(screen.getByText("Sign up with email"));

    const nameInput = screen.getByPlaceholderText("Rose City Press");
    fireEvent.change(nameInput, { target: { value: "Test User" } });

    const form = nameInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Email is required.")).toBeInTheDocument();
    });
  });

  it("validates password length", async () => {
    render(<SignupLocalForm />);
    fireEvent.click(screen.getByText("Sign up with email"));

    const nameInput = screen.getByPlaceholderText("Rose City Press");
    const emailInput = screen.getByPlaceholderText("you@example.com");
    const passwordInput = screen.getByPlaceholderText("At least 6 characters");

    fireEvent.change(nameInput, { target: { value: "Test" } });
    fireEvent.change(emailInput, { target: { value: "test@test.com" } });
    fireEvent.change(passwordInput, { target: { value: "abc" } });

    const form = nameInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 6 characters.")).toBeInTheDocument();
    });
  });

  it("shows error when guest signup without display name", async () => {
    render(<SignupLocalForm />);

    const form = screen.getByPlaceholderText("Rose City Press").closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Display name is required.")).toBeInTheDocument();
    });
  });
});
