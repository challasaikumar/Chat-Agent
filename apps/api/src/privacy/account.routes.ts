import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { getRequestUserId, clearSessionCookie } from "../auth/auth.middleware.js";
import { deleteAccountSchema } from "../auth/auth.schemas.js";
import { badRequest } from "../utils/errors.js";
import { DataExportService } from "./data-export.service.js";
import { DataDeletionService } from "./data-deletion.service.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  const exporter = new DataExportService(app.db);
  const deletion = new DataDeletionService(app.db, app.authService);

  app.get("/api/account/export", async (request, reply) => {
    const userId = getRequestUserId(request);
    await app.authService.audit.record({
      actorUserId: userId,
      action: "account.export",
      result: "success",
      requestId: request.id,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    const payload = await exporter.exportUserData(userId);
    void reply.header(
      "Content-Disposition",
      `attachment; filename="minimi-export-${userId.slice(0, 8)}.json"`,
    );
    return ok(payload);
  });

  app.delete("/api/account/data", async (request, reply) => {
    const userId = getRequestUserId(request);
    const parsed = deleteAccountSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw badRequest("Confirmation required", parsed.error.flatten());
    }
    const result = await deletion.deleteUserData({
      userId,
      password: parsed.data.password,
      requestId: request.id,
    });
    clearSessionCookie(reply, app.env);
    return ok(result);
  });
}
