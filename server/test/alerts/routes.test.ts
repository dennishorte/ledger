/**
 * Endpoint tests for /api/alerts via Hono app.request() (08-alerts, review F1).
 *
 * Builds an in-memory ProjectContext with a real alert channel attached to the
 * runner's EventBus, then exercises GET /api/alerts and the SSE stream
 * (backfill, Last-Event-ID resume, live delivery). Mirrors tasks.test.ts.
 */

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";
import { createStore } from "../../src/runner/store.js";
import { createEventBus, withPublishing } from "../../src/runner/events.js";
import { createRunner, recoverOrphans } from "../../src/runner/scheduler.js";
import { createMcpServer, createBindingRegistry } from "../../src/dispatcher/index.js";
import { createCancellationRegistry } from "../../src/dispatcher/executor/cancellation.js";
import { createAlertChannel } from "../../src/alerts/channel.js";
import { createServer } from "../../src/server.js";
import type { ProjectContext } from "../../src/context.js";
import type { Alert } from "@ledger/parser";

async function drainMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function makeContext(): ProjectContext & { closeAll: () => void } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);

  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);
  recoverOrphans(store);
  const runner = createRunner(store, undefined, bus);

  const alerts = createAlertChannel({ store: runner.store });
  alerts.attach(runner.events);

  const ctx = {
    projectRoot: "/test",
    docsRoot: "/test/docs",
    project: { schemaVersion: 1, name: "Test", docs: "docs", agent: "claude-code" },
    port: 0,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
    mcp: createMcpServer({ version: "0.1.0" }),
    binding: createBindingRegistry(),
    dispatchCancellation: createCancellationRegistry(),
    docs: [],
    resolveDocPath: () => undefined,
    alerts,
  } as unknown as ProjectContext;

  return { ...ctx, closeAll: () => { runner.close(); } };
}

/** Drive a task to FAILED so the channel raises an alert. */
function failTask(ctx: ProjectContext, title: string): string {
  const task = ctx.runner.store.createTask({ type: "noop", title });
  ctx.runner.store.updateTaskStatus(task.id, { from: task.status, to: "FAILED", reason: `boom:${title}` });
  return task.id;
}

/** Read SSE frames until `n` data lines accumulate or the stream ends, then cancel. */
async function readFrames(res: Response, n: number): Promise<string> {
  const reader = res.body?.getReader();
  if (reader === undefined) throw new Error("expected a readable body");
  const decoder = new TextDecoder();
  let accumulated = "";
  while ((accumulated.match(/^data: /gm) ?? []).length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  await drainMicrotasks();
  return accumulated;
}

describe("GET /api/alerts", () => {
  it("empty → 200 { alerts: [] }", async () => {
    const ctx = makeContext();
    const res = await createServer(ctx).request("/api/alerts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ alerts: [] });
    ctx.closeAll();
  });

  it("returns alerts raised by failed tasks", async () => {
    const ctx = makeContext();
    failTask(ctx, "one");
    const res = await createServer(ctx).request("/api/alerts");
    const body = (await res.json()) as { alerts: Alert[] };
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]?.taskTitle).toBe("one");
    expect(body.alerts[0]?.reason).toBe("boom:one");
    ctx.closeAll();
  });
});

describe("GET /api/alerts/stream", () => {
  it("content-type is text/event-stream", async () => {
    const ctx = makeContext();
    const res = await createServer(ctx).request("/api/alerts/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel().catch(() => undefined);
    ctx.closeAll();
  });

  it("backfills an existing alert as an SSE frame", async () => {
    const ctx = makeContext();
    const taskId = failTask(ctx, "backfill");
    const res = await createServer(ctx).request("/api/alerts/stream");
    const acc = await readFrames(res, 1);
    expect(acc).toMatch(/^id: 0$/m);
    const dataMatch = acc.match(/^data: (.+)$/m);
    if (dataMatch?.[1] === undefined) throw new Error("no data line");
    const alert = JSON.parse(dataMatch[1].trim()) as Alert;
    expect(alert.taskId).toBe(taskId);
    expect(alert.kind).toBe("task_failed");
    ctx.closeAll();
  });

  it("Last-Event-ID skips already-seen alerts", async () => {
    const ctx = makeContext();
    failTask(ctx, "first"); // seq 0
    failTask(ctx, "second"); // seq 1
    const res = await createServer(ctx).request("/api/alerts/stream", {
      headers: { "Last-Event-ID": "0" },
    });
    const acc = await readFrames(res, 1);
    const ids = [...acc.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids).not.toContain(0);
    expect(ids).toContain(1);
    ctx.closeAll();
  });

  it("delivers an alert raised after the stream opens (live)", async () => {
    const ctx = makeContext();
    const app = createServer(ctx);
    const res = await app.request("/api/alerts/stream");
    const reader = res.body?.getReader();
    if (reader === undefined) throw new Error("expected a readable body");
    const decoder = new TextDecoder();

    // Raise a failure after the stream is open.
    const taskId = failTask(ctx, "live");

    let acc = "";
    while ((acc.match(/^data: /gm) ?? []).length < 1) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    await drainMicrotasks();

    const dataMatch = acc.match(/^data: (.+)$/m);
    if (dataMatch?.[1] === undefined) throw new Error("no data line");
    expect((JSON.parse(dataMatch[1].trim()) as Alert).taskId).toBe(taskId);
    ctx.closeAll();
  });
});
