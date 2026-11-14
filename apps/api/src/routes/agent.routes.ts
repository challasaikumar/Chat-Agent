import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { z } from "zod";
import { AgentService } from "../agent/agent.service.js";
import { translateAgentError } from "../agent/errors/agent.error-handler.js";
import { createSseWriter } from "../agent/streaming/sse.writer.js";
import { AgentError } from "../agent/errors/agent.errors.js";
import { AppError, badRequest } from "../utils/errors.js";
import { getRequestUserId } from "../auth/auth.middleware.js";
import { serializeDates } from "../utils/serialize.js";

function streamErrorPayload(
  error: unknown,
  aborted: boolean,
): { code: string; message: string; retryable: boolean } {
  if (aborted) {
    return {
      code: "AGENT_CANCELLED",
      message: "Generation was cancelled",
      retryable: false,
    };
  }

  if (error instanceof AgentError) {
    const passThrough =
      error.code === "AGENT_CONFIGURATION_ERROR" ||
      error.code === "AGENT_VALIDATION_ERROR" ||
      error.code === "AGENT_PROVIDER_ERROR" ||
      error.code === "AGENT_TIMEOUT_ERROR" ||
      error.code === "AGENT_BUDGET_EXHAUSTED" ||
      error.code === "AGENT_TOOL_ERROR" ||
      error.code === "AGENT_INCOMPLETE_RESPONSE" ||
      error.code === "AGENT_CONFLICT";
    return {
      code: error.code,
      message: passThrough ? error.message : "Unable to complete the request",
      retryable:
        error.code !== "AGENT_VALIDATION_ERROR" &&
        error.code !== "AGENT_CONFIGURATION_ERROR",
    };
  }

  if (error instanceof AppError) {
    if (error.code === "NOT_FOUND") {
      return {
        code: "NOT_FOUND",
        message: "This chat was not found. Start a new conversation and try again.",
        retryable: false,
      };
    }
    return {
      code: error.code,
      message: error.message || "Unable to complete the request",
      retryable: error.statusCode >= 500,
    };
  }

  return {
    code: "AGENT_EXECUTION_ERROR",
    message:
      error instanceof Error && error.message
        ? error.message
        : "Unable to complete the request",
    retryable: true,
  };
}

const runIdParams = z.object({
  id: z.string().uuid(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  const agent = new AgentService(app.db, app.env, {
    searchProvider: app.searchProvider,
    responsesClient: app.responsesClient,
    logger: app.log,
  });

  app.post("/api/agent/turn", async (request, reply) => {
    try {
      const result = await agent.runTurn(request.body, {
        userId: getRequestUserId(request),
        requestId: request.id,
      });
      return reply.status(200).send(ok(serializeDates(result)));
    } catch (error) {
      translateAgentError(error);
    }
  });

  app.post("/api/agent/turn/stream", async (request, reply) => {
    const abort = new AbortController();
    // IMPORTANT: do NOT listen to request.raw "close" — for POST bodies that
    // event fires when the inbound body finishes, which aborts the agent before
    // it starts. Track the response/socket instead (true client disconnect).
    const onClientDisconnect = () => {
      if (!abort.signal.aborted) {
        abort.abort();
      }
    };

    const heartbeatMs = app.env.AGENT_STREAM_HEARTBEAT_MS;
    const maxDurationMs = app.env.AGENT_STREAM_MAX_DURATION_MS;
    const writer = createSseWriter(request, reply);

    reply.raw.on("close", onClientDisconnect);
    request.raw.socket?.on("close", onClientDisconnect);

    const heartbeat = setInterval(() => {
      writer.comment(`heartbeat ${Date.now()}`);
      writer.flush();
    }, heartbeatMs);

    const maxTimer = setTimeout(() => {
      abort.abort();
    }, maxDurationMs);

    try {
      await agent.runTurnStream(
        request.body,
        {
          userId: getRequestUserId(request),
          requestId: request.id,
          signal: abort.signal,
        },
        (event) => {
          writer.send(event);
          writer.flush();
        },
      );
    } catch (error) {
      if (!writer.closed) {
        const aborted =
          abort.signal.aborted ||
          (error instanceof Error &&
            (error.name === "AbortError" ||
              /aborted/i.test(error.message)));
        writer.send({
          type: "run.error",
          ...streamErrorPayload(error, aborted),
        });
        writer.flush();
      }
      request.log.error({ err: error }, "Agent stream failed");
    } finally {
      clearInterval(heartbeat);
      clearTimeout(maxTimer);
      reply.raw.off("close", onClientDisconnect);
      request.raw.socket?.off("close", onClientDisconnect);
      writer.close();
    }
  });

  app.get("/api/agent/runs/:id", async (request) => {
    const { id } = parseOrThrow(runIdParams, request.params);
    try {
      const run = await agent.getRun(id, getRequestUserId(request));
      return ok(serializeDates(run));
    } catch (error) {
      translateAgentError(error);
    }
  });
}
