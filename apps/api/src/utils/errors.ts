import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { fail } from "@minimi/shared";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
  }
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(message, { statusCode: 404, code: "NOT_FOUND" });
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(message, {
    statusCode: 400,
    code: "BAD_REQUEST",
    details,
  });
}

export async function errorHandler(
  error: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Prevent CDNs / Vercel from caching auth failures for /api/*.
  void reply.header("Cache-Control", "no-store");

  if (error instanceof AppError) {
    await reply.status(error.statusCode).send(
      fail(error.code, error.message, error.details),
    );
    return;
  }

  const statusCode =
    "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;

  const code =
    statusCode >= 500
      ? "INTERNAL_ERROR"
      : "REQUEST_ERROR";

  const message =
    statusCode >= 500
      ? "An unexpected error occurred"
      : error.message || "Request failed";

  await reply.status(statusCode).send(fail(code, message));
}
