import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "apps/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
    // DB-backed suites need DATABASE_URL_TEST (disposable Postgres) and are skipped without it;
    // each test database gets its own schema so files can run in parallel.
    fileParallelism: true,
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
