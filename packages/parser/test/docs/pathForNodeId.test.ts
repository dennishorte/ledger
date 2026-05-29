/**
 * Tests for pathForNodeId — resolves a NodeId back to its source path.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Design
 * "pathForNodeId requires a new parser-side export"
 */

import { describe, it, expect } from "vitest";
import { pathForNodeId } from "../../src/docs/buildDocGraph";
import type { DocNode } from "../../src/docs/types";

function makeNode(
  id: string,
  opts: { source?: string; authored?: boolean } = {},
): DocNode {
  return {
    id,
    parentId: null,
    title: id,
    status: "APPROVED",
    dependsOn: [],
    authored: opts.authored ?? (opts.source !== undefined),
    source: opts.source,
  };
}

describe("pathForNodeId", () => {
  it("returns the source path for a known node id", () => {
    const nodes: DocNode[] = [
      makeNode("01-ui", { source: "docs/01-ui/00-ui.md" }),
      makeNode("06-agent-dispatcher/04-prompt-templates", {
        source: "docs/06-agent-dispatcher/04-prompt-templates.md",
      }),
    ];
    expect(pathForNodeId(nodes, "01-ui")).toBe("docs/01-ui/00-ui.md");
    expect(pathForNodeId(nodes, "06-agent-dispatcher/04-prompt-templates")).toBe(
      "docs/06-agent-dispatcher/04-prompt-templates.md",
    );
  });

  it("returns undefined for an unknown node id", () => {
    const nodes: DocNode[] = [makeNode("01-ui", { source: "docs/01-ui/00-ui.md" })];
    expect(pathForNodeId(nodes, "99-does-not-exist")).toBeUndefined();
  });

  it("returns undefined for a synthetic node (no source property)", () => {
    // Synthetic nodes have authored: false and no source — they exist in the graph
    // because a parent manifest row referenced them, but no .md file backs them.
    const nodes: DocNode[] = [
      { id: "06-agent-dispatcher/03-claude-code-executor", parentId: "06-agent-dispatcher",
        title: "03-claude-code-executor", status: "PLANNED", dependsOn: [], authored: false },
    ];
    expect(pathForNodeId(nodes, "06-agent-dispatcher/03-claude-code-executor")).toBeUndefined();
  });

  it("returns undefined for an empty node array", () => {
    expect(pathForNodeId([], "01-ui")).toBeUndefined();
  });

  it("returns the first match when multiple nodes have the same id (defensive)", () => {
    // Should not happen in practice, but the function walks linearly and returns the first hit.
    const nodes: DocNode[] = [
      makeNode("dup", { source: "docs/first.md" }),
      makeNode("dup", { source: "docs/second.md" }),
    ];
    expect(pathForNodeId(nodes, "dup")).toBe("docs/first.md");
  });
});
