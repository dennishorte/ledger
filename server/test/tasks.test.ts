/**
 * Endpoint tests for /api/tasks via Hono app.request().
 *
 * Each test builds a fresh in-memory ProjectContext (in-memory SQLite +
 * createRunnerForProject equivalent), mounts createServer, and exercises
 * the four handlers.
 *
 * Spec: docs/05-task-runner/04-api-endpoints.md §Tests item 1
 */

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../src/runner/migrations/runner.js";
import { createStore } from "../src/runner/store.js";
import { createRunner, recoverOrphans } from "../src/runner/scheduler.js";
import { createEventBus, withPublishing } from "../src/runner/events.js";
import { createServer } from "../src/server.js";
import { createMcpServer } from "../src/dispatcher/mcp/server.js";
import { createBindingRegistry } from "../src/dispatcher/mcp/binding.js";
import { createCancellationRegistry } from "../src/dispatcher/executor/cancellation.js";
import type { ProjectContext } from "../src/context.js";
import type { Task, LogEvent } from "@ledger/parser";

/** Drain the microtask queue to let any pending void async calls complete. */
function drainMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Helper: build an in-memory ProjectContext
// ---------------------------------------------------------------------------

function makeInMemoryContext(): ProjectContext & { closeAll: () => void } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);

  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);
  recoverOrphans(store);
  const runner = createRunner(store, undefined, bus);

  // createMcpServer (sync, pre-connect) gives a valid McpServerHandle shape.
  // These tests do not exercise MCP; the unconnected handle is sufficient.
  const mcp = createMcpServer({ version: "0.1.0" });

  const binding = createBindingRegistry();
  const dispatchCancellation = createCancellationRegistry();

  const ctx: ProjectContext = {
    projectRoot: "/test",
    docsRoot: "/test/docs",
    project: { schemaVersion: 1, name: "Test", docs: "docs", agent: "claude-code" },
    port: 0,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
    mcp,
    binding,
    dispatchCancellation,
    docs: [],
    resolveDocPath: () => undefined,
  };

  return { ...ctx, closeAll: () => { runner.close(); } };
}

// ---------------------------------------------------------------------------
// GET /api/tasks
// ---------------------------------------------------------------------------

