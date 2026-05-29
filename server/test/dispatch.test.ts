/**
 * Tests for POST /api/dispatch/:nodeId endpoint.
 *
 * Uses the same in-memory ProjectContext pattern as hitl.test.ts.
 * The context's docs array is seeded with synthetic DocNode fixtures.
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Requirements item 8 (dispatch)
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
import type { DocNode } from "@ledger/parser";
import type { Task } from "@ledger/parser";

function makeDocNode(overrides: Partial<DocNode> & { id: string; status: DocNode["status"] }): DocNode {
  return {
    id: overrides.id,
    parentId: null,
    title: `Node ${overrides.id}`,
    status: overrides.status,
    dependsOn: [],
    authored: overrides.authored ?? true,
    source: `docs/${overrides.id}.md`,
    ...overrides,
  };
}

function makeInMemoryContext(docs: readonly DocNode[] = []): ProjectContext & { closeAll: () => void } {
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
    docs,
    resolveDocPath: () => undefined,
  };
  return { ...ctx, closeAll: () => { runner.close(); } };
}

describe("POST /api/dispatch/:nodeId", () => {
  it("404 on unknown nodeId", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "06-agent-dispatcher/05-dispatch-api", status: "APPROVED" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/nonexistent-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string; nodeId: string };
    expect(body.error).toBe("node_not_found");
    expect(body.nodeId).toBe("nonexistent-node");
    ctx.closeAll();
  });

  it("409 no_inferred_type on IN_PROGRESS node", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "my-node", status: "IN_PROGRESS" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/my-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; nodeStatus: string; hint: string };
    expect(body.error).toBe("no_inferred_type");
    expect(body.nodeStatus).toBe("IN_PROGRESS");
    expect(body.hint).toMatch(/IN_PROGRESS/);
    ctx.closeAll();
  });

  it("409 no_inferred_type on COMPLETE node with actionable hint", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "done-node", status: "COMPLETE" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/done-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; hint: string };
    expect(body.error).toBe("no_inferred_type");
    expect(body.hint).toMatch(/COMPLETE/);
    ctx.closeAll();
  });

  it("409 no_inferred_type on PLANNED node with draft-first hint", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "planned-node", status: "PLANNED" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/planned-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; hint: string };
    expect(body.error).toBe("no_inferred_type");
    expect(body.hint).toMatch(/PLANNED/);
    ctx.closeAll();
  });

  it("409 no_inferred_type on SPEC_REVIEW node with wait-for-review hint", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "review-node", status: "SPEC_REVIEW" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/review-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; hint: string };
    expect(body.error).toBe("no_inferred_type");
    expect(body.hint).toMatch(/SPEC_REVIEW/);
    ctx.closeAll();
  });

  it("APPROVED → implement task inferred; returns 201 with task", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "leaf-node", status: "APPROVED" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/leaf-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("implement");
    expect(body.task.title).toBe("Dispatch implement on leaf-node");
    expect(body.task.source).toBe("operator_injected");
    expect(body.task.agent?.model).toBe("claude-code");
    expect(body.task.agent?.persona).toBe("implement");
    // default claim: single write on the node id
    expect(body.task.resourceClaims).toEqual([{ kind: "node", nodeId: "leaf-node", mode: "write" }]);
    ctx.closeAll();
  });

  it("VERIFY → verify task inferred with read claim", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "verify-node", status: "VERIFY" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/verify-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("verify");
    expect(body.task.resourceClaims).toEqual([{ kind: "node", nodeId: "verify-node", mode: "read" }]);
    ctx.closeAll();
  });

  it("DRAFT → spec_review task inferred with read claim", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "draft-node", status: "DRAFT" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/draft-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("spec_review");
    expect(body.task.resourceClaims).toEqual([{ kind: "node", nodeId: "draft-node", mode: "read" }]);
    ctx.closeAll();
  });

  it("explicit type override in body overrides inference", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "some-node", status: "APPROVED" })]);
    const app = createServer(ctx);

    // Dispatch an APPROVED node but override type to spec_review
    const res = await app.request("/api/dispatch/some-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spec_review" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("spec_review");
    ctx.closeAll();
  });

  it("explicit type override allows dispatch on non-dispatchable status", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "complete-node", status: "COMPLETE" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/complete-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "doc_refactor" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("doc_refactor");
    ctx.closeAll();
  });

  it("explicit resourceClaims in body override defaults", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "claim-node", status: "APPROVED" })]);
    const app = createServer(ctx);

    const customClaims = [
      { kind: "node" as const, nodeId: "custom-node", mode: "read" as const },
      { kind: "node" as const, nodeId: "another-node", mode: "write" as const },
    ];

    const res = await app.request("/api/dispatch/claim-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceClaims: customClaims }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.resourceClaims).toEqual(customClaims);
    ctx.closeAll();
  });

  it("priority in body is forwarded to the created task", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "prio-node", status: "APPROVED" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/prio-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: 10 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.priority).toBe(10);
    ctx.closeAll();
  });

  it("201 with no body (missing JSON) — uses defaults", async () => {
    const ctx = makeInMemoryContext([makeDocNode({ id: "no-body-node", status: "APPROVED" })]);
    const app = createServer(ctx);

    const res = await app.request("/api/dispatch/no-body-node", { method: "POST" });
    expect(res.status).toBe(201);
    const body = await res.json() as { task: Task };
    expect(body.task.type).toBe("implement");
    ctx.closeAll();
  });
});
