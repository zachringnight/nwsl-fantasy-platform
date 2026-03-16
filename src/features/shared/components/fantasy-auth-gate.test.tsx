import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FantasyAuthGate } from "./fantasy-auth-gate";

const mockUseFantasyAuth = vi.fn();

vi.mock("@/components/providers/fantasy-auth-provider", () => ({
  useFantasyAuth: () => mockUseFantasyAuth(),
}));

describe("FantasyAuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state when not hydrated", () => {
    mockUseFantasyAuth.mockReturnValue({
      hasHydrated: false,
      profile: null,
      session: null,
    });

    render(
      <FantasyAuthGate
        loadingTitle="Loading..."
        loadingDescription="Please wait."
        signedOutTitle="Sign in"
        signedOutDescription="You need to sign in."
      >
        {() => <p>Protected content</p>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.getByText("Please wait.")).toBeInTheDocument();
  });

  it("shows signed out state when no profile", () => {
    mockUseFantasyAuth.mockReturnValue({
      hasHydrated: true,
      profile: null,
      session: null,
    });

    render(
      <FantasyAuthGate
        loadingTitle="Loading..."
        loadingDescription="Please wait."
        signedOutTitle="Sign in required"
        signedOutDescription="Please sign in to continue."
        signedOutAction={<button>Sign in</button>}
      >
        {() => <p>Protected content</p>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows onboarding state when profile exists but not onboarded", () => {
    mockUseFantasyAuth.mockReturnValue({
      hasHydrated: true,
      profile: { onboarding_complete: false, display_name: "Test" },
      session: { user: { id: "1" } },
    });

    render(
      <FantasyAuthGate
        loadingTitle="Loading"
        loadingDescription="Wait"
        signedOutTitle="Sign in"
        signedOutDescription="Auth required"
        onboardingAction={<button>Finish</button>}
      >
        {() => <p>Protected content</p>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Finish onboarding first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
  });

  it("renders children when authenticated and onboarded", () => {
    mockUseFantasyAuth.mockReturnValue({
      hasHydrated: true,
      profile: { onboarding_complete: true, display_name: "Test" },
      session: { user: { id: "1" } },
    });

    render(
      <FantasyAuthGate
        loadingTitle="Loading"
        loadingDescription="Wait"
        signedOutTitle="Sign in"
        signedOutDescription="Auth required"
      >
        {() => <p>Protected content</p>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("skips onboarding check when requireOnboarding is false", () => {
    mockUseFantasyAuth.mockReturnValue({
      hasHydrated: true,
      profile: { onboarding_complete: false, display_name: "Test" },
      session: { user: { id: "1" } },
    });

    render(
      <FantasyAuthGate
        loadingTitle="Loading"
        loadingDescription="Wait"
        signedOutTitle="Sign in"
        signedOutDescription="Auth required"
        requireOnboarding={false}
      >
        {() => <p>No onboarding required</p>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("No onboarding required")).toBeInTheDocument();
  });

  it("passes auth context to children render prop", () => {
    const mockAuth = {
      hasHydrated: true,
      profile: { onboarding_complete: true, display_name: "Alex" },
      session: { user: { id: "1" } },
    };
    mockUseFantasyAuth.mockReturnValue(mockAuth);

    render(
      <FantasyAuthGate
        loadingTitle="Loading"
        loadingDescription="Wait"
        signedOutTitle="Sign in"
        signedOutDescription="Auth required"
      >
        {(ctx) => <p>Hello {ctx.profile.display_name}</p>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Hello Alex")).toBeInTheDocument();
  });
});
