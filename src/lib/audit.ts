import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function logAuthEvent(
  action: string,
  opts: {
    userId?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: opts.userId ? "USER" : "SYSTEM",
        actorUserId: opts.userId ?? null,
        action,
        targetType: "auth",
        targetId: opts.targetId ?? opts.userId ?? "anonymous",
        metadata: opts.metadata ? JSON.parse(JSON.stringify(opts.metadata)) : undefined,
      },
    });
  } catch (err) {
    logger.error({ err, action }, "[audit] Failed to write auth event");
  }
}
