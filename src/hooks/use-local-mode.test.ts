import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadState = vi.fn().mockReturnValue({
  currentUserId: null,
  users: [],
  leagues: [],
});
const mockSubscribe = vi.fn().mockReturnValue(() => {});

vi.mock("@/lib/local-mode-store", () => ({
  readLocalAppState: () => mockReadState(),
  subscribeToLocalAppState: (cb: () => void) => mockSubscribe(cb),
}));

// Import after mocks
const { useLocalModeState } = await import("./use-local-mode");

describe("useLocalModeState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadState.mockReturnValue({
      currentUserId: null,
      users: [],
      leagues: [],
    });
  });

  it("returns initial state with no user", () => {
    const { result } = renderHook(() => useLocalModeState());

    expect(result.current.currentUser).toBeNull();
    expect(result.current.currentUserLeagues).toEqual([]);
  });

  it("sets hasHydrated after effect runs", () => {
    const { result } = renderHook(() => useLocalModeState());
    expect(result.current.hasHydrated).toBe(true);
  });

  it("returns current user when state has one", () => {
    mockReadState.mockReturnValue({
      currentUserId: "user-1",
      users: [
        { id: "user-1", displayName: "Test User", email: "test@test.com" },
      ],
      leagues: [],
    });

    const { result } = renderHook(() => useLocalModeState());
    expect(result.current.currentUser).toEqual(
      expect.objectContaining({ id: "user-1", displayName: "Test User" })
    );
  });

  it("filters leagues for current user", () => {
    mockReadState.mockReturnValue({
      currentUserId: "user-1",
      users: [{ id: "user-1", displayName: "Test" }],
      leagues: [
        { id: "lg-1", members: [{ userId: "user-1" }] },
        { id: "lg-2", members: [{ userId: "user-2" }] },
      ],
    });

    const { result } = renderHook(() => useLocalModeState());
    expect(result.current.currentUserLeagues).toHaveLength(1);
    expect(result.current.currentUserLeagues[0].id).toBe("lg-1");
  });

  it("subscribes to state changes", () => {
    renderHook(() => useLocalModeState());
    expect(mockSubscribe).toHaveBeenCalled();
  });
});
