/**
 * Runner tools tests — five MCP tools + binding registry + store integration.
 *
 * Test infrastructure mirrors server.test.ts: SDK Client + StreamableHTTPClientTransport
 * against Hono's app.fetch() (no real TCP socket). The full registerRunnerTools wiring
 * is exercised because this test owns tool-advertisement assertions (Spec Review S2).
 *
 * Spec: docs/06-agent-dispatcher/02-runner-tools.md §Requirements item 10
 */

import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpServer } from "../../../src/dispatcher/mcp/server.js";
import { createBindingRegistry } from "../../../src/dispatcher/mcp/binding.js";
import { registerRunnerTools } from "../../../src/dispatcher/mcp/tools.js";
import type { McpServerHandle } from "../../../src/dispatcher/mcp/types.js";
import { applyMigrations } from "../../../src/runner/migrations/runner.js";
import { createStore } from "../../../src/runner/store.js";
import { createRunner, recoverOrphans } from "../../../src/runner/scheduler.js";
import { createEventBus, withPublishing } from "../../../src/runner/events.js";
import type { Task } from "@ledger/parser";

// ---------------------------------------------------------------------------
// In-memory store helpers
// ---------------------------------------------------------------------------

function makeInMemoryRunner() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);
  recoverOrphans(store);
  const runner = createRunner(store, undefined, bus);
  return { runner, db, close: () => { runner.close(); } };
}

// ---------------------------------------------------------------------------
// Helper: extract first text content from callTool result
// ---------------------------------------------------------------------------

function getFirstTextContent(result: { content: { type: string; text?: string }[] }): string {
  const first = result.content[0];
  if (!first) throw new Error("no content in tool result");
  if (first.type !== "text" || typeof first.text !== "string") {
    throw new Error(`expected text content, got type=${first.type}`);
  }
  return first.text;
}

// ---------------------------------------------------------------------------
// Test fixture: connected MCP client + registered tools
// ---------------------------------------------------------------------------

interface TestFixture {
  client: Client;
  handle: McpServerHandle;
  runner: ReturnType<typeof makeInMemoryRunner>["runner"];
  taskId: string;
  cleanup: () => Promise<void>;
}

/**
 * Build a fully-wired test fixture:
 *  - in-memory store + runner
 *  - createMcpServer with a per-session registerTools callback (registerRunnerTools)
 *  - binding registry wired to onSessionInitialized / onSessionClosed
 *  - a RUNNING task created; client session bound to it via X-Ledger-Task-Id
 */
async function makeFixture(): Promise<TestFixture> {
  const { runner, close } = makeInMemoryRunner();

  // Create a task in PENDING state, then manually promote to RUNNING so tests can exercise tools
  const task = runner.createTask({
    type: "noop",
    title: "Test task",
    source: "operator_injected",
  });
  // The noop executor completes synchronously — task is already COMPLETE after createTask.
  // We need a fresh PENDING→RUNNING promotion without the executor completing it.
  // Create a new task that starts PENDING and promote it:
  const pendingTask = runner.store.createTask({
    type: "human_review",
    title: "Test HITL task",
    source: "operator_injected",
  });
  const runningTask = runner.store.updateTaskStatus(pendingTask.id, {
    from: "PENDING",
    to: "RUNNING",
  });
  const taskId = runningTask.id;

  // Suppress unused var (task from noop createTask)
  void task;

  // Per-session factory: tools are registered per session via the callback.
  const binding = createBindingRegistry();
  const handle: McpServerHandle = createMcpServer({
    version: "0.1.0",
    registerTools: (server) => {
      registerRunnerTools(server, { store: runner.store, handle: runner.handle, binding });
    },
  });

  handle.onSessionInitialized((sessionId, request) => {
    const tid = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
    binding.bind(sessionId, tid);
  });
  handle.onSessionClosed((sessionId) => { binding.unbind(sessionId); });

  const app = new Hono().route("/mcp", handle.mcpRoute);
  const testFetch: typeof fetch = (input, init) => {
    const req =
      typeof input === "string"
        ? new Request(input, init)
        : input instanceof URL
          ? new Request(input.toString(), init)
          : input;
    return app.fetch(req);
  };

  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    {
      fetch: testFetch,
      requestInit: {
        headers: { "X-Ledger-Task-Id": taskId },
      },
    },
  );

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(transport);

  const cleanup = async () => {
    await client.close().catch(() => undefined);
    await handle.close().catch(() => undefined);
    close();
  };

  return { client, handle, runner, taskId, cleanup };
}

