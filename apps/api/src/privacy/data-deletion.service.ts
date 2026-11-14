import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import { users } from "../db/schema.js";
import type { AuthService } from "../auth/auth.service.js";
import { AppError } from "../utils/errors.js";
import { resetSharedSearchCache } from "../performance/search-cache.js";

export class DataDeletionService {
  constructor(
    private readonly db: AppDatabase,
    private readonly auth: AuthService,
  ) {}

  async deleteUserData(input: {
    userId: string;
    password: string;
    requestId?: string | null;
  }): Promise<{ deleted: true }> {
    const user = await this.auth.repo.findUserById(input.userId);
    if (!user || !user.passwordHash) {
      throw new AppError("Account not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    const ok = await this.auth.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      await this.auth.audit.record({
        actorUserId: input.userId,
        action: "account.delete",
        result: "failure",
        requestId: input.requestId,
      });
      throw new AppError("Password confirmation failed", {
        statusCode: 401,
        code: "AUTH_FAILED",
      });
    }

    await this.auth.sessions.revokeAll(input.userId);
    resetSharedSearchCache();

    // Cascade deletes user-owned rows via FK. Full-text vectors live on the same rows (no separate FTS tables).
    await this.db.delete(users).where(eq(users.id, input.userId));

    await this.auth.audit.record({
      actorUserId: null,
      action: "account.delete",
      result: "success",
      resourceType: "user",
      resourceId: input.userId,
      requestId: input.requestId,
      metadata: { retained: "audit_metadata_only" },
    });

    return { deleted: true };
  }
}
