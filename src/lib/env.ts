import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Supabase supports both naming conventions — at least one of each pair must be set
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional().transform((v) => v || undefined),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().transform((v) => v || undefined),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32),
  JOBS_API_SECRET: z.string().min(16),
  PREDICTION_API_URL: z.string().url().optional(),
  PREDICTION_API_SECRET: z.string().min(16).optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_ANALYTICS_ID: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  API_FOOTBALL_KEY: z.string().optional(),
});

const envSchemaRefined = envSchema.refine(
  (env) =>
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    message:
      "Either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
  }
).refine(
  (env) => !env.PREDICTION_API_URL || !!env.PREDICTION_API_SECRET,
  {
    path: ["PREDICTION_API_SECRET"],
    message:
      "PREDICTION_API_SECRET must be set when PREDICTION_API_URL is configured",
  }
);

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchemaRefined.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment configuration. Check server logs.");
  }
  return result.data;
}

export const env = validateEnv();
