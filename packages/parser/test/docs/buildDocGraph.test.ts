/**
 * Tests for buildDocGraph — pure function over rawDocs.
 *
 * Uses in-memory fixtures (no import.meta.glob required).
 */

import { describe, it, expect } from "vitest";
import { buildDocGraph } from "../../src/docs/buildDocGraph";

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
