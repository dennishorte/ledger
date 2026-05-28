/**
 * HITL endpoint tests for POST /api/tasks/:id/approve + /:id/reject.
 *
 * Each test builds a fresh in-memory ProjectContext + mounts createServer,
 * then exercises the two HITL handlers via Hono app.request().
 *
 * Spec: docs/05-task-runner/03-hitl-gate.md §Tests item 7 (server/test/hitl.test.ts).
 */

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../src/runner/migrations/runner.js";
import { createStore } from "../src/runner/store.js";
import { createRunner, recoverOrphans } from "../src/runner/scheduler.js";
import { createEventBus, withPublishing } from "../src/runner/events.js";
import { createServer } from "../src/server.js";
import type { ProjectContext } from "../src/context.js";
import type { Task, LogEvent } from "@ledger/parser";

function makeInMemoryContext(): ProjectContext & { closeAll: () => void } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);
  recoverOrphans(store);
  const runner = createRunner(store, undefined, bus);
  const ctx: ProjectContext = {
    projectRoot: "/test",
    docsRoot: "/test/docs",
    project: { schemaVersion: 1, name: "Test", docs: "docs", agent: "claude-code" },
    port: 0,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
  };
  return { ...ctx, closeAll: () => { runner.close(); } };
}

function lastStatusChange(events: LogEvent[]): LogEvent & { kind: "status_change" } {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev !== undefined && ev.kind === "status_change") {
      return ev;
    }
  }
  throw new Error("no status_change event found");
}

async function injectAwaitingReview(
  app: ReturnType<typeof createServer>,
  ctx: ReturnType<typeof makeInMemoryContext>,
  body?: Record<string, unknown>,
): Promise<{ task: Task; dbRowVersion: number }> {
  const res = await app.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "human_review",
      title: "review me",
      reviewPayload: { summary: "test diff" },
      ...body,
    }),
  });
  expect(res.status).toBe(201);
  const parsed = await res.json() as { task: Task };
  // After 04-api-endpoints' POST reload, the task is AWAITING_HUMAN_REVIEW
  // (human_review executor suspended synchronously during runner.createTask's tick).
  expect(parsed.task.status).toBe("AWAITING_HUMAN_REVIEW");
  return { task: parsed.task, dbRowVersion: parsed.task.dbRowVersion };
}

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/approve
// ---------------------------------------------------------------------------

