/**
 * Tests for POST /api/tasks/:id/cancel endpoint.
 *
 * Uses the same in-memory ProjectContext pattern as hitl.test.ts.
 * The mock subprocess satisfies the structural CancellationRegistry.bind()
 * contract via a recording mock — no real subprocess spawned (D14).
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Requirements item 8 (cancel)
 */

import { describe, expect, it, vi } from "vitest";
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
import type { Task } from "@ledger/parser";
import type { Subprocess } from "execa";

function makeInMemoryContext(): ProjectContext & { closeAll: () => void } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);
  recoverOrphans(store);
  const runner = createRunner(store, undefined, bus);
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

/** Creates a recording mock subprocess that captures .kill(signal) calls. */
function makeMockSubprocess() {
  const killMock = vi.fn();
  return {
    subprocess: { kill: killMock } as unknown as Subprocess,
    killMock,
  };
}

describe("POST /api/tasks/:id/cancel", () => {
  it("404 on unknown task id", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    const res = await app.request("/api/tasks/nonexistent-id/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string; id: string };
    expect(body.error).toBe("task_not_found");
    ctx.closeAll();
  });

  it("409 wrong_status on COMPLETE task", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    // Inject a noop task that immediately completes
    const res1 = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "noop", title: "completed-task" }),
    });
    expect(res1.status).toBe(201);
    const created = await res1.json() as { task: Task };
    expect(created.task.status).toBe("COMPLETE");

    const res = await app.request(`/api/tasks/${created.task.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; expected: string; actual: string };
    expect(body.error).toBe("wrong_status");
    expect(body.expected).toBe("cancellable");
    expect(body.actual).toBe("COMPLETE");
    ctx.closeAll();
  });

  it("200 cancels a PENDING task directly (no subprocess needed)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    // Directly create without executor so it stays PENDING
    const task = ctx.runner.store.createTask({ type: "implement", title: "pending-task" });

    const res = await app.request(`/api/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task };
    expect(body.task.status).toBe("CANCELLED");
    ctx.closeAll();
  });

  it("409 no_subprocess when task is RUNNING but no subprocess registered", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);

    // Force task to RUNNING via direct store call — no subprocess registered
    const task = ctx.runner.store.createTask({ type: "implement", title: "running-no-sub" });
    ctx.runner.store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });

    const res = await app.request(`/api/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; id: string; taskType: string };
    expect(body.error).toBe("no_subprocess");
    expect(body.id).toBe(task.id);
    expect(body.taskType).toBe("implement");
    ctx.closeAll();
  });

  it("200 happy path — eager DB write + SIGTERM delivered to mock subprocess", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { subprocess, killMock } = makeMockSubprocess();

    // Force task to RUNNING and register the mock subprocess
    const task = ctx.runner.store.createTask({ type: "implement", title: "running-with-sub" });
    ctx.runner.store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    ctx.dispatchCancellation.bind(task.id, subprocess);

    const res = await app.request(`/api/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task };
    expect(body.task.status).toBe("CANCELLED");
    expect(body.task.id).toBe(task.id);

    // SIGTERM was delivered to the mock subprocess
    expect(killMock).toHaveBeenCalledWith("SIGTERM");
    expect(killMock).toHaveBeenCalledTimes(1);

    // DB write happened before SIGTERM — we can verify from the response
    const stored = ctx.runner.store.loadTask(task.id);
    expect(stored?.status).toBe("CANCELLED");

    // status_change event recorded with cancelled_by_operator reason
    const events = ctx.runner.store.getEvents(task.id);
    const scEvents = events.filter((e) => e.kind === "status_change");
    const lastSc = scEvents[scEvents.length - 1];
    if (lastSc?.kind === "status_change") {
      expect(lastSc.to).toBe("CANCELLED");
      expect(lastSc.reason).toBe("cancelled_by_operator");
    } else {
      expect.fail("expected a status_change event");
    }
    ctx.closeAll();
  });

  it("200 with custom reason in body — stored on status_change event", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { subprocess } = makeMockSubprocess();

    const task = ctx.runner.store.createTask({ type: "implement", title: "custom-reason" });
    ctx.runner.store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    ctx.dispatchCancellation.bind(task.id, subprocess);

    const customReason = "operator said to stop";
    const res = await app.request(`/api/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: customReason }),
    });
    expect(res.status).toBe(200);

    const events = ctx.runner.store.getEvents(task.id);
    const scEvents = events.filter((e) => e.kind === "status_change");
    const lastSc = scEvents[scEvents.length - 1];
    if (lastSc?.kind === "status_change") {
      expect(lastSc.reason).toBe(customReason);
    } else {
      expect.fail("expected a status_change event");
    }
    ctx.closeAll();
  });

  it("409 wrong_status with actual: 'raced' when store transition races (Spec Review B1 path)", async () => {
    // To trigger the B1 race path, we need updateTaskStatus to throw.
    // Spy on the store method and replace it to throw after our loadTask check.
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { subprocess } = makeMockSubprocess();

    const task = ctx.runner.store.createTask({ type: "implement", title: "race-task" });
    ctx.runner.store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    ctx.dispatchCancellation.bind(task.id, subprocess);

    // Replace updateTaskStatus to simulate a race (task transitioned by
    // scheduler between our loadTask check and the UPDATE).
    const updateSpy = vi.spyOn(ctx.runner.store, "updateTaskStatus").mockImplementationOnce(() => {
      throw new Error("simulated race: from guard failed");
    });

    const res = await app.request(`/api/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; expected: string; actual: string };
    expect(body.error).toBe("wrong_status");
    expect(body.expected).toBe("RUNNING");
    expect(body.actual).toBe("raced");

    // Restore and clean up
    updateSpy.mockRestore();
    ctx.closeAll();
  });

  it("200 with no Content-Type body (missing JSON) — defaults to cancelled_by_operator", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { subprocess } = makeMockSubprocess();

    const task = ctx.runner.store.createTask({ type: "implement", title: "no-body" });
    ctx.runner.store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    ctx.dispatchCancellation.bind(task.id, subprocess);

    // POST with no body — the catch(() => ({})) default kicks in
    const res = await app.request(`/api/tasks/${task.id}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task };
    expect(body.task.status).toBe("CANCELLED");
    ctx.closeAll();
  });
});
