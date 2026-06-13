import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadProjectContext } from "../src/index.js";

const sampleProject = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__", "sample-project");

describe("GET /api/health/issues", () => {
  it("returns 200 with an issues array", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/health/issues");
    expect(res.status).toBe(200);
    const body = await res.json() as { issues: unknown[] };
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("each IssueItem has nodeId, text, priority, sectionSlug fields", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/health/issues");
    const body = await res.json() as { issues: { nodeId: string; text: string; priority: string; sectionSlug: string }[] };
    // 04-issues.md fixture contributes 3 items
    expect(body.issues.length).toBeGreaterThan(0);
    for (const item of body.issues) {
      expect(typeof item.nodeId).toBe("string");
      expect(typeof item.text).toBe("string");
      expect(typeof item.priority).toBe("string");
      expect(item.sectionSlug).toBe("open-issues");
    }
  });

  it("issues are sorted HIGH before MEDIUM before LOW", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/health/issues");
    const body = await res.json() as { issues: { priority: string }[] };
    const priorities = body.issues.map((i) => i.priority);
    const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, TRIVIAL: 3, UNKNOWN: 4 };
    for (let i = 0; i < priorities.length - 1; i++) {
      const a = order[priorities[i] ?? ""] ?? 4;
      const b = order[priorities[i + 1] ?? ""] ?? 4;
      expect(a).toBeLessThanOrEqual(b);
    }
  });

  it("returns empty issues array when no nodes have open issues (01-leaf has none)", async () => {
    // The sample project's 01-leaf.md says "None." in Open Issues —
    // only authored nodes with actual bullet items contribute IssueItems.
    // This test guards that nodes without bullet items produce 0 items.
    const project = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/health/issues");
    const body = await res.json() as { issues: { nodeId: string }[] };
    const leafItems = body.issues.filter((i) => i.nodeId === "01-leaf");
    expect(leafItems.length).toBe(0);
  });
});

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
