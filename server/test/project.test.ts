import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadProjectContext } from "../src/index.js";

const sampleProject = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__", "sample-project");

describe("GET /api/project", () => {
  it("returns 200 with validated project metadata and server envelope", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 4180 });
    const app = createServer(project);
    const res = await app.request("/api/project");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      project: { name: string; docs: string; agent: string; schemaVersion: number };
      server: { projectRoot: string; docsRoot: string; port: number; startedAt: string };
    };
    expect(body.project.name).toBe("Sample Project");
    expect(body.project.docs).toBe("docs");
    expect(body.project.agent).toBe("claude-code");
    expect(body.project.schemaVersion).toBe(1);
    expect(body.server.projectRoot).toBe(sampleProject);
    expect(body.server.docsRoot).toBe(resolve(sampleProject, "docs"));
    expect(body.server.port).toBe(4180);
    expect(typeof body.server.startedAt).toBe("string");
  });

  it("server envelope port matches the context port", async () => {
    const project = await loadProjectContext({ projectPath: sampleProject, port: 9999 });
    const app = createServer(project);
    const res = await app.request("/api/project");
    const body = await res.json() as { server: { port: number } };
    expect(body.server.port).toBe(9999);
  });
});
