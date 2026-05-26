/**
 * loadProjectMetadata.test.ts — fixture-based tests for the project metadata
 * validator, plus an assertion that the real .ledger/project.json passes.
 *
 * Design note: production loader uses direct Vite JSON import (build-time).
 * Tests call validateProjectMetadata(parsed) directly with fixture content —
 * the same ajv compile path, but without the Vite module system. The malformed
 * fixture is loaded as a raw string (import "...?raw") so JSON.parse failure
 * can be exercised explicitly without breaking the Vite build.
 */

import { describe, it, expect } from "vitest";
import { validateProjectMetadata, projectMetadata } from "./loadProjectMetadata";

// Fixtures — valid JSON files loaded as typed objects
import conformant from "./fixtures/conformant.json" with { type: "json" };
import missingName from "./fixtures/missing-name.json" with { type: "json" };
import missingDocs from "./fixtures/missing-docs.json" with { type: "json" };
import missingAgent from "./fixtures/missing-agent.json" with { type: "json" };
import badSchemaVersion from "./fixtures/bad-schema-version.json" with { type: "json" };
import emptyAgent from "./fixtures/empty-agent.json" with { type: "json" };

// malformed.json is not valid JSON — load as raw string to exercise JSON.parse failure
import malformedRaw from "./fixtures/malformed.json?raw";

// ---------------------------------------------------------------------------
// Real artifact — must validate successfully
// ---------------------------------------------------------------------------

describe("projectMetadata singleton (real .ledger/project.json)", () => {
  it("validates successfully", () => {
    expect(projectMetadata.ok).toBe(true);
  });

  it("has name 'Ledger'", () => {
    if (!projectMetadata.ok) throw new Error("validation failed unexpectedly");
    expect(projectMetadata.metadata.name).toBe("Ledger");
  });

  it("has docs 'docs'", () => {
    if (!projectMetadata.ok) throw new Error("validation failed unexpectedly");
    expect(projectMetadata.metadata.docs).toBe("docs");
  });

  it("has agent 'claude-code'", () => {
    if (!projectMetadata.ok) throw new Error("validation failed unexpectedly");
    expect(projectMetadata.metadata.agent).toBe("claude-code");
  });

  it("has schemaVersion 1", () => {
    if (!projectMetadata.ok) throw new Error("validation failed unexpectedly");
    expect(projectMetadata.metadata.schemaVersion).toBe(1);
  });
});

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
      // JSON.parse returns any; discard the return value explicitly.
      const _ignored: unknown = JSON.parse(malformedRaw);
      return _ignored;
    }).toThrow(SyntaxError);
  });

  it("validateProjectMetadata rejects a non-object value", () => {
    // After a failed parse we'd have nothing valid — validate a clearly-wrong
    // input (null) to show the validator handles non-object gracefully.
    const result = validateProjectMetadata(null);
    expect(result.ok).toBe(false);
  });
});
