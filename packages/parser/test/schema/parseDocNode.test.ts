/**
 * Tests for parseDocNode — pure markdown → candidate JSON extractor.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocNode } from "../../src/schema/parseDocNode";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

const conformantRaw = fixture("conformant.md");
const missingStatusRaw = fixture("missing-status.md");
const annotatedStatusRaw = fixture("annotated-status.md");
const mixedCaseStatusRaw = fixture("mixed-case-status.md");
const malformedManifestRaw = fixture("malformed-manifest.md");

// ---------------------------------------------------------------------------
// Path filtering
// ---------------------------------------------------------------------------

describe("parseDocNode — path filtering", () => {
  it("returns null for underscore-prefixed folders (_process/, _investigations/)", () => {
    expect(parseDocNode("_process/leaf-workflow.md", "# Leaf Workflow")).toBeNull();
    expect(parseDocNode("_investigations/some-finding.md", "# Finding")).toBeNull();
  });

  it("returns null for _schemas/ paths", () => {
    expect(parseDocNode("_schemas/document-node.schema.json", "{}")).toBeNull();
  });

  it("returns null for root doc (00-project.md)", () => {
    expect(parseDocNode("00-project.md", "# Project")).toBeNull();
  });

  it("returns null for parent docs (<dir>/00-<slug>.md)", () => {
    expect(parseDocNode("01-ui/00-ui.md", "# UI Parent")).toBeNull();
  });

  it("returns null for nested parent docs", () => {
    expect(parseDocNode("01-ui/02-dag/00-dag.md", "# Dag Parent")).toBeNull();
  });

  it("returns non-null for a regular leaf doc", () => {
    expect(parseDocNode("01-ui/08-widget.md", conformantRaw)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Conformant doc extraction
// ---------------------------------------------------------------------------

describe("parseDocNode — conformant doc", () => {
  const result = parseDocNode("01-ui/08-widget.md", conformantRaw) as Record<string, unknown>;

  it("injects schemaVersion: 1", () => {
    expect(result["schemaVersion"]).toBe(1);
  });

  it("extracts nodeId from path", () => {
    expect(result["nodeId"]).toBe("01-ui/08-widget");
  });

  it("extracts parentId as 01-ui", () => {
    expect(result["parentId"]).toBe("01-ui");
  });

  it("extracts title from first # heading", () => {
    expect(result["title"]).toBe("Widget Panel");
  });

  it("extracts status as APPROVED (already uppercase)", () => {
    expect(result["status"]).toBe("APPROVED");
  });

  it("extracts created date", () => {
    expect(result["created"]).toBe("2026-05-01");
  });

  it("extracts lastUpdated date", () => {
    expect(result["lastUpdated"]).toBe("2026-05-10");
  });

  it("extracts dependencies array", () => {
    expect(result["dependencies"]).toEqual(["01-ui/02-dag"]);
  });

  it("sections object has all seven required headings", () => {
    const sections = result["sections"] as Record<string, string>;
    expect(sections).toHaveProperty("Requirements");
    expect(sections).toHaveProperty("Design");
    expect(sections).toHaveProperty("Decisions");
    expect(sections).toHaveProperty("Open Issues");
    expect(sections).toHaveProperty("Implementation Notes");
    expect(sections).toHaveProperty("Verification");
    expect(sections).toHaveProperty("Children");
  });

  it("children is empty array for 'None.'", () => {
    expect(result["children"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Status normalization
// ---------------------------------------------------------------------------

describe("parseDocNode — status normalization", () => {
  it("normalizes mixed-case 'Draft' to 'DRAFT'", () => {
    const result = parseDocNode("01-ui/14-mixed.md", mixedCaseStatusRaw) as Record<string, unknown>;
    expect(result["status"]).toBe("DRAFT");
  });

  it("extracts statusAnnotation from parenthetical", () => {
    const result = parseDocNode("01-ui/13-annotated.md", annotatedStatusRaw) as Record<string, unknown>;
    expect(result["status"]).toBe("APPROVED");
    expect(result["statusAnnotation"]).toBe("shell at VERIFY; round-2 panels planned");
  });

  it("does not include statusAnnotation when no parenthetical", () => {
    const result = parseDocNode("01-ui/08-widget.md", conformantRaw) as Record<string, unknown>;
    expect(result).not.toHaveProperty("statusAnnotation");
  });
});

// ---------------------------------------------------------------------------
// Missing / absent fields
// ---------------------------------------------------------------------------

describe("parseDocNode — missing fields", () => {
  it("returns empty dependencies array when Dependencies line has '—'", () => {
    const result = parseDocNode("01-ui/13-annotated.md", annotatedStatusRaw) as Record<string, unknown>;
    expect(result["dependencies"]).toEqual([]);
  });

  it("still returns a candidate when Status is absent (missing-status fixture)", () => {
    const result = parseDocNode("01-ui/09-missing.md", missingStatusRaw);
    // Not null — the extractor doesn't validate; the validator does
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Children manifest
// ---------------------------------------------------------------------------

describe("parseDocNode — children manifest", () => {
  it("parses manifest rows with relId, title, dependsOn, status", () => {
    const result = parseDocNode("01-ui/12-manifest.md", malformedManifestRaw) as Record<string, unknown>;
    const children = result["children"] as Array<Record<string, unknown>>;
    expect(children).toHaveLength(1);
    const first = children[0] ?? {};
    expect(first["relId"]).toBe("child-a");
    expect(first["title"]).toBe("Child A");
    expect(first["dependsOn"]).toEqual([]);
    // normalizeStatus("BADSTATUS") → "BADSTATUS" (validator will reject it)
    expect(first["status"]).toBe("BADSTATUS");
  });
});

// ---------------------------------------------------------------------------
// parentId derivation
// ---------------------------------------------------------------------------

describe("parseDocNode — parentId derivation", () => {
  const topLevelRaw = `# Lone Doc

**Status:** DRAFT
**Created:** 2026-05-01
**Last Updated:** 2026-05-10
**Dependencies:** —

## Requirements
r
## Design
d
## Decisions
d
## Open Issues
o
## Implementation Notes
i
## Verification
v
## Children
None.
`;

  it("derives parentId 'root' for top-level doc when no Parent field", () => {
    const result = parseDocNode("lone-doc.md", topLevelRaw) as Record<string, unknown>;
    expect(result["parentId"]).toBe("root");
  });

  it("derives parentId from path segments for nested doc without Parent field", () => {
    const result = parseDocNode("01-ui/02-dag.md", topLevelRaw) as Record<string, unknown>;
    expect(result["parentId"]).toBe("01-ui");
  });
});
