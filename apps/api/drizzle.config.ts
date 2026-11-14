import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
loadEnv({ path: resolve(rootDir, ".env") });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // `drizzle-kit generate` does not connect; `drizzle-kit studio` / `push` need a real URL.
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  },
});
