import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import { auditEvents } from "../db/schema.js";
import { hashForAudit } from "./secret-redactor.js";

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  result: "success" | "failure" | "denied";
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

export class AuditService {
  constructor(private readonly db: AppDatabase) {}

  async record(input: AuditInput): Promise<void> {
    await this.db
      .insert(auditEvents)
      .values({
        id: randomUUID(),
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        result: input.result,
        requestId: input.requestId ?? null,
        ipAddressHash: hashForAudit(input.ipAddress),
        userAgentHash: hashForAudit(input.userAgent),
        metadata: input.metadata ?? null,
        createdAt: new Date(),
      });
  }
}
