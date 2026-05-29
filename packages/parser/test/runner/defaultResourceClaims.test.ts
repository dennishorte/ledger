/**
 * Tests for defaultResourceClaims — one case per task type + noop/human_review fallthrough.
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Promote defaultResourceClaims to @ledger/parser
 */

import { describe, it, expect } from "vitest";
import { defaultResourceClaims } from "../../src/runner/defaultResourceClaims.js";
import type { Task } from "../../src/runner/types.js";

/** Minimal Task shape — defaultResourceClaims only reads id, type, parentTaskId. */
function makeTask(type: Task["type"], id = "test-node-id", parentTaskId?: string): Pick<Task, "id" | "type" | "parentTaskId"> {
  return { id, type, parentTaskId };
}

describe("defaultResourceClaims", () => {
  it("implement → single write claim on task.id", () => {
    const claims = defaultResourceClaims(makeTask("implement", "01-ui/02-dag"));
    expect(claims).toEqual([{ kind: "node", nodeId: "01-ui/02-dag", mode: "write" }]);
  });

  it("spec_draft → single write claim on task.id", () => {
    const claims = defaultResourceClaims(makeTask("spec_draft", "06-agent-dispatcher/05-dispatch-api"));
    expect(claims).toEqual([{ kind: "node", nodeId: "06-agent-dispatcher/05-dispatch-api", mode: "write" }]);
  });

  it("doc_refactor → single write claim on task.id", () => {
    const claims = defaultResourceClaims(makeTask("doc_refactor", "01-ui/03-docs"));
    expect(claims).toEqual([{ kind: "node", nodeId: "01-ui/03-docs", mode: "write" }]);
  });

  it("issue_triage → single write claim on task.id", () => {
    const claims = defaultResourceClaims(makeTask("issue_triage", "00-project"));
    expect(claims).toEqual([{ kind: "node", nodeId: "00-project", mode: "write" }]);
  });

  it("spec_review → single read claim on task.id (not write)", () => {
    const claims = defaultResourceClaims(makeTask("spec_review", "06-agent-dispatcher/05-dispatch-api"));
    expect(claims).toEqual([{ kind: "node", nodeId: "06-agent-dispatcher/05-dispatch-api", mode: "read" }]);
  });

  it("verify without parentTaskId → single read claim on task.id", () => {
    const claims = defaultResourceClaims(makeTask("verify", "06-agent-dispatcher/05-dispatch-api"));
    expect(claims).toEqual([{ kind: "node", nodeId: "06-agent-dispatcher/05-dispatch-api", mode: "read" }]);
  });

  it("verify with parentTaskId → two read claims: task.id + parentTaskId", () => {
    const claims = defaultResourceClaims(makeTask("verify", "06-agent-dispatcher/05-dispatch-api", "parent-task-uuid"));
    expect(claims).toEqual([
      { kind: "node", nodeId: "06-agent-dispatcher/05-dispatch-api", mode: "read" },
      { kind: "node", nodeId: "parent-task-uuid", mode: "read" },
    ]);
  });

  it("reverify without parentTaskId → single read claim on task.id", () => {
    const claims = defaultResourceClaims(makeTask("reverify", "some-node"));
    expect(claims).toEqual([{ kind: "node", nodeId: "some-node", mode: "read" }]);
  });

  it("reverify with parentTaskId → two read claims", () => {
    const claims = defaultResourceClaims(makeTask("reverify", "some-node", "parent-uuid"));
    expect(claims).toEqual([
      { kind: "node", nodeId: "some-node", mode: "read" },
      { kind: "node", nodeId: "parent-uuid", mode: "read" },
    ]);
  });

  it("project_status_review → single read claim on '00-project' (not task.id)", () => {
    const claims = defaultResourceClaims(makeTask("project_status_review", "any-task-id"));
    expect(claims).toEqual([{ kind: "node", nodeId: "00-project", mode: "read" }]);
  });

  it("noop → empty claims (fallthrough)", () => {
    const claims = defaultResourceClaims(makeTask("noop", "whatever"));
    expect(claims).toEqual([]);
  });

  it("human_review → empty claims (fallthrough)", () => {
    const claims = defaultResourceClaims(makeTask("human_review", "whatever"));
    expect(claims).toEqual([]);
  });

  it("operator_session → empty claims (fallthrough)", () => {
    const claims = defaultResourceClaims(makeTask("operator_session", "whatever"));
    expect(claims).toEqual([]);
  });

  it("agent_task → empty claims (fallthrough)", () => {
    const claims = defaultResourceClaims(makeTask("agent_task", "whatever"));
    expect(claims).toEqual([]);
  });
});
