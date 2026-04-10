import { describe, expect, it, vi, beforeEach } from "vitest";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/nwsl",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  AUTH_SECRET: "a]~C+K2f:B&J8rNz7&H3x!9Lp@Q5vW$m",
  JOBS_API_SECRET: "jobs-secret-at-least-16",
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env validation", () => {
  it("throws when DATABASE_URL is missing", async () => {
    const envWithoutDb = Object.fromEntries(
      Object.entries(validEnv).filter(([key]) => key !== "DATABASE_URL")
    );
    for (const [key, value] of Object.entries(envWithoutDb)) {
      vi.stubEnv(key, value);
    }
    // Ensure DATABASE_URL is not set
    vi.stubEnv("DATABASE_URL", "");

    await expect(
      import("../env")
    ).rejects.toThrow("Invalid environment configuration");
  });

  it("throws when neither SUPABASE_PUBLISHABLE_KEY nor ANON_KEY is set", async () => {
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }
    // Remove the publishable key
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    // Make sure anon key is also absent
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(
      import("../env")
    ).rejects.toThrow("Invalid environment configuration");
  });

  it("parses valid environment variables correctly", async () => {
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }

    const { env } = await import("../env");

    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(validEnv.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
    expect(env.AUTH_SECRET).toBe(validEnv.AUTH_SECRET);
    expect(env.JOBS_API_SECRET).toBe(validEnv.JOBS_API_SECRET);
  });

  it("accepts ANON_KEY as alternative to PUBLISHABLE_KEY", async () => {
    const envWithAnon = Object.fromEntries(
      Object.entries(validEnv).filter(
        ([key]) => key !== "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
      )
    );
    for (const [key, value] of Object.entries(envWithAnon)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-value");

    const { env } = await import("../env");

    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key-value");
  });

  it("requires PREDICTION_API_SECRET when PREDICTION_API_URL is configured", async () => {
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("PREDICTION_API_URL", "https://model.example");
    vi.stubEnv("PREDICTION_API_SECRET", "");

    await expect(
      import("../env")
    ).rejects.toThrow("Invalid environment configuration");
  });
});
