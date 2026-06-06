/**
 * Tests for renderPrompt and defaultResourceClaims registry.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8
 */

import { describe, it, expect } from "vitest";
import { renderPrompt, defaultResourceClaims, isPersona } from "../../../src/dispatcher/prompts/index.js";
import type { Task, TaskType } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

// ---------------------------------------------------------------------------
// Deterministic fixtures (S2 fix — no crypto.randomUUID(), no os.cwd())
// ---------------------------------------------------------------------------

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

function makeTask(type: TaskType, overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    type,
    status: "PENDING",
    title: `Test ${type} task`,
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

const MOCK_CTX: ProjectContext = {
  projectRoot: PROJECT_ROOT,
  docsRoot: `${PROJECT_ROOT}/docs`,
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

// ---------------------------------------------------------------------------
// renderPrompt — covers all eight task types
// ---------------------------------------------------------------------------

const DISPATCHER_TYPES: TaskType[] = [
  "implement", "spec_review", "verify", "spec_draft",
  "reverify", "doc_refactor", "issue_triage", "project_status_review",
  "doc_decompose",
];

describe("renderPrompt", () => {
  it.each(DISPATCHER_TYPES)("returns non-empty string for type=%s", (type) => {
    const task = makeTask(type);
    const result = renderPrompt(task, MOCK_CTX);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("every rendered prompt includes the task ID", () => {
    for (const type of DISPATCHER_TYPES) {
      const task = makeTask(type);
      const result = renderPrompt(task, MOCK_CTX);
      expect(result).toContain(TASK_ID);
    }
  });

  it("every rendered prompt includes the project root", () => {
    for (const type of DISPATCHER_TYPES) {
      const task = makeTask(type);
      const result = renderPrompt(task, MOCK_CTX);
      expect(result).toContain(PROJECT_ROOT);
    }
  });

  it("throws for non-dispatcher type noop", () => {
    const task = makeTask("noop");
    expect(() => renderPrompt(task, MOCK_CTX)).toThrow(/no template for non-dispatcher task type/);
  });

  it("throws for non-dispatcher type human_review", () => {
    const task = makeTask("human_review");
    expect(() => renderPrompt(task, MOCK_CTX)).toThrow(/no template for non-dispatcher task type/);
  });

  it("throws for non-dispatcher type operator_session", () => {
    const task = makeTask("operator_session");
    expect(() => renderPrompt(task, MOCK_CTX)).toThrow(/no template for non-dispatcher task type/);
  });

  it("throws for non-dispatcher type agent_task", () => {
    const task = makeTask("agent_task");
    expect(() => renderPrompt(task, MOCK_CTX)).toThrow(/no template for non-dispatcher task type/);
  });
});

// ---------------------------------------------------------------------------
// isPersona narrowing
// ---------------------------------------------------------------------------

describe("isPersona", () => {
  it("returns true for each dispatcher type", () => {
    for (const type of DISPATCHER_TYPES) {
      expect(isPersona(type)).toBe(true);
    }
  });

  it("returns false for noop", () => { expect(isPersona("noop")).toBe(false); });
  it("returns false for human_review", () => { expect(isPersona("human_review")).toBe(false); });
  it("returns false for operator_session", () => { expect(isPersona("operator_session")).toBe(false); });
  it("returns false for agent_task", () => { expect(isPersona("agent_task")).toBe(false); });
});

// ---------------------------------------------------------------------------
// defaultResourceClaims — prescribed shapes per type
// ---------------------------------------------------------------------------

describe("defaultResourceClaims", () => {
  it("implement → single write claim on task.id", () => {
    const task = makeTask("implement");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "write" },
    ]);
  });

  it("spec_draft → single write claim on task.id", () => {
    const task = makeTask("spec_draft");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "write" },
    ]);
  });

  it("doc_refactor → single write claim on task.id", () => {
    const task = makeTask("doc_refactor");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "write" },
    ]);
  });

  it("issue_triage → single write claim on task.id", () => {
    const task = makeTask("issue_triage");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "write" },
    ]);
  });

  it("doc_decompose → single write claim on task.id (never family-broadened)", () => {
    const task = makeTask("doc_decompose");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "write" },
    ]);
  });

  it("spec_review → single read claim on task.id", () => {
    const task = makeTask("spec_review");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "read" },
    ]);
  });

  it("verify without parentTaskId → single read claim", () => {
    const task = makeTask("verify");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "read" },
    ]);
  });

  it("verify with parentTaskId → dual read claims", () => {
    const parentId = "00000000-0000-0000-0000-000000000002";
    const task = makeTask("verify", { parentTaskId: parentId });
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "read" },
      { kind: "node", nodeId: parentId, mode: "read" },
    ]);
  });

  it("reverify without parentTaskId → single read claim", () => {
    const task = makeTask("reverify");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "read" },
    ]);
  });

  it("reverify with parentTaskId → dual read claims", () => {
    const parentId = "00000000-0000-0000-0000-000000000002";
    const task = makeTask("reverify", { parentTaskId: parentId });
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: TASK_ID, mode: "read" },
      { kind: "node", nodeId: parentId, mode: "read" },
    ]);
  });

  it("project_status_review → read claim on '00-project' (not task.id)", () => {
    const task = makeTask("project_status_review");
    expect(defaultResourceClaims(task)).toEqual([
      { kind: "node", nodeId: "00-project", mode: "read" },
    ]);
  });

  it("noop → empty array", () => {
    const task = makeTask("noop");
    expect(defaultResourceClaims(task)).toEqual([]);
  });

  it("human_review → empty array", () => {
    const task = makeTask("human_review");
    expect(defaultResourceClaims(task)).toEqual([]);
  });
});
