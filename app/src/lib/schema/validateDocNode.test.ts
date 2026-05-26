/**
 * Tests for validateDocNode — ajv 2020-12 schema validator.
 *
 * Fixtures are imported as raw strings via Vite's ?raw query so the tests
 * run in the jsdom (client) environment without node:fs.
 *
 * Covers:
 * - Conformant candidate returns {ok: true, node}
 * - Missing required top-level fields return {ok: false, errors}
 * - Invalid status enum returns {ok: false, errors} with informative path/keyword
 * - Missing required sections returns {ok: false, errors}
 * - Invalid manifest-row status returns {ok: false, errors}
 * - Mixed-case status (normalized by extractor) validates fine
 * - annotated-status fixture validates fine with statusAnnotation
 * - Never throws on arbitrary unknown input
 */

import { describe, it, expect } from "vitest";
import { parseDocNode } from "./parseDocNode";
import { validateDocNode } from "./validateDocNode";

import conformantRaw from "./fixtures/conformant.md?raw";
import missingStatusRaw from "./fixtures/missing-status.md?raw";
import badStatusEnumRaw from "./fixtures/bad-status-enum.md?raw";
import missingSectionRaw from "./fixtures/missing-section.md?raw";
import malformedManifestRaw from "./fixtures/malformed-manifest.md?raw";
import annotatedStatusRaw from "./fixtures/annotated-status.md?raw";
import mixedCaseStatusRaw from "./fixtures/mixed-case-status.md?raw";

function parseAndValidate(docsRelPath: string, raw: string) {
  const candidate = parseDocNode(docsRelPath, raw);
  if (candidate === null) throw new Error(`parseDocNode returned null for ${docsRelPath}`);
  return validateDocNode(candidate);
}

// ---------------------------------------------------------------------------
// Conformant doc
// ---------------------------------------------------------------------------

describe("validateDocNode — conformant doc", () => {
  it("returns ok: true with a typed DocumentNode", () => {
    const result = parseAndValidate("01-ui/08-widget.md", conformantRaw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.node.nodeId).toBe("01-ui/08-widget");
      expect(result.node.status).toBe("APPROVED");
      expect(result.node.schemaVersion).toBe(1);
      expect(result.node.children).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Missing status field
// ---------------------------------------------------------------------------

describe("validateDocNode — missing-status fixture", () => {
  it("returns ok: false with errors", () => {
    const result = parseAndValidate("01-ui/09-missing.md", missingStatusRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      const hasStatusError = result.errors.some(
        (e) => e.keyword === "required" || e.path.includes("status") || e.keyword === "enum",
      );
      expect(hasStatusError).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bad status enum
// ---------------------------------------------------------------------------

describe("validateDocNode — bad-status-enum fixture", () => {
  it("returns ok: false with an enum error on /status", () => {
    const result = parseAndValidate("01-ui/10-bad.md", badStatusEnumRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const enumError = result.errors.find((e) => e.keyword === "enum" && e.path === "/status");
      expect(enumError).toBeDefined();
      expect(enumError?.message).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Missing sections
// ---------------------------------------------------------------------------

describe("validateDocNode — missing-section fixture", () => {
  it("returns ok: false when required sections are absent", () => {
    const result = parseAndValidate("01-ui/11-missing-sec.md", missingSectionRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const hasSectionError = result.errors.some(
        (e) => e.keyword === "required" && e.path.includes("sections"),
      );
      expect(hasSectionError).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Malformed manifest row status
// ---------------------------------------------------------------------------

describe("validateDocNode — malformed-manifest fixture", () => {
  it("returns ok: false when a manifest row has invalid status", () => {
    const result = parseAndValidate("01-ui/12-manifest.md", malformedManifestRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const enumError = result.errors.find(
        (e) => e.keyword === "enum" && e.path.includes("children"),
      );
      expect(enumError).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Mixed-case status normalization
// ---------------------------------------------------------------------------

describe("validateDocNode — mixed-case-status fixture", () => {
  it("validates 'Draft' (normalized to DRAFT by extractor) as ok: true", () => {
    const result = parseAndValidate("01-ui/14-mixed.md", mixedCaseStatusRaw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.node.status).toBe("DRAFT");
    }
  });
});

// ---------------------------------------------------------------------------
// Annotated status
// ---------------------------------------------------------------------------

describe("validateDocNode — annotated-status fixture", () => {
  it("validates APPROVED with statusAnnotation as ok: true", () => {
    const result = parseAndValidate("01-ui/13-annotated.md", annotatedStatusRaw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.node.status).toBe("APPROVED");
      expect(result.node.statusAnnotation).toBe("shell at VERIFY; round-2 panels planned");
    }
  });
});

// ---------------------------------------------------------------------------
// ValidationError shape
// ---------------------------------------------------------------------------

describe("validateDocNode — error shape", () => {
  it("errors have path, message, and keyword fields", () => {
    const result = parseAndValidate("01-ui/10-bad.md", badStatusEnumRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const err of result.errors) {
        expect(typeof err.path).toBe("string");
        expect(typeof err.message).toBe("string");
        expect(typeof err.keyword).toBe("string");
      }
    }
  });

  it("never throws on null input", () => {
    expect(() => validateDocNode(null)).not.toThrow();
  });

  it("never throws on number input", () => {
    expect(() => validateDocNode(42)).not.toThrow();
  });

  it("never throws on arbitrary object input", () => {
    expect(() => validateDocNode({ foo: "bar" })).not.toThrow();
  });
});
