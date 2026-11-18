/**
 * Tests for validateProjectMetadata — pure validator for .ledger/project.json.
 *
 * Fixture-based tests only. The Vite singleton check left with the UI.
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProjectMetadata } from "../../src/project/validateProjectMetadata";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const require = createRequire(import.meta.url);

function fixtureJson(name: string): unknown {
  return require(join(fixturesDir, name)) as unknown;
}

function fixtureRaw(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

const conformant = fixtureJson("conformant.json");
const postImplementationGate = fixtureJson("post-implementation-gate.json");
const missingName = fixtureJson("missing-name.json");
const missingDocs = fixtureJson("missing-docs.json");
const missingAgent = fixtureJson("missing-agent.json");
const badSchemaVersion = fixtureJson("bad-schema-version.json");
const emptyAgent = fixtureJson("empty-agent.json");
const malformedRaw = fixtureRaw("malformed.json");

// ---------------------------------------------------------------------------
// Conformant fixture
// ---------------------------------------------------------------------------

describe("validateProjectMetadata — conformant fixture", () => {
  it("returns ok: true", () => {
    const result = validateProjectMetadata(conformant);
    expect(result.ok).toBe(true);
  });

  it("returns expected metadata fields", () => {
    const result = validateProjectMetadata(conformant);
    if (!result.ok) throw new Error("validation failed unexpectedly");
    expect(result.metadata.name).toBe("Test Project");
    expect(result.metadata.docs).toBe("docs");
    expect(result.metadata.agent).toBe("claude-code");
    expect(result.metadata.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// workflow.postImplementationGate (11-workflow-scripts/01-post-implementation-gate R6/A6)
// ---------------------------------------------------------------------------

describe("validateProjectMetadata — workflow.postImplementationGate fixture", () => {
  it("returns ok: true for a project.json with workflow.postImplementationGate.command set", () => {
    const result = validateProjectMetadata(postImplementationGate);
    expect(result.ok).toBe(true);
  });

  it("still returns ok: true for an existing project.json with no postImplementationGate (regression)", () => {
    const result = validateProjectMetadata(conformant);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing required fields
// ---------------------------------------------------------------------------

describe("validateProjectMetadata — missing-name fixture", () => {
  it("returns ok: false", () => {
    const result = validateProjectMetadata(missingName);
    expect(result.ok).toBe(false);
  });

  it("has at least one error with keyword 'required'", () => {
    const result = validateProjectMetadata(missingName);
    if (result.ok) throw new Error("expected validation failure");
    const requiredError = result.errors.find((e) => e.keyword === "required");
    expect(requiredError).toBeDefined();
  });
});

describe("validateProjectMetadata — missing-docs fixture", () => {
  it("returns ok: false", () => {
    const result = validateProjectMetadata(missingDocs);
    expect(result.ok).toBe(false);
  });

  it("has at least one error with keyword 'required'", () => {
    const result = validateProjectMetadata(missingDocs);
    if (result.ok) throw new Error("expected validation failure");
    const requiredError = result.errors.find((e) => e.keyword === "required");
    expect(requiredError).toBeDefined();
  });
});

describe("validateProjectMetadata — missing-agent fixture", () => {
  it("returns ok: false", () => {
    const result = validateProjectMetadata(missingAgent);
    expect(result.ok).toBe(false);
  });

  it("has at least one error with keyword 'required'", () => {
    const result = validateProjectMetadata(missingAgent);
    if (result.ok) throw new Error("expected validation failure");
    const requiredError = result.errors.find((e) => e.keyword === "required");
    expect(requiredError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Bad schema version (string "1" instead of number 1)
// ---------------------------------------------------------------------------

describe("validateProjectMetadata — bad-schema-version fixture", () => {
  it("returns ok: false", () => {
    const result = validateProjectMetadata(badSchemaVersion);
    expect(result.ok).toBe(false);
  });

  it("has at least one error", () => {
    const result = validateProjectMetadata(badSchemaVersion);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Empty agent string
// ---------------------------------------------------------------------------

describe("validateProjectMetadata — empty-agent fixture", () => {
  it("returns ok: false", () => {
    const result = validateProjectMetadata(emptyAgent);
    expect(result.ok).toBe(false);
  });

  it("has error related to minLength on agent", () => {
    const result = validateProjectMetadata(emptyAgent);
    if (result.ok) throw new Error("expected validation failure");
    const minLengthError = result.errors.find(
      (e) => e.keyword === "minLength" && e.path.includes("agent"),
    );
    expect(minLengthError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON (raw string, exercise JSON.parse failure)
// ---------------------------------------------------------------------------

describe("malformed JSON fixture", () => {
  it("fails JSON.parse", () => {
    expect(() => {
      const _ignored: unknown = JSON.parse(malformedRaw);
      return _ignored;
    }).toThrow(SyntaxError);
  });

  it("validateProjectMetadata rejects a non-object value", () => {
    const result = validateProjectMetadata(null);
    expect(result.ok).toBe(false);
  });
});
