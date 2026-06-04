import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      ANTHROPIC_API_KEY: "sk-ant-test-placeholder",
    },
    // SQLite file DBs in the test fixtures cannot be opened by concurrent vitest workers.
    // fileParallelism: false ensures each test file runs sequentially, avoiding WAL lock contention.
    fileParallelism: false,
  },
});
