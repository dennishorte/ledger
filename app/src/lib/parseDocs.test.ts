/**
 * parseDocs.test.ts — integration test for loadDocNodes() against the real docs/ tree.
 *
 * Closes PRD §11 finding: "No parseDocs.test.ts — the UI's entire view of the
 * world derives from this parser; a regex regression silently invalidates every
 * panel."
 *
 * Asserts:
 * 1. loadDocNodes() returns a non-empty array (≥ the current authored leaf count).
 * 2. No console.error calls are made during the call (zero validation errors).
 * 3. Every authored node has the required DocNode fields.
 * 4. idForPath() correctly maps known doc paths to NodeIds.
 */

import { describe, it, expect } from "vitest";
import { loadDocNodes, idForPath, docValidationErrorPaths } from "./parseDocs";

describe("parseDocs — loadDocNodes against real docs/ tree", () => {
  it("returns a non-empty DocNode array", () => {
    const nodes = loadDocNodes();
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("docValidationErrorPaths is empty for the real tree", () => {
    // Canonical zero-validation-errors assertion. The console.error path is
    // exercised at module evaluation (parseDocs caches its result in a
    // singleton), so a per-test console.error spy would always observe zero
    // calls vacuously — the singleton array is the meaningful surface.
    expect(docValidationErrorPaths).toHaveLength(0);
  });

  it("returns at least 10 authored leaf nodes (current tree)", () => {
    const nodes = loadDocNodes();
    const authoredLeaves = nodes.filter((n) => n.authored);
    // The tree currently has: 02-schema + 10 UI panels + any backend nodes = ≥ 10
    expect(authoredLeaves.length).toBeGreaterThanOrEqual(10);
  });

  it("every authored node has required DocNode fields", () => {
    const nodes = loadDocNodes();
    for (const node of nodes.filter((n) => n.authored)) {
      expect(typeof node.id).toBe("string");
      expect(node.id.length).toBeGreaterThan(0);
      expect(typeof node.title).toBe("string");
      expect(typeof node.status).toBe("string");
      expect(Array.isArray(node.dependsOn)).toBe(true);
      expect(typeof node.authored).toBe("boolean");
    }
  });

  it("nodes are sorted by id (stable output)", () => {
    const nodes = loadDocNodes();
    const ids = nodes.map((n) => n.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("root node is present with parentId null", () => {
    const nodes = loadDocNodes();
    const root = nodes.find((n) => n.id === "root");
    expect(root).toBeDefined();
    expect(root?.parentId).toBeNull();
  });

  it("02-schema node is present (this spec's own node)", () => {
    const nodes = loadDocNodes();
    const schemaNode = nodes.find((n) => n.id === "02-schema");
    expect(schemaNode).toBeDefined();
    expect(schemaNode?.authored).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// idForPath helper
// ---------------------------------------------------------------------------

describe("parseDocs — idForPath", () => {
  it("maps docs/00-project.md to root", () => {
    expect(idForPath("docs/00-project.md")).toBe("root");
  });

  it("maps docs/02-schema.md to 02-schema", () => {
    expect(idForPath("docs/02-schema.md")).toBe("02-schema");
  });

  it("maps docs/01-ui/02-dag.md to 01-ui/02-dag", () => {
    expect(idForPath("docs/01-ui/02-dag.md")).toBe("01-ui/02-dag");
  });

  it("maps docs/01-ui/00-ui.md to 01-ui (parent doc)", () => {
    expect(idForPath("docs/01-ui/00-ui.md")).toBe("01-ui");
  });

  it("returns null for underscore-prefixed folders (docs/_process/, docs/_investigations/)", () => {
    expect(idForPath("docs/_process/leaf-workflow.md")).toBeNull();
    expect(idForPath("docs/_investigations/dispatcher-hang-issue.md")).toBeNull();
  });

  it("returns null for unrecognised input", () => {
    expect(idForPath("src/lib/parseDocs.ts")).toBeNull();
  });

  it("accepts optional ./docs/ prefix", () => {
    expect(idForPath("./docs/02-schema.md")).toBe("02-schema");
  });
});
