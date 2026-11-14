import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { isOriginAllowed } from "./origin-allowlist.js";

export async function registerCors(app: FastifyInstance): Promise<void> {
  const allowed = app.env.APP_ALLOWED_ORIGINS;
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isOriginAllowed(origin, allowed));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "authorization",
      "x-csrf-token",
      "x-request-id",
      app.env.AUTH_CSRF_HEADER,
    ],
  });
}
