import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import ResetPasswordPage from "./page";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

type AuthStateCallback = (event: string, session: object | null) => void;

describe("ResetPasswordPage", () => {
  let authStateCallback: AuthStateCallback | null;
  const unsubscribe = vi.fn();
  const getSession = vi.fn();
  const onAuthStateChange = vi.fn((callback: AuthStateCallback) => {
    authStateCallback = callback;

    return {
      data: {
        subscription: {
          unsubscribe,
        },
      },
    };
  });
  const updateUser = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    authStateCallback = null;
    unsubscribe.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockClear();
    updateUser.mockReset();

    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      auth: {
        getSession,
        onAuthStateChange,
        updateUser,
      },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the recovery auth event before expiring the link", async () => {
    getSession.mockResolvedValue({
      data: {
        session: null,
      },
      error: null,
    });

    render(<ResetPasswordPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(onAuthStateChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      authStateCallback?.("PASSWORD_RECOVERY", {
        user: {
          id: "user-1",
        },
      });
    });

    expect(screen.getByRole("button", { name: "Update password" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByText(/expired or was already used/i)).not.toBeInTheDocument();
  });

  it("shows an expired-link message when no recovery session is established", async () => {
    getSession.mockResolvedValue({
      data: {
        session: null,
      },
      error: null,
    });

    render(<ResetPasswordPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(onAuthStateChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(
      screen.getByText("This recovery link has expired or was already used. Request a new one.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
  });
});
