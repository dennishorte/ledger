/**
 * Tests for the doc_decompose prompt template.
 *
 * The decisive test is the round-trip: render the prompt, extract the child
 * skeleton it hands the agent, and run it through the real @ledger/parser
 * validator. This guards the two defects the first live decompose hit —
 * children dropped from the graph for a missing `## Children` section and a
 * missing `**Last Updated:**` date (validateDocNode → /sections, /lastUpdated).
 */

import { describe, it, expect } from "vitest";
import { parseDocNode, validateDocNode } from "@ledger/parser";
import render from "../../../src/dispatcher/prompts/docDecompose.js";
import type { Task, DocNode } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const TARGET = "01-ui/02-dag";

const task: Task = {
  id: TASK_ID,
  type: "doc_decompose",
  status: "PENDING",
  title: "Test doc_decompose task",
  source: "operator_injected",
  dependsOn: [],
  // The single write claim the fixed dispatch route emits — primaryNodeId reads it.
  resourceClaims: [{ kind: "node", nodeId: TARGET, mode: "write" }],
  dbRowVersion: 0,
  priority: 0,
  createdAt: "2026-05-28T00:00:00.000Z",
};

const ctx: ProjectContext = {
  projectRoot: "/project",
  docsRoot: "/project/docs",
  project: { schemaVersion: 1, name: "Test", docs: "docs", agent: "claude-code" },
  port: 4180,
  startedAt: "2026-05-28T00:00:00.000Z",
  store: null as unknown as ProjectContext["store"],
  runner: null as unknown as ProjectContext["runner"],
  mcp: null as unknown as ProjectContext["mcp"],
  binding: null as unknown as ProjectContext["binding"],
  docs: [],
  resolveDocPath: () => undefined,
};

// A ctx whose doc graph resolves the target node at a given lifecycle status,
// so the template can branch on it (D12 status-aware decompose).
function ctxWithTarget(status: DocNode["status"]): ProjectContext {
  const node: DocNode = {
    id: TARGET,
    parentId: "01-ui",
    title: "DAG Panel",
    status,
    dependsOn: [],
    authored: true,
    source: `docs/${TARGET}.md`,
  };
  return {
    ...ctx,
    docs: [node],
    resolveDocPath: (id) => (id === TARGET ? `docs/${TARGET}.md` : undefined),
  };
}

describe("docDecompose template", () => {
  it("anchors the prompt on the dispatched target node (primaryNodeId)", () => {
    const out = render(task, ctx);
    expect(out).toContain(`docs/${TARGET}/<NN>-<slug>.md`);
    expect(out).toContain(`\`${TARGET}/01-example\``);
  });

  it("spells out the full schema contract", () => {
    const out = render(task, ctx);
    for (const section of [
      "Requirements", "Design", "Decisions", "Open Issues",
      "Implementation Notes", "Verification", "Children",
    ]) {
      expect(out).toContain(section);
    }
    expect(out).toContain("**Created:**");
    expect(out).toContain("**Last Updated:**");
    // parent manifest row shape + leaf-child Children body
    expect(out).toContain("| Child | Title | Depends on | Status |");
    expect(out).toContain("None.");
  });

  it("its child skeleton validates against the real DocumentNode schema", () => {
    const out = render(task, ctx);

    const m = out.match(/```markdown\n([\s\S]*?)\n```/);
    if (m === null || m[1] === undefined) {
      throw new Error("prompt must contain a ```markdown child skeleton");
    }
    const skeleton: string = m[1];

    // The skeleton's Node ID is `${TARGET}/01-example`; parseDocNode derives the
    // id from the path we pass, so they must agree.
    const candidate = parseDocNode(`${TARGET}/01-example.md`, skeleton);
    expect(candidate, "skeleton must parse as a node candidate").not.toBeNull();

    const result = validateDocNode(candidate);
    if (!result.ok) {
      throw new Error(
        "skeleton failed schema validation: " + JSON.stringify(result.errors, null, 2),
      );
    }
    expect(result.ok).toBe(true);
  });

  it("Mode A default (unresolved target): PLANNED children, ends with complete_task", () => {
    // base ctx has docs:[] → target status unresolved → safe forward/PLANNED case
    const out = render(task, ctx);
    expect(out).toContain("**Status:** PLANNED");
    expect(out).toContain(
      "Emit `runner.complete_task` only after every file is written and committed.",
    );
    expect(out).not.toContain("do NOT call `runner.complete_task`");
  });

  it("Mode B (COMPLETE target): children inherit COMPLETE; split routes through human_review", () => {
    const out = render(task, ctxWithTarget("COMPLETE"));
    expect(out).toContain("**Status:** COMPLETE");
    expect(out).toContain("runner.await_human_review");
    expect(out).toContain("do NOT call `runner.complete_task`");
    expect(out).toContain("reorganizing existing documentation");

    // the COMPLETE skeleton must still validate against the real schema
    const m = out.match(/```markdown\n([\s\S]*?)\n```/);
    if (m === null || m[1] === undefined) {
      throw new Error("prompt must contain a ```markdown child skeleton");
    }
    const candidate = parseDocNode(`${TARGET}/01-example.md`, m[1]);
    const result = validateDocNode(candidate);
    if (!result.ok) {
      throw new Error(
        "COMPLETE skeleton failed schema validation: " +
          JSON.stringify(result.errors, null, 2),
      );
    }
    expect(result.ok).toBe(true);
  });

  it("refuses to decompose an IN_PROGRESS target", () => {
    const out = render(task, ctxWithTarget("IN_PROGRESS"));
    expect(out).toContain("Stop — do not decompose");
    expect(out).toContain("IN_PROGRESS");
    expect(out).toContain("runner.await_human_review");
    // no child skeleton — the agent must stop before writing anything
    expect(out).not.toContain("```markdown");
  });
});
