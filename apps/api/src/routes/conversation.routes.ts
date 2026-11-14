import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { z } from "zod";
import { ConversationService } from "../services/conversation.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { badRequest } from "../utils/errors.js";
import { getRequestUserId } from "../auth/auth.middleware.js";
import { paginationQuerySchema } from "../utils/pagination.js";
import { serializeDates } from "../utils/serialize.js";

const createConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

const updateConversationSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined, {
    message: "At least one of title or archived is required",
  });

const createMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().min(1).max(50_000),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  const conversations = new ConversationService(app.db);
  const memory = new MemoryService(
    app.db,
    app.env,
    app.memoryExtractor,
  );

  app.post("/api/conversations", async (request, reply) => {
    const body = parseOrThrow(createConversationSchema, request.body ?? {});
    const conversation = await conversations.create(getRequestUserId(request), body.title);
    return reply.status(201).send(ok(serializeDates(conversation)));
  });

  app.get("/api/conversations", async (request) => {
    const query = parseOrThrow(
      paginationQuerySchema.extend({
        includeArchived: z
          .union([z.literal("true"), z.literal("false"), z.boolean()])
          .optional()
          .transform((value) => value === true || value === "true"),
      }),
      request.query,
    );

    const page = await conversations.list(getRequestUserId(request), {
      limit: query.limit ?? 20,
      cursor: query.cursor,
      includeArchived: Boolean(query.includeArchived),
    });

    return ok(serializeDates(page));
  });

  app.get("/api/conversations/:id", async (request) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const conversation = await conversations.get(getRequestUserId(request), id);
    return ok(serializeDates(conversation));
  });

  app.patch("/api/conversations/:id", async (request) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(updateConversationSchema, request.body ?? {});
    const conversation = await conversations.update(getRequestUserId(request), id, body);
    return ok(serializeDates(conversation));
  });

  app.delete("/api/conversations/:id", async (request, reply) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    await conversations.delete(getRequestUserId(request), id);
    return reply.status(200).send(ok({ deleted: true, id }));
  });

  app.get("/api/conversations/:id/messages", async (request) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const query = parseOrThrow(paginationQuerySchema, request.query);
    const page = await conversations.listMessages(getRequestUserId(request), id, {
      limit: query.limit ?? 20,
      cursor: query.cursor,
    });
    return ok(serializeDates(page));
  });

  app.post("/api/conversations/:id/messages", async (request, reply) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(createMessageSchema, request.body ?? {});
    const message = await conversations.addMessage(getRequestUserId(request), id, body);
    return reply.status(201).send(ok(serializeDates(message)));
  });

  app.get("/api/conversations/:id/summary", async (request) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const summary = await conversations.getLatestSummary(getRequestUserId(request), id);
    return ok(serializeDates({ summary }));
  });

  app.post("/api/conversations/:id/memory/process", async (request) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const result = await memory.processConversation(id, getRequestUserId(request));
    return ok(serializeDates(result));
  });
}