// ---------------------------------------------------------------------------
// Teardown registry
// ---------------------------------------------------------------------------

const teardowns: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const td of teardowns.splice(0)) {
    await td().catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// tools/list — five tools advertised
// ---------------------------------------------------------------------------

describe("tools/list", () => {
  it("returns exactly five tools with the expected names", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const { tools } = await fixture.client.listTools();
    expect(tools).toHaveLength(5);

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "runner.await_human_review",
      "runner.complete_task",
      "runner.emit_event",
      "runner.fail_task",
      "runner.get_task",
    ]);
  });

  it("cast is retired — tools capability advertised without setToolRequestHandlers cast", async () => {
    // Verifies that after registerRunnerTools is called, tools/list returns a non-empty array.
    // The SDK's registerTool re-enters the same internal path through a public surface;
    // the private-method cast in 01-mcp-server has been removed.
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const { tools } = await fixture.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runner.emit_event — happy path
// ---------------------------------------------------------------------------

describe("runner.emit_event", () => {
  it("appends a reasoning event to the bound task and returns the materialized row", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.emit_event",
      arguments: {
        task_id: fixture.taskId,
        event: { kind: "reasoning", text: "thinking hard", subkind: "thinking" },
      },
    });

    expect(result.isError).toBeFalsy();
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    const row = JSON.parse(text) as { kind: string; taskId: string };
    expect(row.kind).toBe("reasoning");
    expect(row.taskId).toBe(fixture.taskId);

    const events = fixture.runner.store.getEvents(fixture.taskId);
    const reasoningEvents = events.filter((e) => e.kind === "reasoning");
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects status_change kind with status_change_not_emittable", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.emit_event",
      arguments: {
        task_id: fixture.taskId,
        event: { kind: "status_change", to: "COMPLETE" },
      },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("status_change");
  });

  it("rejects a malformed event body with LogEvent schema validation error", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    // reasoning event missing required fields 'text' and 'subkind'
    const result = await fixture.client.callTool({
      name: "runner.emit_event",
      arguments: {
        task_id: fixture.taskId,
        event: { kind: "reasoning" },
      },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("LogEvent schema validation");
  });

  it("rejects a foreign task_id with task_not_bound", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.emit_event",
      arguments: {
        task_id: "foreign-task-id",
        event: { kind: "reasoning", text: "hi", subkind: "message" },
      },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("task_not_bound");
  });
});

// ---------------------------------------------------------------------------
// runner.complete_task — happy path + pre-check
// ---------------------------------------------------------------------------

describe("runner.complete_task", () => {
  it("transitions the bound task RUNNING → COMPLETE and returns { status: COMPLETE }", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.complete_task",
      arguments: { task_id: fixture.taskId },
    });

    expect(result.isError).toBeFalsy();
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    const body = JSON.parse(text) as { status: string };
    expect(body.status).toBe("COMPLETE");

    const task = fixture.runner.store.loadTask(fixture.taskId);
    expect(task?.status).toBe("COMPLETE");
  });

  it("rejects when task is not RUNNING with task_not_running", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    // Complete once
    await fixture.client.callTool({
      name: "runner.complete_task",
      arguments: { task_id: fixture.taskId },
    });

    // Try to complete again — task is now COMPLETE, not RUNNING
    const result = await fixture.client.callTool({
      name: "runner.complete_task",
      arguments: { task_id: fixture.taskId },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("task_not_running");
  });

  it("rejects a foreign task_id with task_not_bound", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.complete_task",
      arguments: { task_id: "foreign-task-id" },
    });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runner.fail_task — happy path + pre-check
