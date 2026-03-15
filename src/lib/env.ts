/**
 * Runtime environment variable validation.
 *
 * Import this module early (e.g. in instrumentation.ts or layout.tsx) to
 * fail fast with a clear message when required env vars are missing.
 */

import { z } from "zod/v4";

const serverEnvSchema = z.object({
  // Auth
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  NEXTAUTH_URL: z.url("NEXTAUTH_URL must be a valid URL").optional(),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),

  // Jobs
  JOBS_API_SECRET: z.string().min(1, "JOBS_API_SECRET is required").optional(),

  // Optional
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let validated = false;

/**
 * Validate all required environment variables. Call once at startup.
 * Throws with a descriptive message listing all missing/invalid vars.
 */
export function validateEnv(): ServerEnv {
  if (validated) return process.env as unknown as ServerEnv;

  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    console.error(
      "\n[env] Invalid environment variables:\n" + formatted + "\n"
    );

    // In development, warn but don't crash (some vars may be optional for local dev).
    if (process.env.NODE_ENV !== "production") {
      console.warn("[env] Continuing in development mode despite env validation errors.\n");
      validated = true;
      return process.env as unknown as ServerEnv;
    }

    throw new Error("Invalid environment variables. See logs above.");
  }

  validated = true;
  return result.data;
}
