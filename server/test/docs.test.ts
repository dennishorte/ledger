import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadProjectContext } from "../src/index.js";

const fixturePath = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__", "sample-project");
const escapeFixturePath = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__", "escape-project");

describe("GET /api/docs", () => {
  it("returns 200 with nodes and validation envelope", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    const body = await res.json() as { nodes: unknown[]; validation: { errorPaths: string[] } };
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(body.validation.errorPaths)).toBe(true);
  });

  it("includes 02-broken.md in errorPaths (deliberately invalid fixture)", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs");
    const body = await res.json() as { nodes: { id: string }[]; validation: { errorPaths: string[] } };
    expect(body.validation.errorPaths).toContain("02-broken.md");
  });

  it("S5: _schemas/ignored.md does not appear in nodes or errorPaths", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs");
    const body = await res.json() as { nodes: { id: string }[]; validation: { errorPaths: string[] } };
    const nodeIds = body.nodes.map((n) => n.id);
    expect(nodeIds).not.toContain("_schemas/ignored");
    expect(body.validation.errorPaths).not.toContain("_schemas/ignored.md");
  });

  it("S5: _process/ignored.md does not appear in nodes or errorPaths", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs");
    const body = await res.json() as { nodes: { id: string }[]; validation: { errorPaths: string[] } };
    const nodeIds = body.nodes.map((n) => n.id);
    expect(nodeIds).not.toContain("_process/ignored");
    expect(body.validation.errorPaths).not.toContain("_process/ignored.md");
  });
});

describe("GET /api/docs/:nodeId", () => {
  it("returns 200 for a valid leaf", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/01-leaf");
    expect(res.status).toBe(200);
    const body = await res.json() as { node: { nodeId: string } };
    expect(body.node.nodeId).toBe("01-leaf");
  });

  it("returns 404 for a nonexistent id", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("node not found");
  });

  it("returns 422 for an id that exists but fails validation", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/02-broken");
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: unknown[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("S3: returns 404 with error: not_a_leaf for a root/parent doc", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    // 00-project.md maps to nodeId "root" via idForPath; request /api/docs/root to exercise not_a_leaf path
    const res = await app.request("/api/docs/root");
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("not_a_leaf");
  });

  it("handles multi-segment nodeIds via the :nodeId{.+} matcher", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/subdir/03-nested");
    expect(res.status).toBe(200);
    const body = await res.json() as { node: { nodeId: string } };
    expect(body.node.nodeId).toBe("subdir/03-nested");
  });
});

describe("loadProjectContext path containment (Spec Review S4)", () => {
  it("rejects a docs field containing path-traversal segments", async () => {
    await expect(
      loadProjectContext({ projectPath: escapeFixturePath, port: 0 }),
    ).rejects.toThrow(/path escapes/i);
  });
});
