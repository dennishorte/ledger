import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectContext, ContextError } from "../src/context.js";

const fixturesDir = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__");
const sampleProject = resolve(fixturesDir, "sample-project");
const escapeProject = resolve(fixturesDir, "escape-project");
const invalidMetadataProject = resolve(fixturesDir, "invalid-metadata-project");

describe("loadProjectContext", () => {
  it("happy path: loads valid project metadata", async () => {
    const ctx = await loadProjectContext({ projectPath: sampleProject, port: 0 });
    ctx.store.close();
    expect(ctx.project.name).toBe("Sample Project");
    expect(ctx.project.docs).toBe("docs");
    expect(ctx.projectRoot).toBe(sampleProject);
    expect(ctx.docsRoot).toBe(resolve(sampleProject, "docs"));
    expect(ctx.port).toBe(0);
    expect(ctx.startedAt).toMatch(/^\d{4}-/);
  });

  it("rejects a missing project path (no .ledger/project.json)", async () => {
    await expect(
      loadProjectContext({ projectPath: "/nonexistent/path/does/not/exist", port: 0 }),
    ).rejects.toThrow(ContextError);
  });

  it("rejects missing .ledger/project.json with ContextError mentioning 'missing'", async () => {
    await expect(
      loadProjectContext({ projectPath: "/nonexistent/path/does/not/exist", port: 0 }),
    ).rejects.toThrow(/missing/i);
  });

  it("rejects schema-invalid metadata with ContextError carrying validation errors (Implementation Review SF)", async () => {
    // invalid-metadata-project's .ledger/project.json is valid JSON but missing the required `name` field.
    // This exercises the `if (!result.ok) throw new ContextError(..., result.errors)` branch in loadProjectContext
    // — distinct from path-containment (which fires after metadata validation passes).
    let caught: ContextError | null = null;
    try {
      await loadProjectContext({ projectPath: invalidMetadataProject, port: 0 });
    } catch (e) {
      if (e instanceof ContextError) caught = e;
      else throw e;
    }
    if (caught === null) {
      throw new Error("expected loadProjectContext to throw ContextError but it resolved");
    }
    expect(caught.message).toMatch(/invalid project metadata/i);
    expect(caught.errors.length).toBeGreaterThan(0);
    expect(caught.errors.some((err) => /name/.test(err.path) || /name/.test(err.message))).toBe(true);
  });

  it("rejects docs field that escapes project root (Spec Review S4)", async () => {
    await expect(
      loadProjectContext({ projectPath: escapeProject, port: 0 }),
    ).rejects.toThrow(/path escapes/i);
  });

  it("ContextError has the correct name", async () => {
    try {
      await loadProjectContext({ projectPath: "/nonexistent", port: 0 });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ContextError);
      expect((e as ContextError).name).toBe("ContextError");
    }
  });
});
