import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductAnalyticsProvider } from "./product-analytics-provider";

const identifyFantasyUser = vi.fn();
const resetFantasyIdentity = vi.fn();

interface AuthState {
  hasHydrated: boolean;
  profile: {
    user_id: string;
    favorite_club: string | null;
    experience_level: string | null;
  } | null;
  user: { id: string } | null;
}

let authState: AuthState;

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/components/providers/fantasy-auth-provider", () => ({
  useFantasyAuth: () => authState,
}));

vi.mock("@/lib/analytics/events", () => ({
  identifyFantasyUser: (...args: unknown[]) => identifyFantasyUser(...args),
  resetFantasyIdentity: (...args: unknown[]) => resetFantasyIdentity(...args),
}));

beforeEach(() => {
  identifyFantasyUser.mockReset();
  resetFantasyIdentity.mockReset();
  authState = {
    hasHydrated: false,
    profile: null,
    user: null,
  };
});

describe("ProductAnalyticsProvider", () => {
  it("waits for auth hydration before synchronizing identity", () => {
    render(
      <ProductAnalyticsProvider>
        <p>Child</p>
      </ProductAnalyticsProvider>
    );

    expect(identifyFantasyUser).not.toHaveBeenCalled();
    expect(resetFantasyIdentity).not.toHaveBeenCalled();
  });

  it("identifies local-mode profiles with allowlisted traits", () => {
    authState = {
      hasHydrated: true,
      profile: {
        experience_level: "casual",
        favorite_club: "Kansas City Current",
        user_id: "local_user_1",
      },
      user: null,
    };

    render(
      <ProductAnalyticsProvider>
        <p>Child</p>
      </ProductAnalyticsProvider>
    );

    expect(identifyFantasyUser).toHaveBeenCalledWith("local_user_1", {
      experienceLevel: "casual",
      favoriteClub: "Kansas City Current",
    });
  });

  it("refreshes traits and resets once after sign-out", () => {
    authState = {
      hasHydrated: true,
      profile: {
        experience_level: "new",
        favorite_club: "Bay FC",
        user_id: "user_1",
      },
      user: { id: "user_1" },
    };

    const { rerender } = render(
      <ProductAnalyticsProvider>
        <p>Child</p>
      </ProductAnalyticsProvider>
    );

    authState = {
      ...authState,
      profile: {
        ...authState.profile!,
        experience_level: "experienced",
      },
    };
    rerender(
      <ProductAnalyticsProvider>
        <p>Child</p>
      </ProductAnalyticsProvider>
    );

    expect(identifyFantasyUser).toHaveBeenLastCalledWith("user_1", {
      experienceLevel: "experienced",
      favoriteClub: "Bay FC",
    });

    authState = {
      hasHydrated: true,
      profile: null,
      user: null,
    };
    rerender(
      <ProductAnalyticsProvider>
        <p>Child</p>
      </ProductAnalyticsProvider>
    );
    rerender(
      <ProductAnalyticsProvider>
        <p>Child</p>
      </ProductAnalyticsProvider>
    );

    expect(resetFantasyIdentity).toHaveBeenCalledTimes(1);
  });
});
