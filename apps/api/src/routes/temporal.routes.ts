import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { z } from "zod";
import { TemporalService } from "../temporal/temporal.service.js";
import { temporalPreviewBodySchema } from "../temporal/temporal.schemas.js";
import { badRequest, notFound } from "../utils/errors.js";
import { getRequestUserId } from "../auth/auth.middleware.js";
import { serializeDates } from "../utils/serialize.js";
import { paginationQuerySchema } from "../utils/pagination.js";

const idParams = z.object({
  id: z.string().uuid(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

export async function temporalRoutes(app: FastifyInstance): Promise<void> {
  const temporal = new TemporalService(app.db, app.env);

  app.get("/api/temporal/comparisons", async (request) => {
    const query = parseOrThrow(
      paginationQuerySchema.extend({
        conversationId: z.string().uuid().optional(),
      }),
      request.query,
    );
    const items = await temporal.listComparisons(
      getRequestUserId(request),
      query.limit,
      query.conversationId,
    );
    return ok(serializeDates({ items, limit: query.limit }));
  });

  app.get("/api/temporal/comparisons/:id", async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const comparison = await temporal.getComparison(getRequestUserId(request), id);
    if (!comparison) {
      throw notFound("Comparison not found");
    }
    return ok(serializeDates(comparison));
  });

  app.get("/api/temporal/comparisons/:id/items", async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const comparison = await temporal.getComparison(getRequestUserId(request), id);
    if (!comparison) {
      throw notFound("Comparison not found");
    }
    const items = await temporal.listComparisonItems(id);
    return ok(serializeDates({ items }));
  });

  app.get("/api/temporal/claims", async (request) => {
    const query = parseOrThrow(paginationQuerySchema, request.query);
    const items = await temporal.listClaims(getRequestUserId(request), query.limit);
    return ok(serializeDates({ items, limit: query.limit }));
  });

  app.get("/api/temporal/claims/:id", async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const claim = await temporal.getClaim(getRequestUserId(request), id);
    if (!claim) {
      throw notFound("Claim not found");
    }
    return ok(serializeDates(claim));
  });

  app.get("/api/temporal/entities/:id/timeline", async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const items = await temporal.entityTimeline(getRequestUserId(request), id);
    return ok(serializeDates({ entityId: id, items }));
  });

  app.post("/api/temporal/comparisons/preview", async (request, reply) => {
    const body = parseOrThrow(temporalPreviewBodySchema, request.body);
    const timeZone = body.timeZone ?? app.env.APP_TIME_ZONE;
    const result = await temporal.preview({
      userId: getRequestUserId(request),
      conversationId: body.conversationId,
      entityNames: body.entityNames ?? [],
      fromDate: body.fromDate,
      toDate: body.toDate,
      timeZone,
      categories: body.categories,
    });
    return reply.status(200).send(ok(serializeDates(result)));
  });
}
