import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

vi.mock("./email", () => ({
  sendEmail: mocks.sendEmail,
}));

import { sendNotification } from "./notification-service";

describe("notification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it("writes one row per requested live channel", async () => {
    await sendNotification({
      userId: "00000000-0000-0000-0000-000000000001",
      leagueId: "00000000-0000-0000-0000-000000000002",
      type: "TRADE_PROPOSED",
      title: "Trade offer",
      body: "A trade is waiting.",
      channels: ["in_app", "push"],
    });

    expect(mocks.from).toHaveBeenCalledWith("fantasy_notifications");
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "in_app",
        type: "TRADE_PROPOSED",
      })
    );
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "push",
        sent_at: null,
      })
    );
  });

  it("uses the real email delivery path when an address is supplied", async () => {
    await sendNotification({
      userId: "00000000-0000-0000-0000-000000000001",
      type: "DRAFT_STARTING",
      title: "On the clock",
      body: "Make your pick.",
      channels: ["email"],
      emailPayload: {
        to: "manager@example.com",
        subject: "Your turn",
        html: "<p>Your turn</p>",
      },
    });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email" })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "manager@example.com" })
    );
  });
});
