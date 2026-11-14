import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

export async function registerCors(app: FastifyInstance): Promise<void> {
  const allowed = new Set(app.env.APP_ALLOWED_ORIGINS);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowed.has(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "x-csrf-token",
      "x-request-id",
      app.env.AUTH_CSRF_HEADER,
    ],
  });
}
