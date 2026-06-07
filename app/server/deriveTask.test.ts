/**
 * Tests for applyParentStatusRollup — the parent/child status rollup that fixes
 * "operator_session reads COMPLETE while its sub-agents are still RUNNING"
 * (10-orchestration Open Issue, HIGH).
 */

import { describe, it, expect } from "vitest";
import { applyParentStatusRollup } from "./deriveTask.js";
import type { Task, TaskId, TaskStatus } from "../src/lib/types.js";

function task(id: TaskId, status: TaskStatus, parentTaskId?: TaskId): Task {
  return {
    id,
    type: id.startsWith("session:") ? "operator_session" : "agent_task",
    status,
    title: id,
    source: id.startsWith("session:") ? "operator_injected" : "agent_generated",
    parentTaskId,
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-06-07T00:00:00.000Z",
    completedAt: status === "COMPLETE" ? "2026-06-07T00:30:00.000Z" : undefined,
    transcriptPath: `/tmp/${id}.jsonl`,
  };
}

function statusOf(tasks: Task[], id: TaskId): TaskStatus | undefined {
  return tasks.find((t) => t.id === id)?.status;
}

describe("applyParentStatusRollup", () => {
  it("downgrades a COMPLETE parent to RUNNING when a child is still RUNNING", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "RUNNING", "session:a"),
      task("agent:2", "COMPLETE", "session:a"),
    ]);
    expect(statusOf(out, "session:a")).toBe("RUNNING");
  });

  it("downgrades to AWAITING_HUMAN_REVIEW when that is the least-complete child", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "AWAITING_HUMAN_REVIEW", "session:a"),
      task("agent:2", "COMPLETE", "session:a"),
    ]);
    expect(statusOf(out, "session:a")).toBe("AWAITING_HUMAN_REVIEW");
  });

  it("RUNNING outranks AWAITING_HUMAN_REVIEW across multiple children", () => {
    const out = applyParentStatusRollup([
      task("session:a", "AWAITING_HUMAN_REVIEW"),
      task("agent:1", "AWAITING_HUMAN_REVIEW", "session:a"),
      task("agent:2", "RUNNING", "session:a"),
    ]);
    expect(statusOf(out, "session:a")).toBe("RUNNING");
  });

  it("leaves a parent COMPLETE when all children are COMPLETE", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "COMPLETE", "session:a"),
      task("agent:2", "COMPLETE", "session:a"),
    ]);
    expect(statusOf(out, "session:a")).toBe("COMPLETE");
  });

  it("clears completedAt when a parent is downgraded off COMPLETE", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "RUNNING", "session:a"),
    ]);
    const parent = out.find((t) => t.id === "session:a");
    expect(parent?.status).toBe("RUNNING");
    expect(parent?.completedAt).toBeUndefined();
  });

  it("preserves completedAt when the parent stays COMPLETE", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "COMPLETE", "session:a"),
    ]);
    expect(out.find((t) => t.id === "session:a")?.completedAt).toBe("2026-06-07T00:30:00.000Z");
  });

  it("rolls up transitively through grandchildren", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "COMPLETE", "session:a"),
      task("agent:2", "RUNNING", "agent:1"), // grandchild still running
    ]);
    expect(statusOf(out, "agent:1")).toBe("RUNNING");
    expect(statusOf(out, "session:a")).toBe("RUNNING");
  });

  it("does not change a childless task", () => {
    const input = [task("session:a", "COMPLETE")];
    const out = applyParentStatusRollup(input);
    expect(out[0]).toBe(input[0]); // unchanged tasks are returned by reference
  });

  it("ignores parentTaskId pointing outside the set", () => {
    const out = applyParentStatusRollup([task("agent:1", "RUNNING", "session:missing")]);
    expect(statusOf(out, "agent:1")).toBe("RUNNING");
  });

  it("FAILED outranks COMPLETE so a failed child surfaces on the parent", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "FAILED", "session:a"),
    ]);
    expect(statusOf(out, "session:a")).toBe("FAILED");
  });

  it("ranks BLOCKED and PENDING above FAILED/COMPLETE per the table", () => {
    expect(
      statusOf(
        applyParentStatusRollup([
          task("session:a", "COMPLETE"),
          task("agent:1", "FAILED", "session:a"),
          task("agent:2", "BLOCKED", "session:a"),
        ]),
        "session:a",
      ),
    ).toBe("BLOCKED");
    expect(
      statusOf(
        applyParentStatusRollup([
          task("session:a", "FAILED"),
          task("agent:1", "PENDING", "session:a"),
        ]),
        "session:a",
      ),
    ).toBe("PENDING");
  });

  it("rolls up a 3-level chain (exercises the memo path)", () => {
    const out = applyParentStatusRollup([
      task("session:a", "COMPLETE"),
      task("agent:1", "COMPLETE", "session:a"),
      task("agent:2", "COMPLETE", "agent:1"),
      task("agent:3", "AWAITING_HUMAN_REVIEW", "agent:2"), // deepest is least-complete
    ]);
    expect(statusOf(out, "agent:2")).toBe("AWAITING_HUMAN_REVIEW");
    expect(statusOf(out, "agent:1")).toBe("AWAITING_HUMAN_REVIEW");
    expect(statusOf(out, "session:a")).toBe("AWAITING_HUMAN_REVIEW");
  });
});