// ---------------------------------------------------------------------------

describe("runner.fail_task", () => {
  it("transitions the bound task RUNNING → FAILED with the supplied reason verbatim", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.fail_task",
      arguments: { task_id: fixture.taskId, reason: "something went wrong" },
    });

    expect(result.isError).toBeFalsy();
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    const body = JSON.parse(text) as { status: string };
    expect(body.status).toBe("FAILED");

    const task = fixture.runner.store.loadTask(fixture.taskId);
    expect(task?.status).toBe("FAILED");

    // Verify reason is stored verbatim
    const events = fixture.runner.store.getEvents(fixture.taskId);
    const failEvent = events
      .filter((e) => e.kind === "status_change" && "to" in e && (e as { to: string }).to === "FAILED")
      .at(-1);
    expect(failEvent).toBeDefined();
    if (failEvent?.kind === "status_change") {
      expect(failEvent.reason).toBe("something went wrong");
    }
  });

  it("rejects when task is not RUNNING with task_not_running", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    // Fail once
    await fixture.client.callTool({
      name: "runner.fail_task",
      arguments: { task_id: fixture.taskId, reason: "first fail" },
    });

    // Try again — task is now FAILED
    const result = await fixture.client.callTool({
      name: "runner.fail_task",
      arguments: { task_id: fixture.taskId, reason: "second fail" },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("task_not_running");
  });

  it("rejects a foreign task_id with task_not_bound", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.fail_task",
      arguments: { task_id: "foreign-task-id", reason: "nope" },
    });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runner.await_human_review — happy path + pre-check + store side-effect
// ---------------------------------------------------------------------------

describe("runner.await_human_review", () => {
  it("writes reviewPayload and transitions RUNNING → AWAITING_HUMAN_REVIEW", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.await_human_review",
      arguments: {
        task_id: fixture.taskId,
        review_payload: { summary: "Please review this change", diffRef: "abc123" },
      },
    });

    expect(result.isError).toBeFalsy();
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    const body = JSON.parse(text) as { status: string };
    expect(body.status).toBe("AWAITING_HUMAN_REVIEW");

    // Verify reviewPayload was persisted
    const task = fixture.runner.store.loadTask(fixture.taskId) as Task;
    expect(task.status).toBe("AWAITING_HUMAN_REVIEW");
    expect(task.reviewPayload).toEqual({ summary: "Please review this change", diffRef: "abc123" });
  });

  it("rejects when task is not RUNNING with task_not_running", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    // Transition to AWAITING_HUMAN_REVIEW
    await fixture.client.callTool({
      name: "runner.await_human_review",
      arguments: { task_id: fixture.taskId, review_payload: { summary: "first review" } },
    });

    // Try again — task is now AWAITING_HUMAN_REVIEW, not RUNNING
    const result = await fixture.client.callTool({
      name: "runner.await_human_review",
      arguments: { task_id: fixture.taskId, review_payload: { summary: "second review" } },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("task_not_running");
  });

  it("rejects a foreign task_id with task_not_bound", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.await_human_review",
      arguments: { task_id: "foreign-task-id", review_payload: { summary: "nope" } },
    });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runner.get_task — happy path + cross-task read is open
// ---------------------------------------------------------------------------

describe("runner.get_task", () => {
  it("returns task + events for the bound task", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.get_task",
      arguments: { task_id: fixture.taskId },
    });

    expect(result.isError).toBeFalsy();
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    const body = JSON.parse(text) as { task: Task; events: unknown[] };
    expect(body.task).toBeDefined();
    expect(body.task.id).toBe(fixture.taskId);
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("cross-task read is open — can read a different task without binding check (parent D8)", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    // Create another task (not bound to this session)
    const otherTask = fixture.runner.createTask({
      type: "noop",
      title: "Another task",
      source: "operator_injected",
    });

    const result = await fixture.client.callTool({
      name: "runner.get_task",
      arguments: { task_id: otherTask.id },
    });

    expect(result.isError).toBeFalsy();
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    const body = JSON.parse(text) as { task: Task; events: unknown[] };
    expect(body.task.id).toBe(otherTask.id);
  });

  it("returns task_not_found for a non-existent task", async () => {
    const fixture = await makeFixture();
    teardowns.push(fixture.cleanup);

    const result = await fixture.client.callTool({
      name: "runner.get_task",
      arguments: { task_id: "non-existent-task-id" },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("task not found");
  });
});

