import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { z } from "zod";
import { ResearchService } from "../services/research.service.js";
import { SearchError } from "../search/search.interface.js";
import { AppError, badRequest } from "../utils/errors.js";
import { getRequestUserId } from "../auth/auth.middleware.js";
import { paginationQuerySchema } from "../utils/pagination.js";
import { serializeDates } from "../utils/serialize.js";

const snapshotIdParams = z.object({
  id: z.string().uuid(),
});

const listSnapshotsQuery = paginationQuerySchema.extend({
  conversationId: z.string().uuid().optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

function translateRouteError(error: unknown): never {
  if (error instanceof SearchError) {
    throw new AppError(error.message, {
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
      cause: error,
    });
  }
  throw error;
}

export async function researchRoutes(app: FastifyInstance): Promise<void> {
  const research = new ResearchService(
    app.db,
    app.env,
    app.searchProvider,
  );

  app.post("/api/research/search", async (request, reply) => {
    try {
      const result = await research.searchAndSave(request.body, {
        userId: getRequestUserId(request),
        requestId: request.id,
        logger: request.log,
      });

      return reply.status(201).send(
        ok(
          serializeDates({
            snapshot: result.snapshot,
            results: result.results,
            meta: result.meta,
          }),
        ),
      );
    } catch (error) {
      translateRouteError(error);
    }
  });

  app.get("/api/research/snapshots", async (request) => {
    const query = parseOrThrow(listSnapshotsQuery, request.query);
    const page = await research.listSnapshots(getRequestUserId(request), {
      conversationId: query.conversationId,
      limit: query.limit ?? 20,
      cursor: query.cursor,
    });
    return ok(serializeDates(page));
  });

  app.get("/api/research/snapshots/:id", async (request) => {
    const { id } = parseOrThrow(snapshotIdParams, request.params);
    const snapshot = await research.getSnapshot(id, getRequestUserId(request));
    return ok(serializeDates(snapshot));
  });

  app.get("/api/research/snapshots/:id/sources", async (request) => {
    const { id } = parseOrThrow(snapshotIdParams, request.params);
    const sources = await research.getSources(id, getRequestUserId(request));
    return ok(serializeDates({ items: sources, snapshotId: id }));
  });
}
