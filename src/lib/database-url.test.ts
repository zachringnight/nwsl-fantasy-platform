import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequiredDatabaseUrl } from "@/lib/database-url";

describe("getRequiredDatabaseUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when DATABASE_URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");

    expect(() => getRequiredDatabaseUrl()).toThrow(
      "DATABASE_URL is not configured"
    );
  });

  it("returns a trimmed database URL", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "  postgresql://user:pass@localhost:5432/nwsl  "
    );

    expect(getRequiredDatabaseUrl()).toBe(
      "postgresql://user:pass@localhost:5432/nwsl"
    );
  });
});
