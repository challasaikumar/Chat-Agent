import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { z } from "zod";
import { MemoryService } from "../memory/memory.service.js";
import {
  advancedMemorySearchQuerySchema,
  entityTypeSchema,
  factCategorySchema,
  factPatchSchema,
} from "../memory/memory.schemas.js";
import { badRequest, notFound } from "../utils/errors.js";
import { getRequestUserId } from "../auth/auth.middleware.js";
import { serializeDates } from "../utils/serialize.js";

const searchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeZone: z.string().min(1).max(100).optional(),
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

const factsQuerySchema = z.object({
  category: factCategorySchema.optional(),
  entityId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  activeOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const entitiesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  entityType: entityTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  const memory = new MemoryService(
    app.db,
    app.env,
    app.memoryExtractor,
  );

  app.get("/api/memory/overview", async (request) => {
    return ok(serializeDates(await memory.overview(getRequestUserId(request))));
  });

  app.get("/api/memory/search", async (request) => {
    const query = parseOrThrow(searchQuerySchema, request.query);
    // Prefer advanced ranked search when q is present; keep Phase 02 date search.
    if (query.q && !query.date && !query.from && !query.to) {
      const advanced = await memory.advancedRetrieval.retrieve({
        userId: getRequestUserId(request),
        query: query.q,
        conversationId: query.conversationId,
        maxResults: query.limit,
        timeZone: query.timeZone,
      });
      return ok(serializeDates(advanced));
    }
    const result = await memory.search(getRequestUserId(request), query);
    return ok(serializeDates(result));
  });

  app.get("/api/memory/facts", async (request) => {
    const query = parseOrThrow(
      factsQuerySchema.merge(
        z.object({
          status: advancedMemorySearchQuerySchema.shape.status.optional(),
          projectId: z.string().uuid().optional(),
        }),
      ),
      request.query,
    );
    const limit = query.limit ?? 50;
    const facts = await memory.facts.list({
      userId: getRequestUserId(request),
      limit,
      category: query.category,
      entityId: query.projectId ?? query.entityId,
      conversationId: query.conversationId,
      activeOnly: query.activeOnly !== false,
    });
    return ok(serializeDates({ items: facts, limit }));
  });

  app.get("/api/memory/facts/:id", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const fact = await memory.facts.getById(params.id, getRequestUserId(request));
    if (!fact) {
      throw notFound("Memory fact not found");
    }
    const history = await memory.facts.getHistory(params.id, getRequestUserId(request));
    return ok(serializeDates({ fact, history }));
  });

  app.get("/api/memory/facts/:id/history", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const fact = await memory.facts.getById(params.id, getRequestUserId(request));
    if (!fact) {
      throw notFound("Memory fact not found");
    }
    return ok(
      serializeDates({
        items: await memory.facts.getHistory(params.id, getRequestUserId(request)),
      }),
    );
  });

  app.patch("/api/memory/facts/:id", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const body = parseOrThrow(factPatchSchema, request.body);
    const updated = await memory.privacy.correct(getRequestUserId(request), params.id, body);
    if (!updated) {
      throw notFound("Memory fact not found");
    }
    return ok(serializeDates(updated));
  });

  app.delete("/api/memory/facts/:id", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const retracted = await memory.privacy.retract(getRequestUserId(request), params.id);
    if (!retracted) {
      throw notFound("Memory fact not found");
    }
    return ok(serializeDates(retracted));
  });

  app.get("/api/memory/projects", async (request) => {
    const userId = getRequestUserId(request);
    const projects = await memory.projects.listProjects();
    return ok(
      serializeDates({
        items: await Promise.all(
          projects.map(async (project) => ({
            id: project.id,
            name: project.displayName,
            aliases: project.aliases,
            summary: await memory.projects.getLatestSummary(userId, project.id),
          })),
        ),
      }),
    );
  });

  app.get("/api/memory/projects/:id", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const projectMemory = await memory.projects.getProjectMemory(
      getRequestUserId(request),
      params.id,
    );
    if (!projectMemory) {
      throw notFound("Project not found");
    }
    return ok(serializeDates(projectMemory));
  });

  app.get("/api/memory/projects/:id/timeline", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const project = await memory.entities.getById(params.id);
    if (!project || project.entityType !== "project") {
      throw notFound("Project not found");
    }
    return ok(
      serializeDates({
        items: await memory.projects.getTimeline(getRequestUserId(request), params.id),
      }),
    );
  });

  app.get("/api/memory/preferences", async (request) => {
    return ok(
      serializeDates({ items: await memory.preferences.list(getRequestUserId(request), 100) }),
    );
  });

  app.get("/api/memory/entities", async (request) => {
    const query = parseOrThrow(entitiesQuerySchema, request.query);
    const limit = query.limit ?? 50;
    const entities = await memory.entities.search({
      q: query.q,
      entityType: query.entityType,
      limit,
    });
    return ok(serializeDates({ items: entities, limit }));
  });

  app.get("/api/memory/entities/:id", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const entity = await memory.entities.getById(params.id);
    if (!entity) {
      throw notFound("Entity not found");
    }
    return ok(serializeDates(entity));
  });

  app.get("/api/memory/entities/:id/relationships", async (request) => {
    const params = parseOrThrow(z.object({ id: z.string().uuid() }), request.params);
    const entity = await memory.entities.getById(params.id);
    if (!entity) {
      throw notFound("Entity not found");
    }
    return ok(
      serializeDates({
        items: await memory.relationships.listForEntity(getRequestUserId(request), params.id, 100),
      }),
    );
  });

  app.post("/api/memory/consolidate", async (request) => {
    return ok(serializeDates(await memory.consolidate(getRequestUserId(request))));
  });

  app.post("/api/memory/process", async (request) => {
    const body = parseOrThrow(
      z.object({ conversationId: z.string().uuid() }).strict(),
      request.body,
    );
    const result = await memory.processConversation(
      body.conversationId,
      getRequestUserId(request),
    );
    return ok(serializeDates(result));
  });
}
