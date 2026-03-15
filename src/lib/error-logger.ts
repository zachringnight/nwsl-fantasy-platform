/**
 * Lightweight error logging utility for production use.
 *
 * Captures errors with context (route, user, metadata) and writes structured
 * JSON to stderr. In production, pipe these to your log aggregator (CloudWatch,
 * Datadog, fly.io logs, etc.) — no third-party SDK required.
 *
 * Future: swap the `writeLog` function body if you later adopt an external
 * service, without changing call sites.
 */

export interface ErrorContext {
  /** The route or function where the error occurred. */
  route?: string;
  /** The authenticated user ID, if available. */
  userId?: string;
  /** HTTP method (GET, POST, etc.). */
  method?: string;
  /** Arbitrary metadata to attach to the log entry. */
  meta?: Record<string, unknown>;
}

interface ErrorLogEntry {
  level: "error" | "warn";
  message: string;
  timestamp: string;
  route?: string;
  userId?: string;
  method?: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

function writeLog(entry: ErrorLogEntry) {
  // Structured JSON to stderr — parseable by any log aggregator.
  console.error(JSON.stringify(entry));
}

/**
 * Log an error with structured context.
 */
export function logError(error: unknown, context: ErrorContext = {}) {
  const message =
    error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error ? error.stack : undefined;

  writeLog({
    level: "error",
    message,
    timestamp: new Date().toISOString(),
    route: context.route,
    userId: context.userId,
    method: context.method,
    stack,
    meta: context.meta,
  });
}

/**
 * Log a warning (non-fatal issue).
 */
export function logWarning(message: string, context: ErrorContext = {}) {
  writeLog({
    level: "warn",
    message,
    timestamp: new Date().toISOString(),
    route: context.route,
    userId: context.userId,
    method: context.method,
    meta: context.meta,
  });
}
