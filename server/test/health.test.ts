import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadProjectContext } from "../src/index.js";

const sampleProject = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__", "sample-project");

describe("GET /api/_health", () => {
  it("returns 200 with ok: true and startedAt", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/_health");
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; startedAt: string };
    expect(body.ok).toBe(true);
    expect(typeof body.startedAt).toBe("string");
    expect(body.startedAt).toMatch(/^\d{4}-/);
  });

  it("startedAt matches the project context startedAt", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/_health");
    const body = await res.json() as { ok: boolean; startedAt: string };
    expect(body.startedAt).toBe(project.startedAt);
  });

  it("includes a dispatcher field with status 'ready' and a numeric activeSessions count", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/_health");
    const body = await res.json() as {
      ok: boolean;
      startedAt: string;
      dispatcher: { status: string; activeSessions: number };
    };
    expect(body.dispatcher).toBeDefined();
    expect(body.dispatcher.status).toBe("ready");
    expect(typeof body.dispatcher.activeSessions).toBe("number");
    expect(body.dispatcher.activeSessions).toBeGreaterThanOrEqual(0);
  });
});