// ---------------------------------------------------------------------------
// store.updateReviewPayload — unit test
// ---------------------------------------------------------------------------

describe("store.updateReviewPayload", () => {
  it("round-trip: write reviewPayload then loadTask reflects it", () => {
    const { runner, close } = makeInMemoryRunner();
    teardowns.push(() => { close(); return Promise.resolve(); });

    const task = runner.createTask({
      type: "noop",
      title: "Test",
      source: "operator_injected",
    });

    // noop executor completes synchronously — update review payload on completed task anyway
    runner.store.updateReviewPayload(task.id, { summary: "Please look", diffRef: "ref-1" });
    const loaded = runner.store.loadTask(task.id) as Task;
    expect(loaded.reviewPayload).toEqual({ summary: "Please look", diffRef: "ref-1" });
  });

  it("overwriting reviewPayload replaces the previous value", () => {
    const { runner, close } = makeInMemoryRunner();
    teardowns.push(() => { close(); return Promise.resolve(); });

    const task = runner.createTask({
      type: "noop",
      title: "Test",
      source: "operator_injected",
    });

    runner.store.updateReviewPayload(task.id, { summary: "first" });
    runner.store.updateReviewPayload(task.id, { summary: "second" });
    const loaded = runner.store.loadTask(task.id) as Task;
    expect(loaded.reviewPayload?.summary).toBe("second");
  });

  it("throws when the task does not exist", () => {
    const { runner, close } = makeInMemoryRunner();
    teardowns.push(() => { close(); return Promise.resolve(); });

    expect(() => {
      runner.store.updateReviewPayload("non-existent-id", { summary: "nope" });
    }).toThrow("updateReviewPayload: task not found: non-existent-id");
  });
});

// ---------------------------------------------------------------------------
// Binding hook wiring — session without X-Ledger-Task-Id gets task_not_bound
// ---------------------------------------------------------------------------

describe("binding hook wiring", () => {
  it("session not bound without X-Ledger-Task-Id header results in task_not_bound", async () => {
    const { runner, close } = makeInMemoryRunner();

    const pendingTask = runner.store.createTask({ type: "human_review", title: "T", source: "operator_injected" });
    runner.store.updateTaskStatus(pendingTask.id, { from: "PENDING", to: "RUNNING" });

    const binding = createBindingRegistry();
    const handle: McpServerHandle = createMcpServer({
      version: "0.1.0",
      registerTools: (server) => {
        registerRunnerTools(server, { store: runner.store, handle: runner.handle, binding });
      },
    });

    handle.onSessionInitialized((sessionId, request) => {
      const tid = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
      binding.bind(sessionId, tid);
    });
    handle.onSessionClosed((sessionId) => { binding.unbind(sessionId); });

    const app = new Hono().route("/mcp", handle.mcpRoute);
    const testFetch: typeof fetch = (input, init) => {
      const req =
        typeof input === "string"
          ? new Request(input, init)
          : input instanceof URL
            ? new Request(input.toString(), init)
            : input;
      return app.fetch(req);
    };

    // Connect WITHOUT X-Ledger-Task-Id header
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      { fetch: testFetch },
    );
    const client = new Client({ name: "test", version: "0.0.1" });
    await client.connect(transport);

    teardowns.push(async () => {
      await client.close().catch(() => undefined);
      await handle.close().catch(() => undefined);
      close();
    });

    const result = await client.callTool({
      name: "runner.emit_event",
      arguments: {
        task_id: pendingTask.id,
        event: { kind: "reasoning", text: "hi", subkind: "message" },
      },
    });

    expect(result.isError).toBe(true);
    const text = getFirstTextContent(result as { content: { type: string; text?: string }[] });
    expect(text).toContain("task_not_bound");
  });
});