describe("GET /api/tasks", () => {
  it("empty list → 200 { tasks: [] }", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const res = await app.request("/api/tasks");
    expect(res.status).toBe(200);
    const body = await res.json() as { tasks: Task[] };
    expect(body.tasks).toEqual([]);
    ctx.closeAll();
  });

  it("seeded tasks → 200 with tasks array (at least the seeded tasks returned)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const t1 = ctx.runner.store.createTask({ type: "noop", title: "first" });
    const t2 = ctx.runner.store.createTask({ type: "human_review", title: "second", reviewPayload: { summary: "review" } });

    const res = await app.request("/api/tasks");
    expect(res.status).toBe(200);
    const body = await res.json() as { tasks: Task[] };
    expect(body.tasks.length).toBe(2);
    // Confirm both ids are present (order is created_at DESC but may be same-ms)
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    ctx.closeAll();
  });

  it("filters: status, type, parent all compose correctly", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const parent = ctx.runner.store.createTask({ type: "noop", title: "parent" });
    // Create a noop task and a human_review task, one with parent
    ctx.runner.store.createTask({ type: "noop", title: "child", parentTaskId: parent.id });
    ctx.runner.store.createTask({ type: "human_review", title: "review", reviewPayload: { summary: "s" } });

    // Filter by type=noop
    const res1 = await app.request("/api/tasks?type=noop");
    const b1 = await res1.json() as { tasks: Task[] };
    expect(b1.tasks.every((t) => t.type === "noop")).toBe(true);

    // Filter by parent
    const res2 = await app.request(`/api/tasks?parent=${parent.id}`);
    const b2 = await res2.json() as { tasks: Task[] };
    expect(b2.tasks.every((t) => t.parentTaskId === parent.id)).toBe(true);

    // Filter by status=PENDING
    const res3 = await app.request("/api/tasks?status=PENDING");
    const b3 = await res3.json() as { tasks: Task[] };
    expect(b3.tasks.every((t) => t.status === "PENDING")).toBe(true);

    ctx.closeAll();
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id
// ---------------------------------------------------------------------------

describe("GET /api/tasks/:id", () => {
  it("200 with task + events on known id", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const task = ctx.runner.createTask({ type: "noop", title: "lookup" });
    const res = await app.request(`/api/tasks/${task.id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task; events: LogEvent[] };
    expect(body.task.id).toBe(task.id);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    // Events are seq-ordered ASC
    for (let i = 1; i < body.events.length; i++) {
      const curr = body.events[i];
      const prev = body.events[i - 1];
      if (curr !== undefined && prev !== undefined) {
        expect(curr.seq).toBeGreaterThan(prev.seq);
      }
    }
    ctx.closeAll();
  });

  it("404 on missing id", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks/nonexistent-task-id");
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("task_not_found");
    ctx.closeAll();
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks
// ---------------------------------------------------------------------------

describe("POST /api/tasks", () => {
  it("valid body → 201 with task", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "noop", title: "smoke" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("noop");
    expect(body.task.title).toBe("smoke");
    // noop executor runs synchronously, so task should be COMPLETE after tick
    expect(body.task.status).toBe("COMPLETE");
    ctx.closeAll();
  });

  it("noop task response already has events including creation + completion", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "noop", title: "events-check" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    const events = ctx.runner.store.getEvents(body.task.id);
    // Expect at least 3 events: PENDING creation, RUNNING dispatch, COMPLETE
    expect(events.length).toBeGreaterThanOrEqual(3);
    ctx.closeAll();
  });

  it("schema defaults applied (source, dependsOn, resourceClaims, priority)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "noop", title: "defaults" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.source).toBe("operator_injected");
    expect(body.task.dependsOn).toEqual([]);
    expect(body.task.resourceClaims).toEqual([]);
    expect(body.task.priority).toBe(0);
    ctx.closeAll();
  });

  it("missing type → 422 with errors array (05-task-runner round-2 item 4: semantic validation = 422)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "no-type" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: unknown[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    ctx.closeAll();
  });

  it("malformed JSON → 400 { error: 'invalid_json' }", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {{{",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_json");
    ctx.closeAll();
  });

  it("dependsOn: [missing-id] → 400 with error (05-task-runner round-2 item 5: creation-time dep validation)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "noop",
        title: "blocked-by-missing-dep",
        dependsOn: ["does-not-exist-uuid-1234"],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_dependsOn");
    ctx.closeAll();
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id/stream — SSE
// ---------------------------------------------------------------------------

describe("GET /api/tasks/:id/stream", () => {
  it("404 on missing id (HTTP status, not SSE)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks/no-such-id/stream");
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("task_not_found");
    ctx.closeAll();
  });

  it("opens SSE and delivers initial backfill frames", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    // Create a completed noop task so there are events to backfill
    const task = ctx.runner.createTask({ type: "noop", title: "backfill" });
    const events = ctx.runner.store.getEvents(task.id);
    expect(events.length).toBeGreaterThan(0);

    const res = await app.request(`/api/tasks/${task.id}/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Read frames from the body
    expect(res.body).not.toBeNull();
    const reader = res.body?.getReader();
    if (reader === undefined) throw new Error("expected a readable body");
    const decoder = new TextDecoder();
    let accumulated = "";

    // Read enough to get all backfill events (the noop task has 3 events)
    let framesReceived = 0;
    while (framesReceived < events.length) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      // Count `data:` lines as frames (Hono emits `data: ` with space)
      framesReceived = (accumulated.match(/^data: /gm) ?? []).length;
    }

    await reader.cancel().catch(() => undefined);
    await drainMicrotasks();

    // Verify at least one SSE frame with `id:` and `data:`
    // Hono writeSSE emits `data: ...\nid: N\n\n` (id after data, with space)
    expect(accumulated).toMatch(/^id: /m);
    expect(accumulated).toMatch(/^data: /m);

    // Verify the data contains a valid LogEvent JSON
    const dataMatch = accumulated.match(/^data: (.+)$/m);
    expect(dataMatch).not.toBeNull();
    if (dataMatch === null) throw new Error("no data line found");
    const firstDataLine = dataMatch[1];
    if (firstDataLine === undefined) throw new Error("no capture group");
    const parsedEvent = JSON.parse(firstDataLine.trim()) as LogEvent;
    expect(parsedEvent.taskId).toBe(task.id);

    ctx.closeAll();
  });

  it("Last-Event-ID header skips already-emitted events", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const task = ctx.runner.createTask({ type: "noop", title: "resume" });
    const events = ctx.runner.store.getEvents(task.id);
    // Expect at least 3 events (seq 0, 1, 2)
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Request with Last-Event-ID: 0 — should only emit seq > 0
    const res = await app.request(`/api/tasks/${task.id}/stream`, {
      headers: { "Last-Event-ID": "0" },
    });
    expect(res.status).toBe(200);

    expect(res.body).not.toBeNull();
    const readerB = res.body?.getReader();
    if (readerB === undefined) throw new Error("expected a readable body");
    const decoder = new TextDecoder();
    let accumulated = "";

    // Read 2 frames (seq 1 + seq 2)
    let framesReceived = 0;
    while (framesReceived < 2) {
      const { value, done } = await readerB.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      framesReceived = (accumulated.match(/^data: /gm) ?? []).length;
    }

    await readerB.cancel().catch(() => undefined);
    await drainMicrotasks();

    // Hono writeSSE emits `id: N` (with space after colon)
    // seq=0 event should NOT appear
    const ids = [...accumulated.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids).not.toContain(0);
    // seq=1 and seq=2 should appear
    expect(ids).toContain(1);

    ctx.closeAll();
  });

  it("subsequent events published via bus are delivered to SSE stream", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    // Create a non-noop task that stays PENDING so we can manually append events
    const task = ctx.runner.store.createTask({ type: "human_review", title: "live-stream", reviewPayload: { summary: "s" } });
    const initialEvents = ctx.runner.store.getEvents(task.id);

    const res = await app.request(`/api/tasks/${task.id}/stream`);
    expect(res.status).toBe(200);

    expect(res.body).not.toBeNull();
    const readerC = res.body?.getReader();
    if (readerC === undefined) throw new Error("expected a readable body");
    const decoder = new TextDecoder();

    // Read the initial backfill (1 event: creation at seq=0)
    let accumulated = "";
    while ((accumulated.match(/^data: /gm) ?? []).length < initialEvents.length) {
      const { value, done } = await readerC.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
    }

    // Now append a new event — the bus should notify and flush to the stream
    ctx.runner.store.appendEvent(task.id, {
      kind: "status_change",
      from: "PENDING",
      to: "RUNNING",
    } as Parameters<typeof ctx.runner.store.appendEvent>[1]);

    // The newly appended event should appear in the stream
    let newAccumulated = "";
    const startingFrames = (accumulated.match(/^data: /gm) ?? []).length;
    let combined = accumulated;
    while ((combined.match(/^data: /gm) ?? []).length <= startingFrames) {
      const { value, done } = await readerC.read();
      if (done) break;
      newAccumulated += decoder.decode(value, { stream: true });
      combined = accumulated + newAccumulated;
    }

    await readerC.cancel().catch(() => undefined);
    await drainMicrotasks();

    const allData = accumulated + newAccumulated;
    // seq=1 event should appear (the appended event)
    // Hono writeSSE emits `id: N` (with space after colon)
    const ids = [...allData.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids).toContain(1);

    ctx.closeAll();
  });
});