describe("POST /api/tasks/:id/approve", () => {
  it("404 on non-existent task", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const res = await app.request("/api/tasks/missing/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion: 0 }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("task_not_found");
    ctx.closeAll();
  });

  it("409 wrong_status on a PENDING task (no executor registered for type)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    // Direct-store create bypasses the tick — task stays PENDING.
    const t = ctx.runner.store.createTask({ type: "implement", title: "X" });
    const res = await app.request(`/api/tasks/${t.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion: t.dbRowVersion }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; expected: string; actual: string };
    expect(body.error).toBe("wrong_status");
    expect(body.expected).toBe("AWAITING_HUMAN_REVIEW");
    expect(body.actual).toBe("PENDING");
    ctx.closeAll();
  });

  it("200 on AWAITING task with correct dbRowVersion; event log records APPROVED", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    const res = await app.request(`/api/tasks/${task.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task };
    expect(body.task.status).toBe("COMPLETE");
    expect(body.task.dbRowVersion).toBe(dbRowVersion + 1);

    const evt = lastStatusChange(ctx.runner.store.getEvents(task.id));
    expect(evt.from).toBe("AWAITING_HUMAN_REVIEW");
    expect(evt.to).toBe("COMPLETE");
    expect(evt.reason).toBe("approved");
    ctx.closeAll();
  });

  it("200 with note; reason field is 'approved: <note>' truncated at 80 chars", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    const longNote = "n".repeat(100);
    const res = await app.request(`/api/tasks/${task.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion, note: longNote }),
    });
    expect(res.status).toBe(200);
    const evt = lastStatusChange(ctx.runner.store.getEvents(task.id));
    expect(evt.reason).toBe(`approved: ${"n".repeat(80)}`);
    ctx.closeAll();
  });

  it("409 version_conflict on stale dbRowVersion", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    // First approve succeeds.
    const res1 = await app.request(`/api/tasks/${task.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion }),
    });
    expect(res1.status).toBe(200);

    // Second approve with the same (now-stale) version should be 409 wrong_status
    // because the task is COMPLETE now. To exercise version_conflict explicitly,
    // create a fresh AWAITING task and send approve with a wrong version.
    const { task: t2 } = await injectAwaitingReview(app, ctx);
    const res2 = await app.request(`/api/tasks/${t2.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion: t2.dbRowVersion + 99 }),
    });
    expect(res2.status).toBe(409);
    const body = await res2.json() as { error: string; expected: number; actual: number };
    expect(body.error).toBe("version_conflict");
    expect(body.actual).toBe(t2.dbRowVersion);
    ctx.closeAll();
  });

  it("400 on body missing required dbRowVersion", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task } = await injectAwaitingReview(app, ctx);

    const res = await app.request(`/api/tasks/${task.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: unknown[] };
    expect(Array.isArray(body.errors)).toBe(true);
    ctx.closeAll();
  });

  it("400 on invalid JSON body", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task } = await injectAwaitingReview(app, ctx);

    const res = await app.request(`/api/tasks/${task.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_json");
    ctx.closeAll();
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/reject
// ---------------------------------------------------------------------------

describe("POST /api/tasks/:id/reject", () => {
  it("400 on empty reason", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    const res = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion, reason: "" }),
    });
    expect(res.status).toBe(400);
    ctx.closeAll();
  });

  it("200 + FAILED + detail event + truncated reason", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    const longReason = "x".repeat(200);
    const res = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion, reason: longReason }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task };
    expect(body.task.status).toBe("FAILED");

    const events = ctx.runner.store.getEvents(task.id);
    // Find the detail event (kind=error, message=rejected_with_details)
    const detail = events.find(
      (e) => e.kind === "error" && e.message === "rejected_with_details",
    );
    expect(detail).toBeDefined();
    if (detail?.kind === "error") {
      expect(detail.stack).toBe(longReason);
    }
    // The status_change to FAILED carries the truncated reason
    const sc = lastStatusChange(events);
    expect(sc.to).toBe("FAILED");
    expect(sc.reason).toBe(`rejected: ${"x".repeat(80)}`);

    // Detail event was written BEFORE the status_change (D5 ordering)
    const detailSeq = events.findIndex(
      (e) => e.kind === "error" && e.message === "rejected_with_details",
    );
    const scSeq = events.findIndex(
      (e) => e.kind === "status_change" && e.to === "FAILED",
    );
    expect(detailSeq).toBeLessThan(scSeq);
    ctx.closeAll();
  });

  it("200 with followUp → both task and followUpTask in response; followUp dependsOn []", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    const res = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbRowVersion,
        reason: "please retry",
        followUp: { type: "noop", title: "retry attempt" },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task; followUpTask?: Task };
    expect(body.task.status).toBe("FAILED");
    expect(body.followUpTask).toBeDefined();
    expect(body.followUpTask?.dependsOn).toEqual([]);
    // noop completes synchronously
    expect(body.followUpTask?.status).toBe("COMPLETE");
    ctx.closeAll();
  });

  it("followUp inherits rejected task's resourceClaims when not provided", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const claim = { kind: "node" as const, nodeId: "shared", mode: "write" as const };
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx, {
      resourceClaims: [claim],
    });

    const res = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbRowVersion,
        reason: "retry needed",
        followUp: { type: "noop", title: "retry" },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { followUpTask?: Task };
    expect(body.followUpTask?.resourceClaims).toEqual([claim]);
    ctx.closeAll();
  });

  it("followUp.resourceClaims=[] is honored as explicit empty (not inherited)", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const claim = { kind: "node" as const, nodeId: "shared", mode: "write" as const };
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx, {
      resourceClaims: [claim],
    });

    const res = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbRowVersion,
        reason: "no claims needed",
        followUp: { type: "noop", title: "retry", resourceClaims: [] },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { followUpTask?: Task };
    expect(body.followUpTask?.resourceClaims).toEqual([]);
    ctx.closeAll();
  });

  it("without followUp → 200 with task only", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    const res = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion, reason: "no" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { task: Task; followUpTask?: Task };
    expect(body.task.status).toBe("FAILED");
    expect(body.followUpTask).toBeUndefined();
    ctx.closeAll();
  });
});

// ---------------------------------------------------------------------------
// OCC-loser orphaned-detail-event (Spec Review B1)
// ---------------------------------------------------------------------------

describe("OCC-loser orphaned detail event (Spec Review B1)", () => {
  it("two sequential rejects with same stale dbRowVersion: first wins, second's detail event still written, second gets 409", async () => {
    const ctx = makeInMemoryContext();
    const app = createServer(ctx);
    const { task, dbRowVersion } = await injectAwaitingReview(app, ctx);

    // First reject wins (status: AWAITING → FAILED; dbRowVersion bumps).
    const res1 = await app.request(`/api/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion, reason: "first attempt" }),
    });
    expect(res1.status).toBe(200);

    // Second reject with the same (now-stale) dbRowVersion.
    // It will:
    //   (a) load task (finds it FAILED) → wrong_status 409 (NOT version_conflict)
    //   (b) NOT reach appendEvent because the wrong_status check happens before
    //       the JSON parse + appendEvent path
    // To exercise D5's "detail event written before OCC check", we need a
    // scenario where the task is STILL AWAITING but the version is stale.
    // That requires a third task and a fresh stale-version request:
    const { task: t2, dbRowVersion: v2 } = await injectAwaitingReview(app, ctx);

    // Bump v2 from another approve route to make our v2 stale.
    // We'll directly mutate the row to simulate a concurrent writer.
    ctx.runner.store.updateTaskStatus(t2.id, {
      from: "AWAITING_HUMAN_REVIEW",
      to: "AWAITING_HUMAN_REVIEW", // no-op transition just bumps dbRowVersion
    });
    const stale = v2; // captured before the bump
    const eventsBeforeReject = ctx.runner.store.getEvents(t2.id);

    const res3 = await app.request(`/api/tasks/${t2.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion: stale, reason: "stale request" }),
    });
    expect(res3.status).toBe(409);
    const body3 = await res3.json() as { error: string; expected: number; actual: number };
    expect(body3.error).toBe("version_conflict");
    expect(body3.expected).toBe(stale);
    expect(body3.actual).toBe(stale + 1);

    // D5 verification: the detail event WAS written before the OCC check failed.
    const eventsAfterReject = ctx.runner.store.getEvents(t2.id);
    expect(eventsAfterReject.length).toBe(eventsBeforeReject.length + 1);
    const lastEvent = eventsAfterReject[eventsAfterReject.length - 1];
    expect(lastEvent?.kind).toBe("error");
    if (lastEvent?.kind === "error") {
      expect(lastEvent.message).toBe("rejected_with_details");
      expect(lastEvent.stack).toBe("stale request");
    }
    // No status_change to FAILED was appended (OCC lost).
    expect(ctx.runner.store.loadTask(t2.id)?.status).toBe("AWAITING_HUMAN_REVIEW");

    ctx.closeAll();
  });
});
