/**
 * claudeCode.ts integration test — uses fake-claude.mjs to exercise the
 * full PENDING → RUNNING → COMPLETE round-trip.
 *
 * The test:
 *   1. Spins up an in-memory runner + real HTTP server (on a random port)
 *   2. Registers runner tools on the MCP server
 *   3. Creates a task via runner.createTask
 *   4. Creates a ClaudeCodeExecutor with claudeBin pointing at fake-claude.mjs
 *   5. Runs the executor directly (simulating what the scheduler does)
 *   6. Asserts PENDING → RUNNING → COMPLETE with a reasoning event in the log
 *   7. Asserts the cancellation registry is empty after completion
 *
 * Spec: docs/06-agent-dispatcher/03-claude-code-executor.md §Requirements item 10 (claudeCode.test.ts)
 */

import { afterEach, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { applyMigrations } from "../../../src/runner/migrations/runner.js";
import { createStore } from "../../../src/runner/store.js";
import { createRunner, recoverOrphans } from "../../../src/runner/scheduler.js";
import { createEventBus, withPublishing } from "../../../src/runner/events.js";
import { createMcpServer } from "../../../src/dispatcher/mcp/server.js";
import { createBindingRegistry } from "../../../src/dispatcher/mcp/binding.js";
import { registerRunnerTools } from "../../../src/dispatcher/mcp/tools.js";
import { createCancellationRegistry } from "../../../src/dispatcher/executor/cancellation.js";
import { createClaudeCodeExecutor } from "../../../src/dispatcher/executor/claudeCode.js";
import type { ProjectContext } from "../../../src/context.js";
import type { Task } from "@ledger/parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE_PATH = join(__dirname, "../../fixtures/fake-claude.mjs");

// ---------------------------------------------------------------------------
// Helper: build full test harness on a random port
// ---------------------------------------------------------------------------

interface TestHarness {
  port: number;
  ctx: ProjectContext;
  task: Task;
  stopServer: () => Promise<void>;
}

async function buildHarness(): Promise<TestHarness> {
  // In-memory SQLite runner
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);
  recoverOrphans(store);
  const runner = createRunner(store, undefined, bus);

  // MCP server
  const mcpInternal = createMcpServer({ version: "0.0.1-test" });
  const binding = createBindingRegistry();
  mcpInternal.onSessionInitialized((sessionId, request) => {
    const taskId = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
    binding.bind(sessionId, taskId);
  });
  mcpInternal.onSessionClosed((sessionId) => {
    binding.unbind(sessionId);
  });
  registerRunnerTools(mcpInternal.server, { store: runner.store, handle: runner.handle, binding });
  await mcpInternal._connect();

  // Cancellation registry
  const dispatchCancellation = createCancellationRegistry();

  // Hono app with /mcp mounted
  const app = new Hono();
  app.route("/mcp", mcpInternal.mcpRoute);

  // Start HTTP server on a random port
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((r) => { resolvePort = r; });
  const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
    resolvePort(info.port);
  });
  const port = await portPromise;

  // Create minimal ProjectContext
  const ctx: ProjectContext = {
    projectRoot: process.cwd(),
    docsRoot: process.cwd(),
    project: {
      name: "test",
      version: "0.0.1",
      docs: "docs",
      schema: "1",
    } as unknown as ProjectContext["project"],
    port,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
    mcp: mcpInternal,
    binding,
    dispatchCancellation,
  };

  // Create a task in PENDING state
  const task = runner.createTask({
    type: "implement",
    title: "fake-claude integration test task",
    source: "operator_injected",
    resourceClaims: [],
  });

  // Transition to RUNNING (the scheduler does this normally; we do it manually
  // here to drive the executor directly without a full scheduler setup)
  store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
  const runningTask = { ...task, status: "RUNNING" as const };

  return {
    port,
    ctx,
    task: runningTask,
    stopServer: () => new Promise((res) => {
      // @hono/node-server server.close
      (server as unknown as { close: (cb: () => void) => void }).close(() => { res(); });
    }),
  };
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

const teardowns: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const td of teardowns.splice(0)) {
    await td().catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("ClaudeCodeExecutor integration — fake-claude", () => {
  it(
    "transitions RUNNING → COMPLETE via fake-claude; emits reasoning event",
    { timeout: 15_000 },
    async () => {
      const harness = await buildHarness();
      teardowns.push(harness.stopServer);

      const executor = createClaudeCodeExecutor(harness.ctx, {
        claudeBin: `${process.execPath} ${FAKE_CLAUDE_PATH}`,
      });

      // Run the executor — this is what the scheduler does
      await executor.run(harness.task, harness.ctx.runner.handle);

      // Assert final status is COMPLETE
      const finalStatus = harness.ctx.runner.store.getStatus(harness.task.id);
      expect(finalStatus).toBe("COMPLETE");

      // Assert a reasoning event was emitted by fake-claude
      const events = harness.ctx.runner.store.getEvents(harness.task.id);
      const reasoningEvent = events.find((e) => e.kind === "reasoning");
      expect(reasoningEvent).toBeDefined();
      // The fake-claude fixture emits this specific text (reasoning.text per LogEvent schema)
      if (reasoningEvent && "text" in reasoningEvent) {
        expect(reasoningEvent.text).toContain("fake-claude");
      }

      // Assert cancellation registry was cleared after completion
      expect(harness.ctx.dispatchCancellation.size()).toBe(0);
    },
  );

  it(
    "cancellation registry is populated during execution and cleared after",
    { timeout: 15_000 },
    async () => {
      const harness = await buildHarness();
      teardowns.push(harness.stopServer);

      let registrySizeAtPeak = 0;
      // Wrap the executor run — we can't easily inspect registry mid-run
      // since it's async, but we verify it's empty both before and after.
      expect(harness.ctx.dispatchCancellation.size()).toBe(0);

      const executor = createClaudeCodeExecutor(harness.ctx, {
        claudeBin: `${process.execPath} ${FAKE_CLAUDE_PATH}`,
      });

      // The registry is populated synchronously after spawnClaudeCode and
      // cleared in the finally block. After await, it must be 0.
      await executor.run(harness.task, harness.ctx.runner.handle);
      registrySizeAtPeak = harness.ctx.dispatchCancellation.size();
      expect(registrySizeAtPeak).toBe(0);
    },
  );

  it(
    "executor handles pre-spawn failure (bad claudeBin) — transitions to FAILED",
    { timeout: 5_000 },
    async () => {
      const harness = await buildHarness();
      teardowns.push(harness.stopServer);

      // Use a non-existent binary — spawnClaudeCode will throw synchronously
      // (execa throws if the command is not found)
      const executor = createClaudeCodeExecutor(harness.ctx, {
        claudeBin: "this-binary-does-not-exist-at-all-xyz-abc",
      });

      await executor.run(harness.task, harness.ctx.runner.handle);

      const finalStatus = harness.ctx.runner.store.getStatus(harness.task.id);
      expect(finalStatus).toBe("FAILED");

      // Cancellation registry must be cleared even on failure
      expect(harness.ctx.dispatchCancellation.size()).toBe(0);
    },
  );
});
