import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FantasyAuthGate } from "./fantasy-auth-gate";
import { useFantasyAuth, type FantasyAuthContextValue } from "@/components/providers/fantasy-auth-provider";

vi.mock("@/components/providers/fantasy-auth-provider", async () => {
  const actual = await vi.importActual<typeof import("@/components/providers/fantasy-auth-provider")>(
    "@/components/providers/fantasy-auth-provider"
  );

  return {
    ...actual,
    useFantasyAuth: vi.fn(),
  };
});

const mockUseFantasyAuth = vi.mocked(useFantasyAuth);

function buildAuthContext(overrides: Partial<FantasyAuthContextValue> = {}): FantasyAuthContextValue {
  return {
    authError: null,
    hasHydrated: true,
    profile: null,
    refreshProfile: vi.fn(async () => null),
    session: null,
    signOut: vi.fn(async () => {}),
    supabaseReady: true,
    user: null,
    ...overrides,
  };
}

describe("FantasyAuthGate", () => {
  it("shows the account error message when auth hydration fails after sign-in", () => {
    mockUseFantasyAuth.mockReturnValue(
      buildAuthContext({
        authError: "Unable to load your account right now.",
        session: {
          access_token: "token",
          user: {
            id: "user-1",
          },
        } as never,
      })
    );

    render(
      <FantasyAuthGate
        loadingDescription="Loading"
        loadingTitle="Loading"
        signedOutDescription="Signed out"
        signedOutTitle="Signed out"
      >
        {() => <div>Protected content</div>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Unable to load your account right now.")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("keeps the first-time setup message when the profile is still being created", () => {
    mockUseFantasyAuth.mockReturnValue(
      buildAuthContext({
        session: {
          access_token: "token",
          user: {
            id: "user-1",
          },
        } as never,
      })
    );

    render(
      <FantasyAuthGate
        loadingDescription="Loading"
        loadingTitle="Loading"
        signedOutDescription="Signed out"
        signedOutTitle="Signed out"
      >
        {() => <div>Protected content</div>}
      </FantasyAuthGate>
    );

    expect(screen.getByText("Finishing account setup")).toBeInTheDocument();
    expect(screen.getByText("Preparing your account for the first time.")).toBeInTheDocument();
  });
});
