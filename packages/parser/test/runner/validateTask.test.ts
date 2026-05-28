/**
 * validateTask round-trip tests.
 *
 * Verifies acceptance of all valid Task shapes and rejection of malformed inputs.
 */

import { describe, expect, it } from "vitest";
import { validateTask } from "../../src/runner/validateTask.js";
import type { Task } from "../../src/runner/types.js";

const VALID_TASK: Task = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  type: "noop",
  status: "PENDING",
  title: "Test task",
  source: "operator_injected",
  dependsOn: [],
  resourceClaims: [],
  dbRowVersion: 0,
  priority: 0,
  createdAt: "2026-05-27T10:00:00.000Z",
};

describe("validateTask", () => {
  it("accepts a minimal valid Task", () => {
    const result = validateTask(VALID_TASK);
    expect(result.ok).toBe(true);
  });

  it("accepts a Task with all optional fields", () => {
    const full: Task = {
      ...VALID_TASK,
      type: "human_review",
      status: "AWAITING_HUMAN_REVIEW",
      source: "agent_generated",
      parentTaskId: "parent-uuid",
      dependsOn: ["dep-uuid"],
      resourceClaims: [
        { kind: "node", nodeId: "01-leaf", mode: "write" },
        { kind: "path", path: "/some/file.ts", mode: "read" },
      ],
      agent: { model: "claude-opus-4-5", persona: "coder" },
      reviewPayload: { summary: "Needs review", diffRef: "abc123" },
      dbRowVersion: 5,
      priority: 10,
      startedAt: "2026-05-27T10:01:00.000Z",
      completedAt: "2026-05-27T10:02:00.000Z",
      transcriptPath: "/path/to/session.jsonl",
    };
    const result = validateTask(full);
    expect(result.ok).toBe(true);
  });

  it("accepts all TaskType values", () => {
    const types: Task["type"][] = [
      "spec_draft", "spec_review", "implement", "verify",
      "doc_refactor", "issue_triage", "human_review", "reverify",
      "project_status_review", "operator_session", "agent_task", "noop",
    ];
    for (const type of types) {
      const result = validateTask({ ...VALID_TASK, type });
      expect(result.ok).toBe(true);
    }
  });

  it("accepts all TaskStatus values", () => {
    const statuses: Task["status"][] = [
      "PENDING", "RUNNING", "BLOCKED", "AWAITING_HUMAN_REVIEW",
      "COMPLETE", "FAILED", "CANCELLED",
    ];
    for (const status of statuses) {
      const result = validateTask({ ...VALID_TASK, status });
      expect(result.ok).toBe(true);
    }
  });

  it("rejects missing required field 'type'", () => {
    const { type: _type, ...noType } = VALID_TASK;
    const result = validateTask(noType);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /type/.test(e.path) || /type/.test(e.message))).toBe(true);
    }
  });

  it("rejects invalid status string", () => {
    const result = validateTask({ ...VALID_TASK, status: "UNKNOWN_STATUS" });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid type string", () => {
    const result = validateTask({ ...VALID_TASK, type: "not_a_real_type" });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateTask(null).ok).toBe(false);
    expect(validateTask("string").ok).toBe(false);
    expect(validateTask(42).ok).toBe(false);
  });

  it("rejects malformed resourceClaims (missing mode)", () => {
    const result = validateTask({
      ...VALID_TASK,
      resourceClaims: [{ kind: "node", nodeId: "some-id" }], // missing mode
    });
    expect(result.ok).toBe(false);
  });

  it("rejects negative dbRowVersion", () => {
    const result = validateTask({ ...VALID_TASK, dbRowVersion: -1 });
    expect(result.ok).toBe(false);
  });
});
