import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  hasSupabaseServerConfig: vi.fn(() => true),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseServerConfig: mocks.hasSupabaseServerConfig,
  getSupabaseServerClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "./route";

function request(
  body: string,
  authorization = "Bearer test-data-secret",
  extraHeaders: Record<string, string> = {}
) {
  return new Request("https://example.test/api/nwsl-data/publish", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body,
  });
}

describe("NWSL data publish route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseServerConfig.mockReturnValue(true);
    process.env.NWSL_DATA_PUBLISH_SECRET = "test-data-secret";
  });

  it("fails closed when the publish secret is not configured", async () => {
    delete process.env.NWSL_DATA_PUBLISH_SECRET;

    const response = await POST(request("{}"));

    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a missing or incorrect bearer token", async () => {
    const response = await POST(request("{}", "Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized payload before reading it", async () => {
    const response = await POST(
      request("{}", "Bearer test-data-secret", {
        "content-length": "4400001",
      })
    );

    expect(response.status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reads a payload declared at the Vercel-safe cap", async () => {
    const response = await POST(
      request("{}", "Bearer test-data-secret", {
        "content-length": "4400000",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without reaching Supabase", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid snapshot without reaching Supabase", async () => {
    const response = await POST(request("{}"));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
