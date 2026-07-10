/**
 * Tests for buildDocGraph — pure function over rawDocs.
 *
 * Uses in-memory fixtures (no import.meta.glob required).
 */

import { describe, it, expect } from "vitest";
import { buildDocGraph } from "../../src/docs/buildDocGraph";
import type { NodeStatus } from "../../src/coreTypes";

const ALL_STATUSES: NodeStatus[] = [
  "DRAFT",
  "SPEC_REVIEW",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFY",
  "COMPLETE",
  "ISSUE_OPEN",
  "PLANNED",
  "DEFERRED",
  "DEPRECATED",
];

// Minimal conformant leaf doc markdown
function makeLeaf(opts: {
  nodeId: string;
  parentId?: string;
  status?: string;
  deps?: string;
  childRows?: string;
}): string {
  const { nodeId, parentId, status = "APPROVED", deps = "—", childRows = "None." } = opts;
  const parentField = parentId ? `**Parent:** \`${parentId}\`\n` : "";
  return `# ${nodeId} Doc

**Status:** ${status}
${parentField}**Created:** 2026-05-01
**Last Updated:** 2026-05-01
**Dependencies:** ${deps}

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
${childRows}
`;
}

// ---------------------------------------------------------------------------
// Basic build — single leaf
// ---------------------------------------------------------------------------

describe("buildDocGraph — single leaf", () => {
  const rawDocs: Record<string, string> = {
    "01-ui/02-dag.md": makeLeaf({ nodeId: "DAG Panel", parentId: "01-ui" }),
  };
  const result = buildDocGraph(rawDocs);

  it("produces exactly one authored node", () => {
    expect(result.nodes.filter((n) => n.authored)).toHaveLength(1);
  });

  it("node id is derived from path", () => {
    const node = result.nodes.find((n) => n.id === "01-ui/02-dag");
    expect(node).toBeDefined();
  });

  it("validationErrorPaths is empty for a conformant doc", () => {
    expect(result.validationErrorPaths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Parent manifest rows surface manifest-only children
// ---------------------------------------------------------------------------

describe("buildDocGraph — manifest-only children", () => {
  const parentMd = `# UI Parent

**Node ID:** \`01-ui\`
**Status:** APPROVED
**Created:** 2026-05-01
**Last Updated:** 2026-05-01

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

| \`01-shell\` | Shell | — | COMPLETE |
| \`02-dag\` | DAG Panel | \`01-shell\` | APPROVED |
`;

  const rawDocs: Record<string, string> = {
    "01-ui/00-ui.md": parentMd,
    "01-ui/02-dag.md": makeLeaf({ nodeId: "DAG Panel", parentId: "01-ui" }),
  };

  const result = buildDocGraph(rawDocs);

  it("surfaces manifest-only child (01-shell) as an authored:false node", () => {
    const shellNode = result.nodes.find((n) => n.id === "01-ui/01-shell");
    expect(shellNode).toBeDefined();
    expect(shellNode?.authored).toBe(false);
    expect(shellNode?.status).toBe("COMPLETE");
  });

  it("attaches dependsOn from parent manifest to authored child", () => {
    const dagNode = result.nodes.find((n) => n.id === "01-ui/02-dag");
    expect(dagNode).toBeDefined();
    expect(dagNode?.dependsOn).toEqual(["01-ui/01-shell"]);
  });

  it("no validation errors", () => {
    expect(result.validationErrorPaths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bare parent references — `**Parent:** 35` (no backticks) must resolve
// against sibling node ids by exact or `35-slug`/`35.slug` prefix match.
// ---------------------------------------------------------------------------

// Leaf doc with a raw (non-backticked) Parent field value.
function makeLeafBareParent(parentValue: string): string {
  return makeLeaf({ nodeId: "X" }).replace(
    "**Created:**",
    `**Parent:** ${parentValue}\n**Created:**`,
  );
}

describe("buildDocGraph — bare parent reference resolution", () => {
  it("resolves a bare numeric parent to the unique prefix-matching top-level sibling", () => {
    const rawDocs: Record<string, string> = {
      "35-time-stepping.md": makeLeaf({ nodeId: "Tectonics" }),
      "66-felsic-sink.md": makeLeafBareParent("35"),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "66-felsic-sink");
    expect(node?.parentId).toBe("35-time-stepping");
  });

  it("resolves an exact bare id match", () => {
    const rawDocs: Record<string, string> = {
      "35-time-stepping.md": makeLeaf({ nodeId: "Tectonics" }),
      "66-felsic-sink.md": makeLeafBareParent("35-time-stepping"),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "66-felsic-sink");
    expect(node?.parentId).toBe("35-time-stepping");
  });

  it("resolves `00-project` to root", () => {
    const rawDocs: Record<string, string> = {
      "20-world-dup.md": makeLeafBareParent("00-project"),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "20-world-dup");
    expect(node?.parentId).toBe("root");
  });

  it("falls back to path-derived parent when the reference is ambiguous", () => {
    const rawDocs: Record<string, string> = {
      "35-time-stepping.md": makeLeaf({ nodeId: "Tectonics A" }),
      "35-other.md": makeLeaf({ nodeId: "Tectonics B" }),
      "66-felsic-sink.md": makeLeafBareParent("35"),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "66-felsic-sink");
    expect(node?.parentId).toBe("root");
  });

  it("falls back to path-derived parent when the reference matches nothing", () => {
    const rawDocs: Record<string, string> = {
      "66-felsic-sink.md": makeLeafBareParent("99"),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "66-felsic-sink");
    expect(node?.parentId).toBe("root");
  });

  it("resolves within the referencing node's own directory scope", () => {
    const rawDocs: Record<string, string> = {
      "29-validation/25-precipitation.md": makeLeaf({ nodeId: "Precipitation" }),
      "29-validation/26-child.md": makeLeafBareParent("25"),
      "25-top-level.md": makeLeaf({ nodeId: "Unrelated" }),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "29-validation/26-child");
    expect(node?.parentId).toBe("29-validation/25-precipitation");
  });

  it("resolves an unresolvable backticked parent that names the project root doc", () => {
    const rawDocs: Record<string, string> = {
      "20-world-dup.md": makeLeaf({ nodeId: "World Dup", parentId: "docs/00-project.md" }),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "20-world-dup");
    expect(node?.parentId).toBe("root");
  });

  it("prose parent field still falls back to path-derived parent", () => {
    const rawDocs: Record<string, string> = {
      "20-world-dup.md": makeLeafBareParent("to be decided later"),
    };
    const result = buildDocGraph(rawDocs);
    const node = result.nodes.find((n) => n.id === "20-world-dup");
    expect(node?.parentId).toBe("root");
  });
});

// ---------------------------------------------------------------------------
// normalizeStatus — every NodeStatus value must round-trip without falling
// back to DRAFT. Guards against KNOWN_STATUSES omissions.
// ---------------------------------------------------------------------------

describe("buildDocGraph — normalizeStatus round-trips all NodeStatus values", () => {
  for (const status of ALL_STATUSES) {
    it(`preserves ${status}`, () => {
      const rawDocs: Record<string, string> = {
        "01-ui/02-dag.md": makeLeaf({ nodeId: "DAG Panel", parentId: "01-ui", status }),
      };
      const result = buildDocGraph(rawDocs);
      const node = result.nodes.find((n) => n.id === "01-ui/02-dag");
      expect(node?.status).toBe(status);
    });
  }
});
